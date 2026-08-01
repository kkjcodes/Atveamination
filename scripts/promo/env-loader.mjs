import { readFileSync, existsSync } from 'fs'
export function loadEnv() {
  const files = ['.env.local', '.env']
  for (const f of files) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i === -1) continue
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
}
