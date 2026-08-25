import { describe, it, expect } from "vitest"
import { execSync } from "child_process"

// A2 enforcement: brand strings live ONLY in config/brand.ts. A rebrand must
// require editing exactly one file — any literal outside it is a defect.
// Infra identifiers are exempt: they name deployed resources, not the brand,
// and don't change at rebrand.
const EXEMPT: Array<{ file: string; contains: string }> = [
  // Blob container fallback — deployed Azure resource name.
  { file: "lib/storage/client.ts", contains: 'AZURE_STORAGE_CONTAINER_NAME ?? "atveanimation"' },
  // Internal E2E test-account domain (reserved TLD), gated by admin secret.
  { file: "app/api/auth/register/route.ts", contains: "@atveanimation.test" },
]

describe("brand literals", () => {
  it("appear nowhere outside config/brand.ts (except infra exemptions)", () => {
    let out = ""
    try {
      out = execSync(
        'grep -rn -E "AtVeAnimation|atveanimation|AtVe Animation" app components lib --include="*.ts" --include="*.tsx"',
        { encoding: "utf8", cwd: process.cwd() },
      )
    } catch {
      // grep exits 1 on zero matches — that's a pass.
      return
    }
    const offenders = out
      .trim()
      .split("\n")
      .filter((line) => !EXEMPT.some((e) => line.startsWith(e.file) && line.includes(e.contains)))
    expect(offenders, `Brand literals outside config/brand.ts:\n${offenders.join("\n")}`).toEqual([])
  })
})
