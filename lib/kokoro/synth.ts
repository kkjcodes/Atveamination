import { fal } from "@/lib/fal/client"

// Kokoro TTS wrapper. Three concerns encapsulated here:
//
// 1. Endpoint. The @fal-ai/client SDK's type definitions only cover the
//    language-specific endpoints (fal-ai/kokoro/american-english etc.), but
//    those endpoints in practice have MUCH higher latency (measured ~57s
//    per call vs ~5-10s on the bare endpoint) — enough to blow past Azure
//    Container Apps' 240s ingress cap on multi-scene renders. English voices
//    stay on the bare `fal-ai/kokoro` alias which is fast and still supported;
//    Hindi/Spanish voices must use their language endpoints (the bare alias
//    garbles non-English text) and eat the latency.
//
// 2. Field-name mapping. Recent SDK versions use `prompt` for the text; the
//    legacy field was `text`. Server-side alias appears to accept both; we
//    send `prompt` to match the newer SDK type.
//
// 3. Response-shape parsing. Different Kokoro variants have surfaced audio
//    URL under `audio.url`, `audio_url`, and `audio_file.url` at different
//    times. All three are checked defensively.

const KOKORO_ENDPOINT = "fal-ai/kokoro"

// Voice ID prefix maps 1:1 with the language endpoint.
export function endpointForVoice(voiceId: string): string {
  const prefix = voiceId.slice(0, 2).toLowerCase()
  switch (prefix) {
    case "af":
    case "am": return "fal-ai/kokoro/american-english"
    case "bf":
    case "bm": return "fal-ai/kokoro/british-english"
    case "hf":
    case "hm": return "fal-ai/kokoro/hindi"
    case "ef":
    case "em": return "fal-ai/kokoro/spanish"
    default:   return "fal-ai/kokoro/american-english"
  }
}

// Hindi/Spanish voices MUST go to their language endpoints — the bare alias
// runs the American-English G2P pipeline, which garbles Hindi/Spanish text
// (reported as "audio mixed up / doesn't render correctly"). English voices
// stay on the fast bare alias (see latency note above).
export function synthesisEndpoint(voiceId: string): string {
  const prefix = voiceId.slice(0, 2).toLowerCase()
  if (prefix === "hf" || prefix === "hm" || prefix === "ef" || prefix === "em") {
    return endpointForVoice(voiceId)
  }
  return KOKORO_ENDPOINT
}

export type KokoroResult = { audioUrl: string }

export async function synthesizeKokoro(
  voiceId: string,
  text: string,
  speed: number = 1.0,
): Promise<KokoroResult> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("synthesizeKokoro: empty text")

  const endpoint = synthesisEndpoint(voiceId)
  const result = await fal.subscribe(endpoint, {
    input: { prompt: trimmed, voice: voiceId, speed } as never,
  })
  const d = result.data as { audio?: { url?: string }; audio_url?: string; audio_file?: { url?: string } }
  const audioUrl = d?.audio?.url ?? d?.audio_url ?? d?.audio_file?.url
  if (!audioUrl) {
    throw new Error(`Kokoro (${endpoint}) returned no audio URL. Response keys: ${Object.keys(d ?? {}).join(", ")}`)
  }
  return { audioUrl }
}
