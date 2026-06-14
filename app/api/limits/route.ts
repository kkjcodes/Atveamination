import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { checkSceneLimit, checkBriefLimit, checkTrainingLimit } from "@/lib/limits"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const role = session.user.role
  const [scenes, briefs, training] = await Promise.all([
    checkSceneLimit(userId, role),
    checkBriefLimit(userId, role),
    checkTrainingLimit(userId, role),
  ])

  const unlimited = scenes.limit === Infinity
  return NextResponse.json({
    unlimited,
    scenes:   { used: scenes.used,   limit: unlimited ? null : scenes.limit,   resetsAt: scenes.resetsAt },
    briefs:   { used: briefs.used,   limit: unlimited ? null : briefs.limit,   resetsAt: briefs.resetsAt },
    training: { used: training.used, limit: unlimited ? null : training.limit, resetsAt: training.resetsAt },
  })
}
