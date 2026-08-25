import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { downloadBlob } from "@/lib/storage/client"

// GET /api/try/[id] — returns the demo's source photo so the signup flow can
// carry it into character creation without re-uploading (task B1). Requires a
// session: the demo itself is anonymous, but the carryover only happens after
// signup, and gating it keeps demo blobs from being enumerable by bots.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Stream bytes through this route rather than exposing storage URLs; a
  // swept (>24h) demo turns into a clean 404.
  const buffer = await downloadBlob(`demo/${id}/source.jpg`)
  if (!buffer) {
    return NextResponse.json({ error: "This preview has expired — just add your photo again." }, { status: 404 })
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  })
}
