import { NextRequest, NextResponse } from "next/server"
import { generateDemo, DEMO_STYLES, type DemoStyle } from "@/lib/demo/generate"
import { validateImageFile, UploadValidationError } from "@/lib/business/upload"
import { sweepPrefixOlderThan } from "@/lib/storage/client"
import { isBudgetError } from "@/lib/budget/guard"

export const maxDuration = 60

// POST /api/try — the anonymous single-image cartoon demo (task B1).
// No auth, no email: the result IS the hook. Abuse limits + budget guard
// enforced in lib/demo/generate.ts and the provider adapters.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"

  const formData = await req.formData().catch(() => null)
  const file = formData?.get("photo") as File | null
  if (!file) return NextResponse.json({ error: "Add a photo to try it." }, { status: 400 })

  const styleRaw = formData?.get("style")
  const style: DemoStyle = DEMO_STYLES.includes(styleRaw as DemoStyle) ? (styleRaw as DemoStyle) : "pixar"

  try {
    validateImageFile(file)
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const result = await generateDemo({ buffer, mimeType: file.type }, ip, style)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // Opportunistic retention sweep — demo uploads promise 24h deletion and
    // there's no separate scheduler. Fire-and-forget; never blocks the reply.
    void sweepPrefixOlderThan("demo/", 24 * 60 * 60 * 1000)

    return NextResponse.json({
      demo_id: result.demoId,
      source_url: result.sourceUrl,
      result_url: result.resultUrl,
    })
  } catch (e) {
    if (isBudgetError(e)) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    console.error(`[try] demo generation failed: ${(e as Error).message}`)
    return NextResponse.json(
      { error: "That didn't work this time — give it another try in a moment." },
      { status: 502 },
    )
  }
}
