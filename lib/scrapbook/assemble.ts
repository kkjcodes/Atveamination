import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { uploadBlob } from "@/lib/storage/client"
import { publicPath, ffprobeBinary } from "@/lib/paths"
import {
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  OUTPUT_FPS,
  PAGE_HOLD_SECONDS,
  TRANSITION_SECONDS,
  XFADE_TRANSITION,
  KENBURNS_SECONDS,
  ASSET_PAGE_BG,
  ASSET_CAPTION_FONT,
} from "@/lib/scrapbook/config"

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}
ffmpeg.setFfprobePath(ffprobeBinary())

// Stage 5: compositing + scrapbook export. Pure ffmpeg — testable offline.
//
// Layout: 1920×1080 page background; clip scaled to ~1200px wide, white
// photo border, slight rotation, caption in handwriting font. Pages joined
// with xfade page-turn approximation (MVP — true 3D curl is a v2).

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download (${res.status}): ${url}`)
  await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()))
}

function captionFontPath(): string {
  return publicPath(ASSET_CAPTION_FONT)
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

// Fallback page motion: gentle zoom/pan on a still. Upscale-first avoids the
// zoompan jitter that shows up on smaller inputs.
export async function kenBurnsClip(stillLocalPath: string, outputPath: string): Promise<void> {
  const w = OUTPUT_WIDTH
  const h = OUTPUT_HEIGHT
  const frames = Math.round(KENBURNS_SECONDS * OUTPUT_FPS)
  const vf = [
    `scale=iw*2:ih*2`,
    `zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${Math.floor(w / 2) * 2}x${Math.floor(h / 2) * 2}:fps=${OUTPUT_FPS}`,
    `scale=${w}:${h}`,
  ].join(",")

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(stillLocalPath).inputOptions(["-loop", "1"])
      .videoFilters(vf)
      .outputOptions([
        "-t", KENBURNS_SECONDS.toFixed(3),
        "-pix_fmt", "yuv420p",
        "-r", String(OUTPUT_FPS),
        // Speed over compression — on Container Apps 1vCPU medium preset was
        // ~3-4x slower than ultrafast and pushed total assembly past the
        // 240s ingress cap. Size delta on ~4s clips is negligible.
        "-preset", "ultrafast",
      ])
      .output(outputPath)
      .on("error", reject)
      .on("end", () => resolve())
      .run()
  })
}

function escapeDrawtext(text: string): string {
  // drawtext is picky about : ' \ % — escape defensively.
  return text
    .replace(/\\/g, "")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
}

// Composite one clip (or Ken Burns still) onto the page background with
// border, slight rotation, and caption. Output is exactly PAGE_HOLD_SECONDS.
export async function composePage(
  clipLocalPath: string,
  caption: string,
  outputPath: string,
  hasBackground: boolean,
  hasFont: boolean,
): Promise<void> {
  const w = OUTPUT_WIDTH
  const h = OUTPUT_HEIGHT
  const hold = PAGE_HOLD_SECONDS

  const captionFilter = caption
    ? `,drawtext=text='${escapeDrawtext(caption)}':${
        hasFont ? `fontfile='${captionFontPath()}'` : `font='sans'`
      }:fontsize=64:fontcolor=0x4a3b2a:x=(w-text_w)/2:y=h-170:borderw=0`
    : ""

  // Scale by height (not width) so the photo + border fit inside 1080-tall bg.
  // -2:900 → 900px tall (any aspect), plus 48px border = 948px total → leaves
  // ~66px top/bottom margin. Previous scale=1200:-2 overflowed and clipped the
  // photo top/bottom on square inputs.
  const filterComplex = [
    `[1:v]scale=-2:900,setsar=1,pad=iw+48:ih+48:24:24:white,rotate=0.026:c=none:ow=rotw(0.026):oh=roth(0.026)[photo]`,
    `[0:v]scale=${w}:${h},setsar=1[bg]`,
    `[bg][photo]overlay=(W-w)/2:(H-h)/2-40:shortest=0${captionFilter},trim=duration=${hold},fps=${OUTPUT_FPS},format=yuv420p[v]`,
  ].join(";")

  const cmd = ffmpeg()
  if (hasBackground) {
    cmd.input(publicPath(ASSET_PAGE_BG)).inputOptions(["-loop", "1"])
  } else {
    cmd.input(`color=c=0xF5EBDC:s=${w}x${h}:r=${OUTPUT_FPS}`).inputOptions(["-f", "lavfi"])
  }
  cmd.input(clipLocalPath).inputOptions(["-stream_loop", "-1"])
  cmd.complexFilter(filterComplex)
    .outputOptions(["-map", "[v]", "-t", hold.toFixed(3), "-preset", "ultrafast"])
    .output(outputPath)

  await new Promise<void>((resolve, reject) => {
    cmd.on("error", reject).on("end", () => resolve()).run()
  })
}

// Chain xfade page-turn transitions across all page clips into one MP4.
async function joinPages(localPaths: string[], outputPath: string): Promise<void> {
  if (localPaths.length === 0) throw new Error("No pages to join")
  if (localPaths.length === 1) {
    await fs.copyFile(localPaths[0], outputPath)
    return
  }

  const hold = PAGE_HOLD_SECONDS
  const tr = TRANSITION_SECONDS
  const cmd = ffmpeg()
  for (const p of localPaths) cmd.input(p)

  const parts: string[] = []
  let prev = "0:v"
  for (let i = 1; i < localPaths.length; i++) {
    const offset = i * hold - i * tr
    const label = `x${i}`
    parts.push(
      `[${prev}][${i}:v]xfade=transition=${XFADE_TRANSITION}:duration=${tr}:offset=${offset.toFixed(3)}[${label}]`,
    )
    prev = label
  }
  const filterComplex = parts.join(";") + `;[${prev}]format=yuv420p[v]`

  cmd.complexFilter(filterComplex)
    .outputOptions(["-map", "[v]", "-r", String(OUTPUT_FPS), "-preset", "ultrafast"])
    .output(outputPath)

  await new Promise<void>((resolve, reject) => {
    cmd.on("error", reject).on("end", () => resolve()).run()
  })
}

// Public API: given per-page video/still URLs (already stored in blob) and
// captions, produce a single scrapbook MP4 uploaded to blob.
//
// Each "input" is either:
//   - kind: "clip" — a passing rendered clip URL
//   - kind: "still" — a stylized still URL (Ken Burns fallback)
export type PageInput = {
  caption: string
} & (
  | { kind: "clip"; url: string }
  | { kind: "still"; url: string }
)

export async function assembleScrapbook(
  pages: PageInput[],
  projectId: string,
): Promise<string> {
  if (pages.length === 0) throw new Error("assembleScrapbook: no pages")

  const tmp = tmpdir()
  const sessionId = `atve_scrap_${projectId}_${Date.now()}`
  const workDir = join(tmp, sessionId)
  await fs.mkdir(workDir, { recursive: true })

  const bgExists = await fileExists(publicPath(ASSET_PAGE_BG))
  const fontExists = await fileExists(publicPath(ASSET_CAPTION_FONT))

  console.log(`[scrapbook/assemble] project=${projectId} pages=${pages.length} bg=${bgExists} font=${fontExists}`)

  const pageMp4s: string[] = []
  const skipped: number[] = []
  const t0 = Date.now()

  try {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      const pageStart = Date.now()
      try {
        const localSource = join(workDir, `src_${i}${p.kind === "clip" ? ".mp4" : ".jpg"}`)
        const dlStart = Date.now()
        await downloadFile(p.url, localSource)
        const dlMs = Date.now() - dlStart

        let clipToCompose: string
        let kbMs = 0
        if (p.kind === "still") {
          clipToCompose = join(workDir, `kb_${i}.mp4`)
          const kbStart = Date.now()
          await kenBurnsClip(localSource, clipToCompose)
          kbMs = Date.now() - kbStart
        } else {
          clipToCompose = localSource
        }

        const pageOut = join(workDir, `page_${i}.mp4`)
        const compStart = Date.now()
        await composePage(clipToCompose, p.caption, pageOut, bgExists, fontExists)
        const compMs = Date.now() - compStart
        pageMp4s.push(pageOut)
        console.log(`[scrapbook/assemble] page ${i} OK (${p.kind}) — dl=${dlMs}ms kenburns=${kbMs}ms compose=${compMs}ms total=${Date.now() - pageStart}ms`)
      } catch (e) {
        // Isolate per-page failures — one bad page shouldn't kill the whole
        // scrapbook. Only fail the whole assembly if too few pages remain.
        skipped.push(i)
        console.error(`[scrapbook/assemble] page ${i} FAILED (${p.kind}), skipping:`, (e as Error)?.message)
      }
    }

    // Config allows 1-page scrapbooks (MIN_PAGES_PER_PROJECT=1). A blanket
    // "need ≥3" would break single-page projects. Instead: keep assembling as
    // long as at least one page produced output. If the input had ≥4 pages
    // and MORE THAN HALF failed, treat that as an infra issue and fail loudly
    // rather than delivering a broken scrapbook.
    if (pageMp4s.length === 0) {
      throw new Error(`Every page failed to assemble (${pages.length}/${pages.length})`)
    }
    if (pages.length >= 4 && pageMp4s.length * 2 < pages.length) {
      throw new Error(`Too many pages failed (${pageMp4s.length}/${pages.length} succeeded)`)
    }
    if (skipped.length > 0) {
      console.warn(`[scrapbook/assemble] proceeding with ${pageMp4s.length}/${pages.length} pages (skipped: ${skipped.join(",")})`)
    }

    const joinStart = Date.now()
    const finalOut = join(workDir, `scrapbook.mp4`)
    await joinPages(pageMp4s, finalOut)
    console.log(`[scrapbook/assemble] join ${pageMp4s.length} pages: ${Date.now() - joinStart}ms`)

    const uploadStart = Date.now()
    const buffer = await fs.readFile(finalOut)
    const url = await uploadBlob(`scrapbook/${projectId}/scrapbook.mp4`, buffer, "video/mp4")
    console.log(`[scrapbook/assemble] upload ${(buffer.length / 1024 / 1024).toFixed(1)}MiB: ${Date.now() - uploadStart}ms — total assembly ${Date.now() - t0}ms`)
    return url
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
