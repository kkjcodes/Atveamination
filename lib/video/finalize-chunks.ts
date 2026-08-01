import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { uploadBlob } from "@/lib/storage/client"
import { concatVideoChunks } from "@/lib/video/concat"

// Concatenate all completed WAN chunks into a single MP4 clipped to
// `targetSeconds`, upload to blob at `scenes/<sceneId>/clip.mp4`, and return
// the public URL. Used by the fal webhook and the polling path when the final
// chunk arrives (or when chain-advance fails and we finalize what we have).
export async function finalizeChunks(
  sceneId: string,
  chunkUrls: string[],
  targetSeconds: number,
): Promise<string> {
  const tmp = tmpdir()
  const outputPath = join(tmp, `atve_finalize_${sceneId}_${Date.now()}.mp4`)
  try {
    await concatVideoChunks(chunkUrls, targetSeconds, outputPath)
    const buffer = await fs.readFile(outputPath)
    return await uploadBlob(`scenes/${sceneId}/clip.mp4`, buffer, "video/mp4")
  } finally {
    await fs.unlink(outputPath).catch(() => {})
  }
}
