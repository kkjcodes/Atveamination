export function logError(
  route: string,
  action: string,
  context: Record<string, unknown>,
  err: unknown
): void {
  const error = err instanceof Error ? err : new Error(String(err))
  console.error(
    JSON.stringify({
      level: "error",
      route,
      action,
      ...context,
      error: error.message,
      stack: error.stack?.split("\n").slice(0, 6).join(" | "),
      ts: new Date().toISOString(),
    })
  )
}
