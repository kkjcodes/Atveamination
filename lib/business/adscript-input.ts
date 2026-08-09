import {
  ASPECT_RATIOS,
  TEMPLATE_FAMILIES,
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
  // Optional creative controls (Phase A+B options)
  occasionBrief?: string | null
  phone?: string | null
  website?: string | null
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
  extras: { occasionBrief?: string | null; phone?: string | null; website?: string | null } = {},
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
    occasionBrief: extras.occasionBrief ?? null,
    phone: extras.phone ?? null,
    website: extras.website ?? null,
  }
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
