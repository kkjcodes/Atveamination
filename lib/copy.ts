// Single source of truth for user-facing status labels and copy strings
// across the app. Anything the end user reads should live here.
//
// Rationale (from code review): dashboard was showing "processing" / "LoRA"
// / "Stitch" — raw internal vocabulary that means nothing to a shop owner
// or grandparent. Consistent language across three modules also makes the
// app feel like ONE product instead of three loosely-linked tools.

// Generic status vocabulary — used for badges/labels regardless of module.
export const STATUS_LABELS: Record<string, string> = {
  // Long-running work
  processing: "Still working",
  generating: "Still working",
  running: "Still working",
  // Sub-phases within a pipeline (scrapbook)
  vision: "Reading photo",
  before: "Painting",
  after: "Building motion",
  motion: "Animating",
  qc: "Checking",
  // Terminal
  done: "Ready",
  succeeded: "Ready",
  ready: "Ready",
  failed: "Needs attention",
  // Pre-work
  draft: "Draft",
  idle: "Not started",
  pending: "Waiting",
}

export function statusLabel(raw: string | null | undefined): string {
  if (!raw) return "Not started"
  return STATUS_LABELS[raw] ?? "Still working"
}

// Product vocabulary — user-friendly names for internal concepts. Callers
// should reference these constants instead of hardcoding strings so a
// single edit here propagates everywhere.
export const PRODUCT_TERMS = {
  loraTraining: "Character training",
  stitchButton: "Create final video",
  stitchAgainButton: "Create it again",
  stitchInProgress: "Making your video…",
  renderedPage: "Animated page",
  makeVideoButton: "Make a video",
  augmentation: "Preparing training images",
} as const

// Standardized copy for the 6 questions every async operation should answer.
// `AsyncWorkStatus` component pulls from these dictionaries.
//
// Durability disclosure: only characterTrain is truly "leave and come back"
// safe — fal's own infrastructure runs the training job independent of our
// container, and the fal webhook advances state whether our tab is open or
// not. Everything else runs ffmpeg / replicate.run / vision calls inside
// the Node request process; a container SIGTERM during deploy or scale-down
// can kill in-flight work. For those, copy acknowledges the one-tap-retry
// safety net (see the stale-recovery banner in AsyncWorkStatus) instead of
// promising the work will finish unattended.
export const ASYNC_WORK_COPY = {
  scrapbookPageGenerate: {
    whatsHappening: "Painting your page and adding gentle motion.",
    howLong: "About 30 seconds to 2 minutes per page.",
    canLeave: "You can leave — if it looks stuck when you return, we'll offer a one-tap retry.",
    savedState: "Your photo and caption are saved.",
    ifItFails: "We'll fall back to a still-photo animation of your original shot.",
  },
  scrapbookStitch: {
    whatsHappening: "Stitching your pages into one video.",
    howLong: "Usually 90 seconds to 3 minutes.",
    canLeave: "You can leave — if it looks stuck when you return, we'll offer a one-tap retry.",
    savedState: "All your pages are saved.",
    ifItFails: "Your pages stay saved. Try creating the video again.",
  },
  characterAugment: {
    whatsHappening: "Preparing training images from your photo.",
    howLong: "About 2 to 5 minutes.",
    canLeave: "You can leave — if it looks stuck when you return, we'll offer a one-tap retry.",
    savedState: "Your photo and style pick are saved.",
    ifItFails: "We'll train with a single image instead (works, but less accurate).",
  },
  // Only characterTrain can promise durability — fal runs the training job on
  // their infrastructure and advances our row via webhook regardless of tab.
  characterTrain: {
    whatsHappening: "Training your character so future videos look like you.",
    howLong: "First-time character setup takes about 15 to 30 minutes.",
    canLeave: "You can leave — training runs on our AI partner's servers and will finish even if this tab is closed.",
    savedState: "Your training images are saved.",
    ifItFails: "You can retry the training without regenerating images.",
  },
  businessRender: {
    whatsHappening: "Making your video.",
    howLong: "Usually 60 to 120 seconds.",
    canLeave: "You can leave — if it looks stuck when you return, we'll offer a one-tap retry.",
    savedState: "Your ad script is saved.",
    ifItFails: "Your script stays saved. Try making the video again.",
  },
} as const
