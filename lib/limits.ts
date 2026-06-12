import { prisma } from "@/lib/db/client"
import type { UserRole } from "@prisma/client"

export const LIMITS = {
  scenesPerDay: 10,       // ~$15/user/day worst case
  trainingPerUser: 3,     // lifetime LoRA runs; expensive ($5–10 each)
  briefsPerDay: 20,       // Haiku calls; cheap but guard against bots
} as const

const UNLIMITED: ["FREE", "SUPER_USER", "ADMIN"] = ["FREE", "SUPER_USER", "ADMIN"]
const PRIVILEGED_ROLES = new Set<UserRole>(["SUPER_USER", "ADMIN"])

function isUnlimited(role?: UserRole): boolean {
  return !!role && PRIVILEGED_ROLES.has(role)
}

function startOfTodayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export interface LimitCheck {
  allowed: boolean
  used: number
  limit: number
  resetsAt: Date | null  // null = lifetime limit, no reset
}

function nextMidnightUTC(): Date {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d
}

export async function checkSceneLimit(userId: string, role?: UserRole): Promise<LimitCheck> {
  if (isUnlimited(role)) return { allowed: true, used: 0, limit: Infinity, resetsAt: null }
  const used = await prisma.job.count({
    where: { userId, type: "scene_generate", createdAt: { gte: startOfTodayUTC() } },
  })
  return { allowed: used < LIMITS.scenesPerDay, used, limit: LIMITS.scenesPerDay, resetsAt: nextMidnightUTC() }
}

export async function checkTrainingLimit(userId: string, role?: UserRole): Promise<LimitCheck> {
  if (isUnlimited(role)) return { allowed: true, used: 0, limit: Infinity, resetsAt: null }
  const used = await prisma.job.count({
    where: { userId, type: "lora_training" },
  })
  return { allowed: used < LIMITS.trainingPerUser, used, limit: LIMITS.trainingPerUser, resetsAt: null }
}

export async function checkBriefLimit(userId: string, role?: UserRole): Promise<LimitCheck> {
  if (isUnlimited(role)) return { allowed: true, used: 0, limit: Infinity, resetsAt: null }
  const used = await prisma.job.count({
    where: { userId, type: "brief_generate", createdAt: { gte: startOfTodayUTC() } },
  })
  return { allowed: used < LIMITS.briefsPerDay, used, limit: LIMITS.briefsPerDay, resetsAt: nextMidnightUTC() }
}

export async function logUsage(
  userId: string,
  type: "scene_generate" | "brief_generate",
  entityId: string,
  entityType: string,
): Promise<void> {
  await prisma.job.create({ data: { userId, type, entityId, entityType, status: "created" } })
}
