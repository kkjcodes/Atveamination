import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { logError } from "@/lib/logger"
import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)
ffmpeg.setFfprobePath(
  join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe")
)

// Converts 16:9 landscape video to 9:16 portrait using blurred-background padding.
// The source is scaled to fill the frame height, blurred, then the original is
// overlaid centered — the same technique used by Instagram Reels and TikTok.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { finalVideoUrl: true, title: true },
  })
  if (!project?.finalVideoUrl) {
    return NextResponse.json({ error: "No final video" }, { status: 404 })
  }

  const sessionId = `vexport_${Date.now()}`
  const inputPath = join(tmpdir(), `${sessionId}_in.mp4`)
  const outputPath = join(tmpdir(), `${sessionId}_out.mp4`)

  try {
    const res = await fetch(project.finalVideoUrl)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    await fs.writeFile(inputPath, Buffer.from(await res.arrayBuffer()))

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        // Scale to fill 720x1280 (9:16), blur it as background; overlay the
        // original scaled to 720 wide, centered vertically.
        .complexFilter(
          "[0:v]scale=-2:1280,boxblur=20:5,crop=720:1280:(in_w-720)/2:0[bg];" +
          "[0:v]scale=720:-2[fg];" +
          "[bg][fg]overlay=0:(H-h)/2[v]"
        )
        .outputOptions([
          "-map", "[v]",
          "-map", "0:a?",
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k",
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("error", reject)
        .on("end", () => resolve())
        .run()
    })

    const buffer = await fs.readFile(outputPath)
    const slug = (project.title ?? "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${slug}-vertical.mp4"`,
        "Content-Length": String(buffer.length),
      },
    })
  } catch (err) {
    logError("/api/projects/[id]/export", "convert_vertical", { projectId: id, userId: session.user.id }, err)
    return NextResponse.json({ error: "Failed to export video. Please try again." }, { status: 500 })
  } finally {
    await Promise.all([
      fs.unlink(inputPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {}),
    ])
  }
}
