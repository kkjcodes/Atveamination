import { prisma } from "@/lib/db/client"

// Event vocabulary per BUSINESS-FORK-HANDOFF.md §7. Type-safe emit — every
// call must match the union so we can't ship a route that emits `singup`.

export type EventName =
  | "signup"
  | "flow_entered"
  | "business_created"
  | "photos_uploaded"
  | "adscript_generated"
  | "tts_synthesized"
  | "render_started"
  | "render_completed"
  | "render_failed"
  | "edit_requested"
  | "version_reverted"
  | "ad_downloaded"
  | "gallery_opt_in"
  | "gallery_cta_clicked"
  | "quota_reached"
  | "kill_switch_tripped"

// Fire-and-forget: never blocks the caller, never throws. If the DB is down
// we don't want a page-load-time landing click to error out.
export async function emit(
  name: EventName,
  props: Record<string, unknown> = {},
  userId: string | null = null,
): Promise<void> {
  try {
    await prisma.event.create({
      // Prisma's JSON type is a union of primitives/arrays/objects; our
      // Record<string,unknown> is looser, so cast at the boundary.
      data: { name, userId, props: props as unknown as object },
    })
  } catch (e) {
    // Best-effort: log to stderr but don't rethrow.
    console.error("[events] emit failed:", name, (e as Error)?.message)
  }
}

// Aggregated metrics for the admin dashboard. Kept as pure DB queries so
// tests can pin the shapes without an events fixture.

export async function countSignupsBySegment(): Promise<Record<string, number>> {
  const rows = await prisma.user.groupBy({
    by: ["segment"],
    _count: { id: true },
  })
  const out: Record<string, number> = {}
  for (const r of rows) out[r.segment ?? "unset"] = r._count.id
  return out
}

export async function countAdsAndRenders(): Promise<{ ads: number; renders: number }> {
  const [ads, renders] = await Promise.all([
    prisma.ad.count(),
    prisma.event.count({ where: { name: "render_completed" } }),
  ])
  return { ads, renders }
}

export async function medianIterationsPerAd(): Promise<number> {
  // Iteration count = versions per ad minus 1 (v1 is the original).
  const grouped = await prisma.adVersion.groupBy({
    by: ["adId"],
    _count: { id: true },
  })
  const iterations = grouped
    .map((g) => Math.max(0, g._count.id - 1))
    .sort((a, b) => a - b)
  if (iterations.length === 0) return 0
  const mid = Math.floor(iterations.length / 2)
  return iterations.length % 2 === 0
    ? (iterations[mid - 1] + iterations[mid]) / 2
    : iterations[mid]
}

export async function galleryOptInRate(): Promise<number> {
  const [optedIn, total] = await Promise.all([
    prisma.ad.count({ where: { galleryOptIn: true, status: "ready" } }),
    prisma.ad.count({ where: { status: "ready" } }),
  ])
  return total === 0 ? 0 : optedIn / total
}
