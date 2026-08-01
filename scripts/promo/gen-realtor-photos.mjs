import { writeFileSync } from 'fs'

const KEY = process.env.FAL_KEY
if (!KEY) throw new Error('FAL_KEY missing')

const PROMPTS = [
  { name: 'exterior', prompt: 'A photorealistic real-estate listing photograph of a modern 4-bedroom suburban home, warm afternoon light, well-manicured front lawn, neat driveway, wide-angle MLS listing style, 4k, sharp focus, no people' },
  { name: 'kitchen', prompt: 'A photorealistic real-estate listing photograph of a beautifully renovated modern kitchen with quartz island, stainless steel appliances, subway tile backsplash, hardwood floors, bright natural light through window, MLS listing style, no people' },
  { name: 'living', prompt: 'A photorealistic real-estate listing photograph of a spacious living room, hardwood floors, large window with natural daylight, staged tasteful furniture, neutral warm palette, MLS listing style, no people' },
  { name: 'bedroom', prompt: 'A photorealistic real-estate listing photograph of a bright airy master bedroom with hardwood floors, large window, neutral bedding, tasteful staging, MLS listing style, no people' },
  { name: 'street', prompt: 'A photorealistic photograph looking down a quiet suburban cul-de-sac lined with mature trees and family homes, warm afternoon light, no people, no cars in foreground' },
]

const OUT_DIR = process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/realtor-photos'

for (const { name, prompt } of PROMPTS) {
  console.log(`[${name}] submitting...`)
  const submit = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_inference_steps: 4, num_images: 1, enable_safety_checker: true }),
  })
  if (!submit.ok) throw new Error(`submit ${name}: ${submit.status} ${await submit.text()}`)
  const { request_id, status_url } = await submit.json()

  let done = false, resp
  for (let i = 0; i < 30 && !done; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const s = await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })
    const j = await s.json()
    if (j.status === 'COMPLETED') {
      const rr = await fetch(status_url.replace('/status', ''), { headers: { Authorization: `Key ${KEY}` } })
      resp = await rr.json()
      done = true
    } else if (j.status === 'FAILED') throw new Error(`failed: ${JSON.stringify(j)}`)
  }
  if (!done) throw new Error(`timeout on ${name}`)
  const imgUrl = resp.images?.[0]?.url
  if (!imgUrl) throw new Error(`no image url: ${JSON.stringify(resp)}`)
  const bin = await fetch(imgUrl)
  const buf = Buffer.from(await bin.arrayBuffer())
  writeFileSync(`${OUT_DIR}/${name}.jpg`, buf)
  console.log(`[${name}] ✓ ${buf.length} bytes → ${OUT_DIR}/${name}.jpg`)
}
console.log('all done')
