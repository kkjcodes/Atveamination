import { NextRequest, NextResponse } from "next/server"
import { sendEmail } from "@/lib/email/client"
import { rateLimit } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { BRAND } from "@/config/brand"

const REASONS = new Set(["more_videos", "custom_style", "not_working", "other"])

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// POST /api/contact — forward a contact form submission to the ops inbox.
// No auth required (a prospective user should be able to reach us before
// signing up). Rate-limited per-IP to keep the form from being scraped as
// a spam relay.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You've sent a few notes recently. Try again in a bit." },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    name?: string
    email?: string
    reason?: string
    message?: string
  }

  const name = body.name?.trim() ?? ""
  const email = body.email?.trim() ?? ""
  const reason = body.reason?.trim() ?? "other"
  const message = body.message?.trim() ?? ""

  if (!name) return NextResponse.json({ error: "Add your name so we know who to write back to." }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 })
  }
  if (name.length > 100 || email.length > 200 || message.length > 4000) {
    return NextResponse.json({ error: "That message is too long. Trim it and try again." }, { status: 400 })
  }
  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: "Pick one of the listed reasons." }, { status: 400 })
  }

  const subject = `[contact] ${reason} — from ${name}`
  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:32px 24px">
      <h2 style="margin-bottom:8px">New contact form submission</h2>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Name</td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#71717a">Reason</td><td>${escapeHtml(reason)}</td></tr>
      </table>
      ${message ? `<div style="border-left:3px solid #d4d4d8;padding-left:12px;color:#3f3f46;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</div>` : ""}
    </div>
  `

  try {
    await sendEmail(BRAND.supportEmail, subject, html)
  } catch (e) {
    logError("/api/contact", "send", { email, reason }, e)
    return NextResponse.json(
      { error: `We couldn't send your note. Try again in a moment, or email ${BRAND.supportEmail} directly.` },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
