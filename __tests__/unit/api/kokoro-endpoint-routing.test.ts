import { describe, it, expect } from "vitest"
import { synthesisEndpoint, endpointForVoice } from "@/lib/kokoro/synth"

// Hindi/Spanish voices were being sent to the bare `fal-ai/kokoro` alias,
// which runs the American-English pipeline and garbles non-English text.
// synthesisEndpoint routes hi/es voices to their language endpoints while
// keeping English voices on the fast bare alias.

describe("synthesisEndpoint", () => {
  it("routes Hindi voices to the hindi endpoint", () => {
    expect(synthesisEndpoint("hf_alpha")).toBe("fal-ai/kokoro/hindi")
    expect(synthesisEndpoint("hm_omega")).toBe("fal-ai/kokoro/hindi")
  })

  it("routes Spanish voices to the spanish endpoint", () => {
    expect(synthesisEndpoint("ef_dora")).toBe("fal-ai/kokoro/spanish")
    expect(synthesisEndpoint("em_alex")).toBe("fal-ai/kokoro/spanish")
    expect(synthesisEndpoint("em_santa")).toBe("fal-ai/kokoro/spanish")
  })

  it("keeps English voices on the fast bare alias", () => {
    expect(synthesisEndpoint("af_heart")).toBe("fal-ai/kokoro")
    expect(synthesisEndpoint("am_adam")).toBe("fal-ai/kokoro")
    expect(synthesisEndpoint("bf_emma")).toBe("fal-ai/kokoro")
    expect(synthesisEndpoint("bm_george")).toBe("fal-ai/kokoro")
  })

  it("unknown prefixes fall back to the bare alias", () => {
    expect(synthesisEndpoint("zz_unknown")).toBe("fal-ai/kokoro")
  })
})

describe("endpointForVoice", () => {
  it("maps every language prefix to its endpoint", () => {
    expect(endpointForVoice("af_heart")).toBe("fal-ai/kokoro/american-english")
    expect(endpointForVoice("bm_george")).toBe("fal-ai/kokoro/british-english")
    expect(endpointForVoice("hf_beta")).toBe("fal-ai/kokoro/hindi")
    expect(endpointForVoice("ef_dora")).toBe("fal-ai/kokoro/spanish")
  })
})
