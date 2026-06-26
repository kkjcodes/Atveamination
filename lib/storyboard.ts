// Auto-assigns focus characters to scenes for multi-character videos.
// 70-80% of scenes focus on a single character (full LoRA quality).
// 20-30% are shared scenes (focusCharacterId=null → composite reference panel).

export interface SceneFocusAssignment {
  orderIndex: number
  focusCharacterId: string | null
}

export function assignSceneFocus(
  characterIds: string[],
  sceneCount: number
): SceneFocusAssignment[] {
  if (characterIds.length === 0) return []
  if (characterIds.length === 1) {
    return Array.from({ length: sceneCount }, (_, i) => ({
      orderIndex: i,
      focusCharacterId: characterIds[0],
    }))
  }

  const sharedCount = Math.max(0, Math.round(sceneCount * 0.25))
  const focusCount = sceneCount - sharedCount

  // Build the focus slots: cycle through characters evenly
  const focusSlots: string[] = []
  for (let i = 0; i < focusCount; i++) {
    focusSlots.push(characterIds[i % characterIds.length])
  }

  // Distribute shared scenes across the sequence.
  // Place one shared scene roughly every 4 scenes (after every 3 focus scenes).
  const assignments: SceneFocusAssignment[] = []
  let focusIdx = 0
  let sharedPlaced = 0
  const sharedInterval = sharedCount > 0 ? Math.floor(focusCount / sharedCount) : Infinity

  for (let i = 0; i < sceneCount; i++) {
    const isSharedSlot = sharedPlaced < sharedCount
      && focusIdx > 0
      && focusIdx % sharedInterval === 0

    if (isSharedSlot) {
      assignments.push({ orderIndex: i, focusCharacterId: null })
      sharedPlaced++
    } else {
      assignments.push({ orderIndex: i, focusCharacterId: focusSlots[focusIdx] ?? null })
      focusIdx++
    }
  }

  // If any shared scenes weren't placed (edge case), append them as null
  while (assignments.length < sceneCount) {
    assignments.push({ orderIndex: assignments.length, focusCharacterId: null })
  }

  return assignments
}
