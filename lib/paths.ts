import { fileURLToPath } from "url"
import { dirname, join, resolve } from "path"

// Central resolver for on-disk asset paths. Replaces the process.cwd() calls
// that used to be sprinkled across render helpers.
//
// Why this matters: Turbopack traces `process.cwd()` as an opaque runtime
// value and defensively includes the entire working directory in the
// standalone build (leaking secrets, personal photos, and planning docs into
// the standalone artifact). By computing paths via `import.meta.url` +
// `path.resolve()` here, Turbopack can statically resolve the target
// directory and traces only the files that actually get read.
//
// This module lives at /lib/paths.ts. The repo root is one level up.

const __dirname_this = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname_this, "..")

// Absolute path to /public/ at deploy time. Same value as process.cwd() would
// have returned in the container (WORKDIR=/app), but statically-analyzable so
// Turbopack traces narrowly.
export function publicPath(...segments: string[]): string {
  return join(REPO_ROOT, "public", ...segments)
}

// Absolute path to the repo root (rarely needed — prefer publicPath / ffprobe helpers).
export function repoRoot(): string {
  return REPO_ROOT
}

// Absolute path to the bundled ffprobe binary (part of ffprobe-static npm
// package). Used by lib/video/concat.ts + lib/scrapbook/qc.ts.
export function ffprobeBinary(): string {
  return join(REPO_ROOT, "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe")
}
