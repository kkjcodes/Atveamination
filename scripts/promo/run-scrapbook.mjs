import { readFileSync, writeFileSync } from 'fs'
import { BASE, loginAsTest, h } from './session.mjs'

const OUT = process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/outputs'
const PHOTO_DIR = process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/scrapbook-photos'

console.log('=== Scrapbook E2E ===')
const { jar } = await loginAsTest()
console.log('✓ session')

// 1. Create scrapbook project
const projRes = await fetch(`${BASE}/api/scrapbook/projects`, {
  method: 'POST', headers: h(jar, { 'Content-Type': 'application/json' }),
  body: JSON.stringify({ title: 'Family Through the Years', style: 'watercolor' }),
})
if (!projRes.ok) throw new Error(`create project: ${projRes.status} ${await projRes.text()}`)
const { project } = await projRes.json()
console.log(`✓ project id=${project.id}`)

// 2. Upload 8 family photos
const fd = new FormData()
for (let i = 1; i <= 8; i++) {
  const buf = readFileSync(`${PHOTO_DIR}/family-${i}.jpg`)
  fd.append('photos', new File([buf], `family-${i}.jpg`, { type: 'image/jpeg' }))
}
const upRes = await fetch(`${BASE}/api/scrapbook/projects/${project.id}/photos`, {
  method: 'POST', headers: h(jar), body: fd,
})
if (!upRes.ok) throw new Error(`upload: ${upRes.status} ${await upRes.text()}`)
const upJson = await upRes.json()
console.log(`✓ uploaded photos, response keys: ${Object.keys(upJson).join(',')}`)

// 3. Get pages
const pgRes = await fetch(`${BASE}/api/scrapbook/projects/${project.id}`, { headers: h(jar) })
const pgJson = await pgRes.json()
const pages = pgJson.project?.pages ?? []
console.log(`✓ project has ${pages.length} pages`)
if (pages.length === 0) throw new Error(`no pages: ${JSON.stringify(pgJson).slice(0, 400)}`)

// 4. Generate all pages (parallel)
console.log('Generating all pages...')
await Promise.all(pages.map(async (p, idx) => {
  const r = await fetch(`${BASE}/api/scrapbook/pages/${p.id}/generate`, { method: 'POST', headers: h(jar) })
  if (!r.ok) throw new Error(`gen page ${idx}: ${r.status} ${await r.text()}`)
  process.stdout.write(`[${idx}]`)
}))
console.log('\n  ✓ all page generations kicked off')

// 5. Poll each page until done
console.log('Polling for page completion...')
const t0 = Date.now()
const doneSet = new Set()
while (doneSet.size < pages.length && Date.now() - t0 < 900_000) {
  await new Promise(r => setTimeout(r, 10000))
  for (const p of pages) {
    if (doneSet.has(p.id)) continue
    const r = await fetch(`${BASE}/api/scrapbook/pages/${p.id}`, { headers: h(jar) })
    const j = await r.json()
    const phase = j.page?.phase
    if (phase === 'done') { doneSet.add(p.id); process.stdout.write(`✓`) }
    else if (phase === 'failed') { throw new Error(`page ${p.id} failed: ${JSON.stringify(j.page)}`) }
    else process.stdout.write(`.`)
  }
  process.stdout.write(` [${doneSet.size}/${pages.length}]\n`)
}
if (doneSet.size < pages.length) throw new Error('page gen timeout')
console.log(`✓ all ${pages.length} pages done`)

// 6. Stitch
console.log('Stitching final MP4...')
const stitchRes = await fetch(`${BASE}/api/scrapbook/projects/${project.id}/stitch`, { method: 'POST', headers: h(jar) })
if (!stitchRes.ok) throw new Error(`stitch: ${stitchRes.status} ${await stitchRes.text()}`)
const stitchJson = await stitchRes.json()
console.log(`✓ stitch response: ${JSON.stringify(stitchJson).slice(0, 200)}`)

// 7. Poll for final video
const t2 = Date.now()
let finalUrl = null
while (Date.now() - t2 < 300_000) {
  await new Promise(r => setTimeout(r, 5000))
  const r = await fetch(`${BASE}/api/scrapbook/projects/${project.id}`, { headers: h(jar) })
  const j = await r.json()
  if (j.project?.finalVideoUrl) { finalUrl = j.project.finalVideoUrl; break }
  process.stdout.write(`.`)
}
console.log('')
if (!finalUrl) throw new Error('stitch timeout')

const dl = await fetch(finalUrl)
const outPath = `${OUT}/scrapbook-family-vintage.mp4`
writeFileSync(outPath, Buffer.from(await dl.arrayBuffer()))
console.log(`✓ downloaded → ${outPath}`)
console.log(`\n=== DONE scrapbook ===`)
