import { readFileSync } from 'fs'

export const BASE = 'https://www.atveanimation.com'

export class Jar {
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

export async function login(email, password) {
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

export function loadTestCreds() {
  const p = process.env.HOME + '/Desktop/atve-linkedin-2026-07-26/test-account.json'
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function h(jar, extra = {}) {
  return { Cookie: jar.header(), ...extra }
}

export async function loginAsTest() {
  const c = loadTestCreds()
  return login(c.email, c.password)
}
