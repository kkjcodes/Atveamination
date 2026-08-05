import {
  ASPECT_RATIOS,
  TEMPLATE_FAMILIES,
  type AdScript,
  type AspectRatio,
  type TemplateFamily,
} from "@/lib/business/adscript-schema"

// Pure coercers + input shape helpers extracted from adscript.ts. Kept here
// so tests can import without triggering the Anthropic SDK's browser-env
// guardrail (which jsdom trips).

export type MusicOption = { id: string; label: string }

export type AdScriptInput = {
  photos: Array<{ assetId: string; mimeType: string; buffer: Buffer }>
  businessName: string
  oneLiner: string
  address: string | null
  notes: string | null
  templateFamily: TemplateFamily
  aspectRatio: AspectRatio
  logoAssetId: string | null
  availableMusic: MusicOption[]
}

export type AdScriptInputBusiness = {
  name: string
  oneLiner: string
  address: string | null
  notes: string | null
  logoAssetId: string | null
}

export function makeAdScriptInput(
  business: AdScriptInputBusiness,
  photos: Array<{ assetId: string; mimeType: string; buffer: Buffer }>,
  templateFamily: TemplateFamily,
  aspectRatio: AspectRatio,
  availableMusic: MusicOption[],
): AdScriptInput {
  return {
    photos,
    businessName: business.name,
    oneLiner: business.oneLiner,
    address: business.address,
    notes: business.notes,
    templateFamily,
    aspectRatio,
    logoAssetId: business.logoAssetId,
    availableMusic,
  }
}

// Deterministic photo-order enforcement. The prompt asks the model to use
// photos in the user's order, but that's advisory — this guarantees it.
// Keeps the model's CHOICE of which photos to feature and the narrative
// scene order (hook → benefit → cta); only the photo-to-scene assignment is
// re-sorted so photos appear in the user's order. Array.sort is stable, so
// duplicate asset_ids keep their relative positions.
export function enforcePhotoOrder(script: AdScript, orderedAssetIds: string[]): AdScript {
  const rank = new Map(orderedAssetIds.map((id, i) => [id, i]))
  const sceneIndexes: number[] = []
  const chosen: string[] = []
  script.scenes.forEach((s, i) => {
    if (s.type !== "end_card" && typeof s.asset_id === "string") {
      sceneIndexes.push(i)
      chosen.push(s.asset_id)
    }
  })
  const sorted = [...chosen].sort(
    (a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  )
  const scenes = script.scenes.map((s) => ({ ...s }))
  sceneIndexes.forEach((si, k) => {
    ;(scenes[si] as { asset_id: string }).asset_id = sorted[k]
  })
  return { ...script, scenes }
}

export function coerceTemplateFamily(raw: unknown): TemplateFamily | null {
  return typeof raw === "string" && (TEMPLATE_FAMILIES as readonly string[]).includes(raw)
    ? (raw as TemplateFamily)
    : null
}

export function coerceAspectRatio(raw: unknown): AspectRatio | null {
  return typeof raw === "string" && (ASPECT_RATIOS as readonly string[]).includes(raw)
    ? (raw as AspectRatio)
    : null
}
