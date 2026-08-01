import { readFileSync, writeFileSync } from 'fs'
import { BASE, loginAsTest, h } from './session.mjs'

async function uploadCharacter(jar, name, photoPath) {
  const buf = readFileSync(photoPath)
  const fd = new FormData()
  fd.append('name', name)
  fd.append('photo', new Blob([buf], { type: 'image/jpeg' }), photoPath.split('/').pop())
  const r = await fetch(`${BASE}/api/characters`, { method: 'POST', headers: h(jar), body: fd })
  if (!r.ok) throw new Error(`upload ${name}: ${r.status} ${await r.text()}`)
  const { character } = await r.json()
  console.log(`  ✓ uploaded ${name}: id=${character.id}`)
  return character
}

async function generateStyles(jar, id) {
  const r = await fetch(`${BASE}/api/characters/${id}/generate-styles`, { method: 'POST', headers: h(jar) })
  if (!r.ok) throw new Error(`gen-styles ${id}: ${r.status} ${await r.text()}`)
  console.log(`  ✓ style gen kicked off for ${id}`)
}

async function pollStyles(jar, id, timeoutMs = 180_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000))
    const r = await fetch(`${BASE}/api/characters/${id}`, { headers: h(jar) })
    const j = await r.json()
    const opts = j.character?.options ?? []
    if (opts.length >= 4) return opts
    if (opts.length > 0) console.log(`  ... ${opts.length}/4 style options ready`)
  }
  throw new Error(`styles never ready for ${id}`)
}

async function selectStyle(jar, id, optionId) {
  const r = await fetch(`${BASE}/api/characters/${id}/select-style`, {
    method: 'POST', headers: h(jar, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ option_id: optionId }),
  })
  if (!r.ok) throw new Error(`select-style: ${r.status} ${await r.text()}`)
  console.log(`  ✓ selected style ${optionId}`)
}

async function train(jar, id) {
  const r = await fetch(`${BASE}/api/characters/${id}/train`, { method: 'POST', headers: h(jar) })
  if (!r.ok) throw new Error(`train: ${r.status} ${await r.text()}`)
  console.log(`  ✓ training kicked off for ${id}`)
}

async function fullPipeline(jar, name, photoPath) {
  console.log(`--- ${name} ---`)
  const c = await uploadCharacter(jar, name, photoPath)
  await generateStyles(jar, c.id)
  const options = await pollStyles(jar, c.id)
  // Pick the first style option (most similar to source generally)
  await selectStyle(jar, c.id, options[0].id)
  await train(jar, c.id)
  return c.id
}

const { jar } = await loginAsTest()
console.log('✓ test session established\n')

const kumarId = await fullPipeline(jar, 'Kumar', '/Users/kumarjha/Code/likeness-vid-gen/Testing/Kumar.jpeg')
const kirtiId = await fullPipeline(jar, 'Kirti', '/Users/kumarjha/Code/likeness-vid-gen/Testing/Kirti.JPG')

const state = { kumarId, kirtiId, kickedOffAt: new Date().toISOString() }
writeFileSync(process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/character-ids.json', JSON.stringify(state, null, 2))
console.log(`\n✓ Both characters training. Poll status via GET /api/characters/[id]`)
console.log(`  Kumar: ${kumarId}`)
console.log(`  Kirti: ${kirtiId}`)
