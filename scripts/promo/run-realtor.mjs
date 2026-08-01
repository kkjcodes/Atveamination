import { readFileSync, writeFileSync } from 'fs'
import { BASE, loginAsTest, h } from './session.mjs'

const OUT = process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/outputs'

console.log('=== Realtor ad E2E ===')
const { jar } = await loginAsTest()
console.log('✓ session')

// 1. Create business
const bizRes = await fetch(`${BASE}/api/business`, {
  method: 'POST', headers: h(jar, { 'Content-Type': 'application/json' }),
  body: JSON.stringify({
    name: 'Ridgeview Realty',
    oneLiner: 'Beautifully renovated 4-bed on Ridgeview Drive',
    address: '42 Ridgeview Drive · Open Saturday 11am',
    notes: 'New kitchen with quartz island, hardwood floors throughout, quiet cul-de-sac, walk to Ridgeview Elementary. Asking $749,000.',
  }),
})
if (!bizRes.ok) throw new Error(`create business: ${bizRes.status} ${await bizRes.text()}`)
const { business } = await bizRes.json()
console.log(`✓ business id=${business.id}`)

// 2. Upload 5 house photos
const photoNames = ['exterior', 'kitchen', 'living', 'bedroom', 'street']
const fd = new FormData()
for (const n of photoNames) {
  const buf = readFileSync(`${process.env.HOME}/Desktop/atve-linkedin-2026-07-26/realtor-photos/${n}.jpg`)
  fd.append('photos', new File([buf], `${n}.jpg`, { type: 'image/jpeg' }))
}
const upRes = await fetch(`${BASE}/api/business/${business.id}/photos`, {
  method: 'POST', headers: h(jar), body: fd,
})
if (!upRes.ok) throw new Error(`upload photos: ${upRes.status} ${await upRes.text()}`)
const upJson = await upRes.json()
const photos = upJson.photos ?? []
if (photos.length !== 5) throw new Error(`expected 5 photos uploaded, got ${photos.length}: ${JSON.stringify(upJson).slice(0, 300)}`)
console.log(`✓ uploaded ${photos.length} photos`)

// 3. Generate ad (Sonnet AdScript + Kokoro TTS synth)
console.log(`Generating AdScript (Sonnet)...`)
const genRes = await fetch(`${BASE}/api/business/${business.id}/ads`, {
  method: 'POST', headers: h(jar, { 'Content-Type': 'application/json' }),
  body: JSON.stringify({ templateFamily: 'bold_promo', aspectRatio: '9:16' }),
})
if (!genRes.ok) throw new Error(`gen ad: ${genRes.status} ${await genRes.text()}`)
const { ad } = await genRes.json()
console.log(`✓ ad id=${ad.id}, scenes=${ad.adScript?.scenes?.length ?? '?'}`)

// 4. Render
console.log(`Rendering MP4...`)
const rendRes = await fetch(`${BASE}/api/business/ads/${ad.id}/render`, {
  method: 'POST', headers: h(jar),
})
if (!rendRes.ok) throw new Error(`render kick: ${rendRes.status} ${await rendRes.text()}`)
console.log(`  ✓ render kicked off (status 200)`)

// 5. Poll for readiness
const t0 = Date.now()
let videoUrl = null
while (Date.now() - t0 < 300_000) {
  await new Promise(r => setTimeout(r, 5000))
  const st = await fetch(`${BASE}/api/business/ads/${ad.id}`, { headers: h(jar) })
  const stJson = await st.json()
  const s = stJson.ad?.status
  process.stdout.write(`.`)
  if (s === 'ready') { videoUrl = stJson.ad.videoUrl; break }
  if (s === 'failed') throw new Error(`render failed: ${JSON.stringify(stJson.ad)}`)
}
console.log('')
if (!videoUrl) throw new Error(`render timeout after 300s`)
console.log(`✓ video ready: ${videoUrl}`)

// 6. Download
const dl = await fetch(videoUrl)
const outPath = `${OUT}/realtor-ad-ridgeview-9x16.mp4`
writeFileSync(outPath, Buffer.from(await dl.arrayBuffer()))
console.log(`✓ downloaded → ${outPath}`)

// Also save AdScript for the LinkedIn caption
writeFileSync(`${OUT}/realtor-adscript.json`, JSON.stringify(ad.adScript, null, 2))
console.log(`✓ AdScript saved for reference`)

console.log(`\n=== DONE realtor ad ===`)
