// Audition tool for the pronunciation lexicon (lib/business/pronunciation-lexicon.ts).
// No word enters the lexicon without passing this ear check.
//
// Usage:
//   FAL_KEY=... node scripts/audition-pronunciation.mjs "Diwali=dɪwˈɑli" "Holi=hˈoʊli"
//
// Writes one clip per word per voice to ~/Desktop/atve-tts-bench/, phrased in
// a carrier sentence so you hear the word in ad-like context. Listen, tune
// the phonemes, re-run; when it sounds right, add the entry to the lexicon.
// FAL_KEY comes from the environment and is never printed.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const FAL_KEY = (process.env.FAL_KEY || "").trim()
if (!FAL_KEY) {
  console.error("Set FAL_KEY in the environment (do not paste it into files).")
  process.exit(1)
}

const pairs = process.argv.slice(2).map((arg) => {
  const eq = arg.indexOf("=")
  if (eq < 1) {
    console.error(`Bad argument "${arg}" — expected Word=phonemes (e.g. "Diwali=dɪwˈɑli")`)
    process.exit(1)
  }
  return { word: arg.slice(0, eq), phonemes: arg.slice(eq + 1) }
})
if (pairs.length === 0) {
  console.error('Usage: FAL_KEY=... node scripts/audition-pronunciation.mjs "Word=phonemes" ...')
  process.exit(1)
}

const VOICES = ["af_heart", "am_michael"]
const OUT = path.join(os.homedir(), "Desktop", "atve-tts-bench")
fs.mkdirSync(OUT, { recursive: true })

async function synth(voice, text, outFile) {
  const res = await fetch("https://fal.run/fal-ai/kokoro/american-english", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: text, voice }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const url = body?.audio?.url ?? body?.audio_url ?? body?.audio_file?.url
  if (!url) throw new Error(`no audio url in response`)
  const wav = await fetch(url)
  fs.writeFileSync(outFile, Buffer.from(await wav.arrayBuffer()))
}

for (const { word, phonemes } of pairs) {
  const marked = `[${word}](/${phonemes}/)`
  const sentence = `Celebrate ${marked} with us this week. Yes — ${marked}. Come by and see.`
  for (const voice of VOICES) {
    const file = path.join(OUT, `audition_${word.toLowerCase().replace(/\W+/g, "_")}_${voice}.wav`)
    try {
      await synth(voice, sentence, file)
      console.log(`ok  ${word} (${voice}) -> ${file}`)
    } catch (e) {
      console.error(`ERR ${word} (${voice}): ${e.message}`)
    }
  }
}
console.log(`\nListen in ${OUT}. When a word sounds right, add it to lib/business/pronunciation-lexicon.ts with today's date.`)
