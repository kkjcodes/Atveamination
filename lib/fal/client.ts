import { fal } from "@fal-ai/client"

fal.config({ credentials: process.env.FAL_KEY })

export { fal }

export const FAL_MODELS = {
  wan: "fal-ai/wan-i2v",
} as const
