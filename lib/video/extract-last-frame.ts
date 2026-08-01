import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { uploadBlob } from "@/lib/storage/client"

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

// Extract the last frame of `videoUrl` and upload it as a JPEG to
// `scenes/<sceneId>/chunk_<index>_last.jpg`, returning the public URL. Used to
// seed the next WAN chunk with continuity from the previous one.
//
// `-sseof -0.1` seeks to 0.1s before end-of-file, `-frames:v 1` grabs one
// frame. Faster than -ss + probe(duration) round-trip.
export async function extractLastFrame(
  videoUrl: string,
  sceneId: string,
  chunkIndex: number,
): Promise<string> {
  const tmp = tmpdir()
  const sessionId = `atve_frame_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const videoPath = join(tmp, `${sessionId}.mp4`)
  const framePath = join(tmp, `${sessionId}.jpg`)

  try {
    const res = await fetch(videoUrl)
    if (!res.ok) throw new Error(`Failed to fetch video (${res.status}): ${videoUrl}`)
    await fs.writeFile(videoPath, Buffer.from(await res.arrayBuffer()))

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .inputOptions(["-sseof", "-0.1"])
        .outputOptions(["-frames:v", "1", "-q:v", "2"])
        .output(framePath)
        .on("error", reject)
        .on("end", () => resolve())
        .run()
    })

    const buffer = await fs.readFile(framePath)
    return await uploadBlob(`scenes/${sceneId}/chunk_${chunkIndex}_last.jpg`, buffer, "image/jpeg")
  } finally {
    await Promise.all([
      fs.unlink(videoPath).catch(() => {}),
      fs.unlink(framePath).catch(() => {}),
    ])
  }
}
