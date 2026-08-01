// Pure JSON extraction from Sonnet vision output. Kept in its own module so
// tests can import it without pulling in the Anthropic SDK (which
// instantiates a client at module-load time — breaks tests when no API key
// is set in the env).

export function parseVisionJson(text: string): unknown {
  let t = text.trim()
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()
  }
  const start = t.indexOf("{")
  const end = t.lastIndexOf("}")
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in vision response: ${text.slice(0, 200)}`)
  }
  return JSON.parse(t.slice(start, end + 1))
}
