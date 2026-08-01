import { prisma } from "@/lib/db/client"
import type { UserRole } from "@prisma/client"
import type { EventName } from "@/lib/events"

export const LIMITS = {
  scenesPerDay: 10,           // ~$15/user/day worst case
  trainingPerUser: 10,        // lifetime LoRA runs; expensive ($5–10 each)
  briefsPerDay: 20,           // Haiku calls; cheap but guard against bots
  scrapbooksPerDay: 5,        // ~$2.50/user/day worst case (avg subtle route)
  businessRendersPerMonth: 15,  // per BUSINESS-FORK-HANDOFF.md §M7
  familyRendersPerMonth: 3,     // (family MP4 downloads, not scenes)
  maxMonthlyModelCalls: Number(process.env.MAX_MONTHLY_MODEL_CALLS ?? 100_000),
} as const

function startOfMonthUTC(): Date {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function nextMonthStartUTC(): Date {
  const d = startOfMonthUTC()
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

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

// Scrapbook videos are charged on final assembly (one debit per finished
// scrapbook regardless of page count) so failed/abandoned drafts don't count.
export async function checkScrapbookLimit(userId: string, role?: UserRole): Promise<LimitCheck> {
  if (isUnlimited(role)) return { allowed: true, used: 0, limit: Infinity, resetsAt: null }
  const used = await prisma.job.count({
    where: { userId, type: "scrapbook_generate", createdAt: { gte: startOfTodayUTC() } },
  })
  return { allowed: used < LIMITS.scrapbooksPerDay, used, limit: LIMITS.scrapbooksPerDay, resetsAt: nextMidnightUTC() }
}

// Monthly (business fork). Counted from `Event` rows named "render_completed"
// with props.segment === "business". Postgres JSON path filter narrows the
// count to business-segment renders only — earlier revision claimed the
// filter but didn't apply it, so family renders were counting against the
// business quota.
export async function checkBusinessRenderLimit(userId: string, role?: UserRole): Promise<LimitCheck> {
  if (isUnlimited(role)) return { allowed: true, used: 0, limit: Infinity, resetsAt: null }
  const used = await prisma.event.count({
    where: {
      userId,
      name: "render_completed",
      createdAt: { gte: startOfMonthUTC() },
      props: { path: ["segment"], equals: "business" },
    },
  })
  return {
    allowed: used < LIMITS.businessRendersPerMonth,
    used,
    limit: LIMITS.businessRendersPerMonth,
    resetsAt: nextMonthStartUTC(),
  }
}

// Family-side monthly cap on downloaded ads (guards family cost when the
// family flow becomes as generative as the business flow — placeholder).
export async function checkFamilyRenderLimit(userId: string, role?: UserRole): Promise<LimitCheck> {
  if (isUnlimited(role)) return { allowed: true, used: 0, limit: Infinity, resetsAt: null }
  const used = await prisma.event.count({
    where: {
      userId,
      name: "ad_downloaded",
      createdAt: { gte: startOfMonthUTC() },
    },
  })
  return {
    allowed: used < LIMITS.familyRendersPerMonth,
    used,
    limit: LIMITS.familyRendersPerMonth,
    resetsAt: nextMonthStartUTC(),
  }
}

// Global kill switch: env var KILL_SWITCH=1 (immediate ops-controlled off)
// OR total model-calling events this month > MAX_MONTHLY_MODEL_CALLS
// (auto-trip on runaway costs — writes a kill_switch_tripped event once).
export async function killSwitchEngaged(): Promise<{ engaged: boolean; reason: string | null }> {
  if (process.env.KILL_SWITCH === "1") {
    return { engaged: true, reason: "manual (env KILL_SWITCH=1)" }
  }
  const monthCalls = await prisma.event.count({
    where: {
      name: { in: ["adscript_generated", "tts_synthesized", "render_completed"] as EventName[] },
      createdAt: { gte: startOfMonthUTC() },
    },
  })
  if (monthCalls > LIMITS.maxMonthlyModelCalls) {
    return { engaged: true, reason: `monthly model calls ${monthCalls} > cap ${LIMITS.maxMonthlyModelCalls}` }
  }
  return { engaged: false, reason: null }
}

export async function logUsage(
  userId: string,
  type: "scene_generate" | "brief_generate" | "scrapbook_generate",
  entityId: string,
  entityType: string,
): Promise<void> {
  await prisma.job.create({ data: { userId, type, entityId, entityType, status: "created" } })
}
