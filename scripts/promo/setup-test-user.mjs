import { readFileSync, writeFileSync } from 'fs'

const BASE = 'https://www.atveanimation.com'
const [adminEmail, adminPw] = readFileSync(process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/CRITICAL-ROTATE-THESE.txt', 'utf8').trim().split('|')

const testEmail = `claudetestagent${Date.now()}@atveanimation.test`
const testPw = 'ClaudeTest' + Math.random().toString(36).slice(2, 12) + '!'

// Cookie jar
class Jar {
  constructor() { this.cookies = new Map() }
  add(setCookie) {
    if (!setCookie) return
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie]
    for (const raw of arr) {
      const [pair] = raw.split(';')
      const [k, v] = pair.split('=')
      if (k && v !== undefined) this.cookies.set(k.trim(), v.trim())
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
}

async function login(email, password) {
  const jar = new Jar()
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  jar.add(csrfRes.headers.getSetCookie())
  const { csrfToken } = await csrfRes.json()

  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: 'true' })
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: body.toString(),
    redirect: 'manual',
  })
  jar.add(loginRes.headers.getSetCookie())
  const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: jar.header() } })
  const sess = await sessRes.json()
  if (!sess?.user?.id) throw new Error(`Login failed for ${email}: ${JSON.stringify(sess)}`)
  return { jar, session: sess }
}

// Step 1: register test account (public endpoint)
console.log(`Registering ${testEmail}...`)
const regRes = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: testEmail, password: testPw, name: 'Claude Test Agent' }),
})
if (!regRes.ok) throw new Error(`Register failed: ${regRes.status} ${await regRes.text()}`)
const { user: testUser } = await regRes.json()
console.log(`✓ Test user id ${testUser.id}`)

// Step 2: login as admin
console.log(`Logging in as ${adminEmail}...`)
const admin = await login(adminEmail, adminPw)
console.log(`✓ Admin session (role=${admin.session.user.role})`)

// Step 3: promote test user to SUPER_USER
const patchRes = await fetch(`${BASE}/api/admin/users/${testUser.id}/role`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Cookie: admin.jar.header() },
  body: JSON.stringify({ role: 'SUPER_USER' }),
})
if (!patchRes.ok) throw new Error(`Promote failed: ${patchRes.status} ${await patchRes.text()}`)
console.log(`✓ Promoted to SUPER_USER`)

// Step 4: save credentials for downstream scripts
const credsFile = process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/test-account.json'
writeFileSync(credsFile, JSON.stringify({ email: testEmail, password: testPw, userId: testUser.id }, null, 2))
console.log(`✓ Test creds saved to ${credsFile}`)
