import { join } from "path"
import { tmpdir } from "os"
import { promises as fs } from "fs"
import { uploadBlob } from "@/lib/storage/client"
import type { AdScript, PaletteHint } from "@/lib/business/adscript-schema"
import { dimensionsFor, OUTPUT_FPS } from "@/lib/business/render/dimensions"
import { renderScene, runFfmpeg } from "@/lib/business/render/scene"
import { mixAudio, sceneOffsets } from "@/lib/business/render/audio-mix"
import { renderWatermarkOutro, WATERMARK_OUTRO_SEC } from "@/lib/business/render/watermark"
import { synthesize } from "@/lib/business/tts"
import { resolveMusicSource } from "@/lib/business/music-catalog"

// The pure-function contract from BUSINESS-FORK-HANDOFF.md §3:
//   (ad_script, assets) -> mp4
// No model calls inside the renderer beyond the pre-flight TTS synthesis for
// each scene's vo_text (which is cache-first). Once vo_clips exist, the
// render is fully deterministic — same inputs produce byte-identical output.

export type RenderAssets = {
  // asset_id → local path to a downloaded image (photo, logo, etc.).
  imagePaths: Map<string, string>
  captionFontPath: string | null   // /public/scrapbook/handwriting.ttf if present
}

export type RenderResult = {
  finalVideoUrl: string
  durationSec: number
  totalSceneDurations: number[]
}

// Palette hex per palette_hint. Used by bold_promo template's band color.
const PALETTE_HEX: Record<PaletteHint, string> = {
  warm:    "0xC2410C",   // amber-700
  cool:    "0x0369A1",   // sky-700
  neutral: "0x1F2937",   // slate-800
  bright:  "0xDB2777",   // pink-600
}

export async function renderAd(
  script: AdScript,
  assets: RenderAssets,
  adId: string,
): Promise<RenderResult> {
  const dims = dimensionsFor(script.aspect_ratio)
  const paletteBg = PALETTE_HEX[script.style.palette_hint]

  const sessionId = `atve_ad_${adId}_${Date.now()}`
  const workDir = join(tmpdir(), sessionId)
  await fs.mkdir(workDir, { recursive: true })

  const rt0 = Date.now()
  const rlog = (msg: string) => console.log(`[renderAd] ${adId} ${msg} elapsed=${((Date.now() - rt0) / 1000).toFixed(1)}s`)

  try {
    // ── 1. Per-scene TTS synthesis (cache-first) ────────────────────────────
    rlog("phase1 TTS start")
    const voResults: Array<{ audioUrl: string; audioPath: string; durationSec: number } | null> = []
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]
      const voText = scene.type === "end_card" ? (scene.vo_text ?? "") : scene.vo_text
      if (!voText || voText.trim() === "") {
        voResults.push(null)
        continue
      }
      const sceneStart = Date.now()
      const hint = scene.type !== "end_card" ? scene.pronunciation_hint : undefined
      const synth = await synthesize(script.audio.voice, voText, hint)
      // Download the cached URL to disk so ffmpeg can read it.
      const localPath = join(workDir, `vo_${i}.wav`)
      const res = await fetch(synth.audioUrl)
      await fs.writeFile(localPath, Buffer.from(await res.arrayBuffer()))
      voResults.push({ audioUrl: synth.audioUrl, audioPath: localPath, durationSec: synth.durationSec })
      console.log(`[renderAd] ${adId}  scene${i} tts+download cached=${synth.cached} took=${((Date.now() - sceneStart) / 1000).toFixed(1)}s`)
    }
    rlog("phase1 TTS done")

    // ── 2. Derived per-scene durations ──────────────────────────────────────
    // Audio-first rule (doc §3): seconds = max(min_seconds, vo_dur + 0.5)
    const sceneDurations = script.scenes.map((scene, i) => {
      const voDur = voResults[i]?.durationSec ?? 0
      return Math.max(scene.min_seconds, voDur > 0 ? voDur + 0.5 : scene.min_seconds)
    })
    const totalScenesSec = sceneDurations.reduce((a, b) => a + b, 0)

    // ── 3. Render each scene video ──────────────────────────────────────────
    rlog("phase3 scene renders start")
    const sceneVideos: string[] = []
    for (let i = 0; i < script.scenes.length; i++) {
      const sceneStart = Date.now()
      const scene = script.scenes[i]
      const durationSec = sceneDurations[i]
      const outPath = join(workDir, `scene_${i}.mp4`)

      // Resolve the source image: end_card prefers logo, falls back to a
      // synthetic parchment (scrapbook template renders it internally).
      let sourceImagePath: string
      if (scene.type === "end_card") {
        if (scene.logo_asset_id && assets.imagePaths.has(scene.logo_asset_id)) {
          sourceImagePath = assets.imagePaths.get(scene.logo_asset_id)!
        } else {
          // For non-scrapbook end_cards with no logo, we still need SOME
          // input for the -loop 1 path. Use a plain color asset generated
          // once at session start. scrapbook template ignores this.
          sourceImagePath = await ensureBlankBackground(workDir, dims.width, dims.height)
        }
      } else {
        const path = assets.imagePaths.get(scene.asset_id)
        if (!path) throw new Error(`Asset not downloaded: ${scene.asset_id}`)
        sourceImagePath = path
      }

      await renderScene({
        scene,
        sourceImagePath,
        durationSec,
        outputPath: outPath,
        width: dims.width,
        height: dims.height,
        templateFamily: script.template_family,
        captionFontPath: assets.captionFontPath,
        paletteBgHex: paletteBg,
        textPosition: script.style.text_position,
      })
      sceneVideos.push(outPath)
      console.log(`[renderAd] ${adId}  scene${i} render took=${((Date.now() - sceneStart) / 1000).toFixed(1)}s`)
    }
    rlog("phase3 scene renders done")

    // ── 4. Concat scenes (hard cuts for clean_modern/bold_promo;
    //       xfade page-turn for scrapbook)                                 ──
    const combinedScenesPath = join(workDir, "scenes_combined.mp4")
    if (script.template_family === "scrapbook") {
      await concatWithXfade(sceneVideos, sceneDurations, combinedScenesPath)
    } else {
      await concatHardCut(sceneVideos, combinedScenesPath)
    }
    rlog("phase4 concat done")

    // ── 5. Watermark outro ─────────────────────────────────────────────────
    const outroPath = join(workDir, "outro.mp4")
    await renderWatermarkOutro(dims.width, dims.height, assets.captionFontPath, outroPath)

    // Concat scenes + outro into the final silent video.
    const silentVideoPath = join(workDir, "silent_final.mp4")
    await concatHardCut([combinedScenesPath, outroPath], silentVideoPath)
    rlog("phase5 outro+concat done")

    // ── 6. Audio: TTS + music + duck + loudnorm ─────────────────────────────
    const totalVideoSec = totalScenesSec + WATERMARK_OUTRO_SEC
    const voClips = voResults.map((r, i) =>
      r ? { audioPath: r.audioPath, startOffsetSec: sceneOffsets(sceneDurations)[i] } : null,
    )
    // Resolve music: prefer blob URL from manifest.json, fall back to /public
    // local path. resolveMusicSource returns either an http(s) URL (fine for
    // ffmpeg to open directly) or an absolute local path. Missing → null.
    let musicSource = await resolveMusicSource(script.audio.music_id)
    if (musicSource && !musicSource.startsWith("http")) {
      // Local path — verify existence before handing to ffmpeg (missing files
      // fail more clearly this way).
      if (!(await fileExists(musicSource))) musicSource = null
    }

    const audioPath = join(workDir, "audio.m4a")
    await mixAudio(
      voClips,
      musicSource,
      script.audio.music_level,
      totalVideoSec,
      audioPath,
    )
    rlog("phase6 audio-mix done")

    // ── 7. Mux video + audio ────────────────────────────────────────────────
    const finalPath = join(workDir, "final.mp4")
    await runFfmpeg([
      "-y", "-v", "error",
      "-i", silentVideoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-movflags", "+faststart",
      finalPath,
    ])
    rlog("phase7 mux done")

    // ── 8. Upload ───────────────────────────────────────────────────────────
    const finalBuffer = await fs.readFile(finalPath)
    const finalVideoUrl = await uploadBlob(
      `business/ads/${adId}/render.mp4`,
      finalBuffer,
      "video/mp4",
    )
    rlog("phase8 upload done")

    return {
      finalVideoUrl,
      durationSec: totalVideoSec,
      totalSceneDurations: sceneDurations,
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function ensureBlankBackground(workDir: string, width: number, height: number): Promise<string> {
  const path = join(workDir, "_blank_bg.png")
  await runFfmpeg([
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=0x1C1917:s=${width}x${height}:d=1`,
    "-frames:v", "1",
    path,
  ])
  return path
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function concatHardCut(videoPaths: string[], outputPath: string): Promise<void> {
  const listPath = outputPath + ".txt"
  const listContent = videoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
  await fs.writeFile(listPath, listContent)
  try {
    await runFfmpeg([
      "-y", "-v", "error",
      "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outputPath,
    ])
  } finally {
    await fs.unlink(listPath).catch(() => {})
  }
}

async function concatWithXfade(videoPaths: string[], durations: number[], outputPath: string): Promise<void> {
  if (videoPaths.length === 1) {
    await fs.copyFile(videoPaths[0], outputPath)
    return
  }
  const tr = 0.5
  const args: string[] = ["-y", "-v", "error"]
  for (const p of videoPaths) args.push("-i", p)

  const parts: string[] = []
  let prev = "0:v"
  let acc = 0
  for (let i = 1; i < videoPaths.length; i++) {
    acc += durations[i - 1]
    const offset = acc - tr
    const label = `x${i}`
    parts.push(`[${prev}][${i}:v]xfade=transition=wipeleft:duration=${tr}:offset=${offset.toFixed(3)}[${label}]`)
    prev = label
  }
  args.push(
    "-filter_complex", parts.join(";") + `;[${prev}]format=yuv420p[v]`,
    "-map", "[v]",
    "-r", String(OUTPUT_FPS),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-movflags", "+faststart",
    outputPath,
  )
  await runFfmpeg(args)
}

// Convenience: helper used by the API route to download a set of Asset URLs
// into a local work dir keyed by asset_id.
export async function downloadAssetsToLocal(
  urlsByAssetId: Map<string, string>,
  workDir: string,
): Promise<Map<string, string>> {
  await fs.mkdir(workDir, { recursive: true })
  const paths = new Map<string, string>()
  for (const [assetId, url] of urlsByAssetId) {
    const path = join(workDir, `asset_${assetId}.jpg`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`asset fetch failed (${res.status}): ${assetId}`)
    await fs.writeFile(path, Buffer.from(await res.arrayBuffer()))
    paths.set(assetId, path)
  }
  return paths
}
