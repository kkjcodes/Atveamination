// One-shot script — generates 4 short Kokoro voice-audition MP3s and writes
// them to public/voice-samples/business/. The business-fork voice picker's
// "Play sample" button links to these paths.
//
// Run once per (voice, sample text) change:
//   FAL_KEY=... node scripts/generate-voice-samples.mjs
//
// Output paths (checked in with the repo so users hear samples without a
// backend round-trip):
//   public/voice-samples/business/warm_f.mp3
//   public/voice-samples/business/confident_m.mp3
//   public/voice-samples/business/energetic_f.mp3
//   public/voice-samples/business/calm_m.mp3

import { promises as fs } from "fs"
import path from "path"

const OUT_DIR = path.join(process.cwd(), "public", "voice-samples", "business")
const SAMPLE_TEXT = "Hi. This is what I sound like when I read your ad."

// Business voices — all American accents to avoid mixing within one ad.
// Matches lib/business/tts.ts VOICE_MAP.
const VOICES = [
  { archetype: "warm_f",      voice: "af_heart" },
  { archetype: "confident_m", voice: "am_michael" },
  { archetype: "energetic_f", voice: "af_sarah" },
  { archetype: "calm_m",      voice: "am_puck" },
]

async function synth(voiceId, text) {
  const key = process.env.FAL_KEY
  if (!key) throw new Error("FAL_KEY env var required")
  // Use the bare fal-ai/kokoro endpoint (alias) for this one-off script;
  // the app's runtime path (lib/kokoro/synth.ts) uses the language-specific
  // endpoints via the SDK.
  const submit = await fetch("https://queue.fal.run/fal-ai/kokoro", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voiceId }),
  })
  if (!submit.ok) throw new Error(`submit failed: ${submit.status} ${await submit.text()}`)
  const { request_id } = await submit.json()

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const sr = await fetch(`https://queue.fal.run/fal-ai/kokoro/requests/${request_id}/status`, {
      headers: { Authorization: `Key ${key}` },
    })
    if (!sr.ok) continue
    const s = await sr.json().catch(() => ({}))
    if (s.status === "COMPLETED") {
      const rr = await fetch(`https://queue.fal.run/fal-ai/kokoro/requests/${request_id}`, {
        headers: { Authorization: `Key ${key}` },
      })
      const r = await rr.json()
      const url = r?.audio?.url ?? r?.audio_url ?? r?.audio_file?.url
      if (!url) throw new Error(`no audio URL: ${JSON.stringify(r).slice(0, 300)}`)
      return url
    }
    if (s.status === "FAILED") throw new Error(`FAILED: ${JSON.stringify(s).slice(0, 300)}`)
  }
  throw new Error("timeout")
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  for (const { archetype, voice } of VOICES) {
    const out = path.join(OUT_DIR, `${archetype}.mp3`)
    process.stdout.write(`${archetype} (${voice}) → `)
    const url = await synth(voice, SAMPLE_TEXT)
    const bin = await fetch(url)
    if (!bin.ok) throw new Error(`download failed: ${bin.status}`)
    const buf = Buffer.from(await bin.arrayBuffer())
    await fs.writeFile(out, buf)
    console.log(`${out} (${buf.length} bytes)`)
  }
  console.log("done")
}

main().catch((e) => { console.error(e); process.exit(1) })
