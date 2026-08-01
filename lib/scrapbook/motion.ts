import { falAny } from "@/lib/fal/client"
import { SCRAPBOOK_MODELS } from "@/lib/scrapbook/config"
import type { ShotPlan } from "@/lib/scrapbook/models"

// Dynamic route: WAN 2.1 first-last-frame → video via fal.queue.submit
// (async, completion arrives on /api/webhooks/fal).
//
// The prediction ID is prefixed "sb:" so the fal webhook routes it to the
// scrapbook advance path instead of the existing scene pipeline.
//
// Per @fal-ai/client v1.10.1 types: the input fields are `start_image_url`
// and `end_image_url` (NOT first_frame_url / last_frame_url — that was our
// earlier guess and silently 422'd every dynamic-motion page since launch).
// Model output: `{ video: { url } }`.
//
// Additional docs from SDK: `prompt` required; `num_frames` default 81, valid
// range 81-100 (>81 costs 1.25× billing); `resolution` "480p" (0.5 units) or
// "720p" (1 unit); `aspect_ratio` auto by default. If the input image aspect
// doesn't match the chosen aspect_ratio, WAN resizes + center-crops for us,
// so no pre-normalization is needed on this path (unlike RIFE).

export async function submitDynamicClip(
  beforeUrl: string,
  afterUrl: string,
  shotPlan: ShotPlan,
): Promise<{ predictionId: string; requestId: string }> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.WEBHOOK_SECRET
  const falWebhookUrl = base && !base.includes("localhost") && webhookSecret
    ? `${base}/api/webhooks/fal?secret=${webhookSecret}`
    : undefined

  const submit = await falAny.queueSubmit(SCRAPBOOK_MODELS.wanFlf2v, {
    input: {
      start_image_url: beforeUrl,
      end_image_url: afterUrl,
      prompt: shotPlan.motion_prompt,
      resolution: "720p",
    },
    ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
  })

  return {
    predictionId: `sb:${submit.request_id}`,
    requestId: submit.request_id,
  }
}
