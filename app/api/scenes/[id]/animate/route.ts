import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { startSceneAnimation } from "@/lib/scenes/animate"
import { isBudgetError, ensureKickoffBudget } from "@/lib/budget/guard"

// POST /api/scenes/[id]/animate — approve a previewed keyframe (D4).
// The scene sits at "image_ready" after its cheap keyframe rendered; this
// spends the video dollars only once the user likes what they see.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scene = await prisma.scene.findFirst({
    where: { id, project: { userId: session.user.id } },
    select: { id: true, generationPhase: true, imageUrl: true },
  })
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  if (scene.generationPhase !== "image_ready" || !scene.imageUrl) {
    return NextResponse.json({ error: "This scene isn't waiting for approval." }, { status: 409 })
  }

  try {
    await ensureKickoffBudget()
    const result = await startSceneAnimation(id, { fromPhase: "image_ready", imageUrl: scene.imageUrl })
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })
    return NextResponse.json({ status: "processing" })
  } catch (e) {
    if (isBudgetError(e)) return NextResponse.json({ error: e.message }, { status: 503 })
    console.error(`[animate] scene ${id} failed: ${(e as Error).message}`)
    return NextResponse.json({ error: "Couldn't start the animation. Try again in a moment." }, { status: 502 })
  }
}
