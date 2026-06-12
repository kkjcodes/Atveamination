export type JobStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled"

export interface Character {
  id: string
  user_id: string
  name: string
  source_photo_url: string
  selected_style_url: string | null
  selected_style: string | null
  lora_version: string | null
  lora_training_status: JobStatus | null
  created_at: string
}

export interface CharacterOption {
  id: string
  character_id: string
  style_url: string
  style_name: string
  created_at: string
}

export interface Voice {
  id: string
  user_id: string
  character_id: string
  sample_audio_url: string | null
  tts_params: Record<string, unknown>
  created_at: string
}

export interface Scene {
  id: string
  project_id: string
  order_index: number
  description: string
  generation_phase: string | null
  image_url: string | null
  audio_url: string | null
  video_clip_url: string | null
  duration_seconds: number | null
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  character_id: string
  voice_id: string | null
  title: string
  status: JobStatus
  final_video_url: string | null
  created_at: string
  character?: Character
  scenes?: Scene[]
}

export interface Job {
  id: string
  user_id: string
  type: "cartoon_generation" | "lora_training" | "tts" | "video_clip" | "video_stitch"
  replicate_prediction_id: string | null
  entity_id: string
  entity_type: "character" | "scene" | "project"
  status: JobStatus
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}
