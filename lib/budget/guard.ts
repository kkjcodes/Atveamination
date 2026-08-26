import { prisma } from "@/lib/db/client"
import { estimateCost } from "@/lib/budget/costs"

// Global spend guard — the single chokepoint for paid provider calls.
// Policy (decided 2026-08-25):
//   - DAILY_BUDGET_USD (default 50): soft alert at 70%, hard stop at 100%.
//   - MONTHLY_BUDGET_USD (default 1000): same thresholds.
//   - Hard stop rejects NEW paid calls with BudgetExceededError (friendly,
//     user-safe message) — in-flight work that already passed the gate is
//     never interrupted mid-video (a partial stop wastes the scenes already
//     paid for).
//   - Provider "out of balance / account locked" errors trip a circuit
//     breaker so subsequent calls short-circuit to the same friendly error
//     instead of hanging IN_QUEUE (fal locks accounts on exhausted balance —
//     seen in prod June 2026).
// Enforcement happens inside the provider adapters (lib/fal/client.ts,
// lib/replicate/client.ts, lib/ai/client.ts) — call sites cannot bypass it.

export const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 50)
export const MONTHLY_BUDGET_USD = Number(process.env.MONTHLY_BUDGET_USD ?? 1000)
const SOFT_RATIO = 0.7
// The adapter-level absolute stop sits 10% above the ceiling so a video
// that PASSED the kickoff gate can finish its remaining scenes — cutting a
// half-rendered video wastes the scenes already paid for. New work is
// rejected at 100% by ensureKickoffBudget(); only in-flight continuation
// spends inside the 100–110% band.
const ABSOLUTE_RATIO = 1.1

// Friendly, user-safe copy — this message can surface directly in any UI.
const CAPACITY_MESSAGE =
  "We're at capacity right now, so new videos are paused. Your photos and projects are safe — please try again tomorrow."

export class BudgetExceededError extends Error {
  readonly isBudgetError = true
  constructor(readonly reason: string) {
    super(CAPACITY_MESSAGE)
    this.name = "BudgetExceededError"
  }
}

export function isBudgetError(e: unknown): e is BudgetExceededError {
  return e instanceof Error && (e as BudgetExceededError).isBudgetError === true
}

// ── Circuit breaker for provider balance exhaustion ────────────────────────
// In-memory (minReplicas=1; a restart clears it, which is fine — the next
// real call re-trips it if the balance is still empty).
let breakerUntil = 0
let breakerReason = ""
const BREAKER_MS = 30 * 60 * 1000

const BALANCE_ERROR_PATTERNS = /exhausted balance|user is locked|insufficient credit|payment required|account.*locked/i

export function tripBreakerIfBalanceError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e)
  const status = (e as { status?: number })?.status
  if (BALANCE_ERROR_PATTERNS.test(msg) || status === 402) {
    breakerUntil = Date.now() + BREAKER_MS
    breakerReason = `provider balance error: ${msg.slice(0, 120)}`
    console.error(`[budget] CIRCUIT BREAKER TRIPPED for ${BREAKER_MS / 60000}min — ${breakerReason}`)
  }
}

export function breakerEngaged(): boolean {
  return Date.now() < breakerUntil
}

export function _resetBreakerForTests(): void {
  breakerUntil = 0
  breakerReason = ""
}

function startOfTodayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function startOfMonthUTC(): Date {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export type SpendSummary = {
  todayUsd: number
  monthUsd: number
  dailyBudgetUsd: number
  monthlyBudgetUsd: number
  level: "ok" | "soft" | "hard"
  breaker: boolean
}

export async function spendSummary(): Promise<SpendSummary> {
  const [day, month] = await Promise.all([
    prisma.spendLedger.aggregate({ _sum: { estimatedCostUsd: true }, where: { createdAt: { gte: startOfTodayUTC() } } }),
    prisma.spendLedger.aggregate({ _sum: { estimatedCostUsd: true }, where: { createdAt: { gte: startOfMonthUTC() } } }),
  ])
  const todayUsd = day._sum.estimatedCostUsd ?? 0
  const monthUsd = month._sum.estimatedCostUsd ?? 0
  const level =
    todayUsd >= DAILY_BUDGET_USD || monthUsd >= MONTHLY_BUDGET_USD ? "hard"
    : todayUsd >= DAILY_BUDGET_USD * SOFT_RATIO || monthUsd >= MONTHLY_BUDGET_USD * SOFT_RATIO ? "soft"
    : "ok"
  return { todayUsd, monthUsd, dailyBudgetUsd: DAILY_BUDGET_USD, monthlyBudgetUsd: MONTHLY_BUDGET_USD, level, breaker: breakerEngaged() }
}

// The kickoff gate (100% of ceiling). Called at the START of user-initiated
// paid flows — creating an ad, generating a scene, uploading a character,
// running the demo. Rejecting here means no money was spent on a video that
// couldn't finish inside the ceiling.
export async function ensureKickoffBudget(): Promise<void> {
  if (breakerEngaged()) throw new BudgetExceededError(breakerReason || "circuit breaker engaged")
  const summary = await spendSummary()
  if (summary.level === "hard") {
    console.error(`[budget] kickoff rejected — today $${summary.todayUsd.toFixed(2)}/${DAILY_BUDGET_USD}, month $${summary.monthUsd.toFixed(2)}/${MONTHLY_BUDGET_USD}`)
    throw new BudgetExceededError("daily/monthly ceiling reached")
  }
}

// The gate. Called by provider adapters before every paid call. Records the
// attempt in the ledger (spend is committed the moment the provider call is
// made, success or not) and throws BudgetExceededError on hard stop/breaker.
export async function gateAndRecord(
  provider: "fal" | "replicate" | "anthropic",
  model: string,
  context?: { userId?: string; ipHash?: string },
): Promise<void> {
  if (breakerEngaged()) throw new BudgetExceededError(breakerReason || "circuit breaker engaged")

  const cost = estimateCost(provider, model)
  const summary = await spendSummary()
  // Absolute stop (110% of ceiling): even in-flight work halts here.
  if (
    summary.todayUsd >= DAILY_BUDGET_USD * ABSOLUTE_RATIO ||
    summary.monthUsd >= MONTHLY_BUDGET_USD * ABSOLUTE_RATIO
  ) {
    console.error(`[budget] ABSOLUTE STOP — today $${summary.todayUsd.toFixed(2)}/${DAILY_BUDGET_USD}, month $${summary.monthUsd.toFixed(2)}/${MONTHLY_BUDGET_USD}; rejected ${provider}:${model}`)
    throw new BudgetExceededError(`absolute ceiling reached`)
  }
  if (summary.level === "hard") {
    console.warn(`[budget] over ceiling (in-flight headroom band) — today $${summary.todayUsd.toFixed(2)}/${DAILY_BUDGET_USD} (${provider}:${model})`)
  } else if (summary.level === "soft") {
    console.warn(`[budget] soft threshold — today $${summary.todayUsd.toFixed(2)}/${DAILY_BUDGET_USD} (${provider}:${model})`)
  }

  await prisma.spendLedger.create({
    data: {
      operation: model.split(":")[0],
      provider,
      estimatedCostUsd: cost,
      userId: context?.userId ?? null,
      ipHash: context?.ipHash ?? null,
    },
  }).catch((e) => {
    // Ledger write failure must never block generation — log and continue.
    console.error(`[budget] ledger write failed: ${(e as Error).message}`)
  })
}
