export type GenerationItem = {
  sceneId: string
  orderIndex: number
}

export type GenerationFns = {
  // Called once per scene to kick off its image generation.
  // Should handle errors internally — must not throw.
  startGeneration: (sceneId: string) => Promise<void>
  // Polls scene 1 until its imageUrl is stored in the DB.
  // Dependents use scene 1's generated image as the consistency anchor,
  // so they must not start until this resolves.
  // May throw if the scene fails — caller handles propagation.
  pollImageReady: (sceneId: string) => Promise<void>
  // Polls a scene until generation_phase === "done".
  // Should handle errors internally — must not throw.
  pollDone: (sceneId: string) => Promise<void>
}

// Orchestrates scene generation so character consistency is preserved.
//
// Scene 1 (orderIndex 0) generates its keyframe image first. Once that image
// is stored in the DB, the generate route for scenes 2-N uses it as the
// canonical character reference (via Flux Kontext Pro anchor). All remaining
// scenes then start in parallel, and all video generations run concurrently.
//
// If scene 1 is not in this batch (already generated), its imageUrl is already
// in the DB, so all scenes start in parallel immediately.
export async function orchestrateSceneGeneration(
  items: GenerationItem[],
  fns: GenerationFns
): Promise<void> {
  if (items.length === 0) return

  const sorted = [...items].sort((a, b) => a.orderIndex - b.orderIndex)
  const [first, ...rest] = sorted

  // Always start the first item (may or may not be scene 1)
  await fns.startGeneration(first.sceneId)

  // Wait for scene 1's keyframe before starting dependents so they can
  // reference it. Only needed when scene 1 is actually being generated now.
  if (first.orderIndex === 0 && rest.length > 0) {
    await fns.pollImageReady(first.sceneId)
  }

  // Start remaining scenes in parallel (scene 1's image is now in the DB)
  if (rest.length > 0) {
    await Promise.all(rest.map((item) => fns.startGeneration(item.sceneId)))
  }

  // Poll all scenes to completion in parallel for UI feedback.
  // The server drives actual completion via webhooks even if the browser closes.
  await Promise.all(sorted.map((item) => fns.pollDone(item.sceneId)))
}
