import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadBlob } from "@/lib/storage/client"
import { concatenateClips } from "@/lib/video/concat"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.project.findFirst({ where: { id, userId } })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const scenes = await prisma.scene.findMany({
    where: { projectId: id },
    orderBy: { orderIndex: "asc" },
  })

  if (scenes.length === 0) {
    return NextResponse.json({ error: "No scenes found for this project" }, { status: 400 })
  }

  const missingClips = scenes.filter((s) => !s.videoClipUrl)
  if (missingClips.length > 0) {
    return NextResponse.json(
      { error: `${missingClips.length} scene(s) do not have generated video clips yet` },
      { status: 400 }
    )
  }

  await prisma.project.update({ where: { id }, data: { status: "processing" } })

  const clips = scenes.map((s) => ({
    videoUrl: s.videoClipUrl as string,
    audioUrl: s.audioUrl ?? null,
  }))
  const outputPath = join(tmpdir(), `project_${id}_${Date.now()}.mp4`)

  try {
    await concatenateClips(clips, outputPath)

    const videoBuffer = await fs.readFile(outputPath)
    const finalVideoUrl = await uploadBlob(
      `${userId}/projects/${id}/final.mp4`,
      videoBuffer,
      "video/mp4"
    )

    const updated = await prisma.project.update({
      where: { id },
      data: { status: "succeeded", finalVideoUrl },
    })

    return NextResponse.json({
      project: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        final_video_url: updated.finalVideoUrl,
      },
    })
  } catch (err) {
    await prisma.project.update({ where: { id }, data: { status: "failed" } })
    const message = err instanceof Error ? err.message : "Stitch failed"
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await fs.unlink(outputPath).catch(() => {})
  }
}
