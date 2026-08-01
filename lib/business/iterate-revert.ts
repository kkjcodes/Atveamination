import type { AdScript } from "@/lib/business/adscript-schema"

// Pure function used by the revert endpoint. Kept in its own module so tests
// can import it without pulling in `lib/business/iterate.ts` (which instantiates
// the Anthropic client at module load — refuses to run in jsdom test env).
export function buildRevertVersion(
  sourceScript: AdScript,
  nextVersionNo: number,
  targetVersionNo: number,
): { versionNo: number; adScript: AdScript; editRequest: string } {
  return {
    versionNo: nextVersionNo,
    adScript: sourceScript,
    editRequest: `Reverted to version ${targetVersionNo}`,
  }
}
