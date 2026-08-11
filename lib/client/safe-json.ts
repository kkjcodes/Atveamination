// Read a fetch Response as JSON without throwing on empty or non-JSON bodies.
//
// Proxy-layer failures (a deploy restarting replicas, a scale-from-zero cold
// start, an aborted mobile upload) return empty 5xx responses. Calling
// res.json() on those throws `Failed to execute 'json' on 'Response':
// Unexpected end of JSON input`, and pages that surface e.message show users
// that raw exception (user-reported on the new-character flow).

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

// Friendly message for responses whose body couldn't be read. Keyed off
// status so infrastructure hiccups don't read as user mistakes.
export function friendlyFetchError(res: Response, fallback: string): string {
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return "We're briefly updating the app. Give it a few seconds and try again."
  }
  if (res.status === 413) {
    return "That file is too large. Try a smaller photo."
  }
  return fallback
}
