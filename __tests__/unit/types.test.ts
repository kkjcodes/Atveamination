import { describe, it, expect } from "vitest"
import type { Character, Scene, Job, JobStatus, Project, Voice } from "@/types/index"

// ---------------------------------------------------------------------------
// Helpers — build minimal conforming objects so TypeScript catches shape errors
// ---------------------------------------------------------------------------

function makeMockCharacter(overrides?: Partial<Character>): Character {
  return {
    id: "char-1",
    user_id: "user-1",
    name: "Test Character",
    source_photo_url: "https://example.com/photo.jpg",
    selected_style_url: null,
    selected_style: null,
    lora_version: null,
    lora_training_status: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeMockScene(overrides?: Partial<Scene>): Scene {
  return {
    id: "scene-1",
    project_id: "proj-1",
    order_index: 0,
    description: "A sunny day",
    generation_phase: null,
    image_url: null,
    audio_url: null,
    video_clip_url: null,
    duration_seconds: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeMockJob(overrides?: Partial<Job>): Job {
  return {
    id: "job-1",
    user_id: "user-1",
    type: "cartoon_generation",
    replicate_prediction_id: null,
    entity_id: "char-1",
    entity_type: "character",
    status: "pending",
    result: null,
    error: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeMockProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1",
    user_id: "user-1",
    character_id: "char-1",
    voice_id: null,
    title: "My Project",
    status: "pending",
    final_video_url: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeMockVoice(overrides?: Partial<Voice>): Voice {
  return {
    id: "voice-1",
    user_id: "user-1",
    character_id: "char-1",
    sample_audio_url: null,
    tts_params: {},
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

describe("Character type", () => {
  it("has all required fields", () => {
    const char = makeMockCharacter()
    expect(char).toHaveProperty("id")
    expect(char).toHaveProperty("user_id")
    expect(char).toHaveProperty("name")
    expect(char).toHaveProperty("source_photo_url")
    expect(char).toHaveProperty("selected_style_url")
    expect(char).toHaveProperty("lora_version")
    expect(char).toHaveProperty("lora_training_status")
    expect(char).toHaveProperty("created_at")
  })

  it("selected_style_url can be null", () => {
    const char = makeMockCharacter({ selected_style_url: null })
    expect(char.selected_style_url).toBeNull()
  })

  it("selected_style_url can be a string", () => {
    const char = makeMockCharacter({ selected_style_url: "https://example.com/style.jpg" })
    expect(typeof char.selected_style_url).toBe("string")
  })

  it("lora_training_status accepts valid JobStatus values", () => {
    const validStatuses: JobStatus[] = ["pending", "processing", "succeeded", "failed", "canceled"]
    for (const status of validStatuses) {
      const char = makeMockCharacter({ lora_training_status: status })
      expect(char.lora_training_status).toBe(status)
    }
  })

  it("lora_training_status can be null", () => {
    const char = makeMockCharacter({ lora_training_status: null })
    expect(char.lora_training_status).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

describe("Scene type", () => {
  it("has all required fields", () => {
    const scene = makeMockScene()
    expect(scene).toHaveProperty("id")
    expect(scene).toHaveProperty("project_id")
    expect(scene).toHaveProperty("order_index")
    expect(scene).toHaveProperty("description")
    expect(scene).toHaveProperty("image_url")
    expect(scene).toHaveProperty("audio_url")
    expect(scene).toHaveProperty("video_clip_url")
    expect(scene).toHaveProperty("duration_seconds")
    expect(scene).toHaveProperty("created_at")
  })

  it("order_index is a number", () => {
    const scene = makeMockScene({ order_index: 3 })
    expect(typeof scene.order_index).toBe("number")
  })

  it("nullable fields default to null", () => {
    const scene = makeMockScene()
    expect(scene.image_url).toBeNull()
    expect(scene.audio_url).toBeNull()
    expect(scene.video_clip_url).toBeNull()
    expect(scene.duration_seconds).toBeNull()
  })

  it("nullable fields accept non-null values", () => {
    const scene = makeMockScene({
      image_url: "https://example.com/img.png",
      audio_url: "https://example.com/audio.mp3",
      video_clip_url: "https://example.com/clip.mp4",
      duration_seconds: 5.5,
    })
    expect(scene.image_url).toBe("https://example.com/img.png")
    expect(scene.audio_url).toBe("https://example.com/audio.mp3")
    expect(scene.video_clip_url).toBe("https://example.com/clip.mp4")
    expect(scene.duration_seconds).toBe(5.5)
  })
})

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

describe("Job type", () => {
  it("has all required fields", () => {
    const job = makeMockJob()
    expect(job).toHaveProperty("id")
    expect(job).toHaveProperty("user_id")
    expect(job).toHaveProperty("type")
    expect(job).toHaveProperty("replicate_prediction_id")
    expect(job).toHaveProperty("entity_id")
    expect(job).toHaveProperty("entity_type")
    expect(job).toHaveProperty("status")
    expect(job).toHaveProperty("result")
    expect(job).toHaveProperty("error")
    expect(job).toHaveProperty("created_at")
  })

  it("accepts all valid job type values", () => {
    const types: Job["type"][] = [
      "cartoon_generation",
      "lora_training",
      "tts",
      "video_clip",
      "video_stitch",
    ]
    for (const type of types) {
      const job = makeMockJob({ type })
      expect(job.type).toBe(type)
    }
  })

  it("accepts all valid entity_type values", () => {
    const entityTypes: Job["entity_type"][] = ["character", "scene", "project"]
    for (const et of entityTypes) {
      const job = makeMockJob({ entity_type: et })
      expect(job.entity_type).toBe(et)
    }
  })
})

// ---------------------------------------------------------------------------
// JobStatus — all valid literal values
// ---------------------------------------------------------------------------

describe("JobStatus values", () => {
  const validStatuses: JobStatus[] = [
    "pending",
    "processing",
    "succeeded",
    "failed",
    "canceled",
  ]

  it("contains exactly the 5 expected status strings", () => {
    expect(validStatuses).toHaveLength(5)
  })

  it.each(validStatuses)('"%s" is a valid JobStatus', (status) => {
    const job = makeMockJob({ status })
    expect(job.status).toBe(status)
  })
})

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

describe("Project type", () => {
  it("has all required fields", () => {
    const project = makeMockProject()
    expect(project).toHaveProperty("id")
    expect(project).toHaveProperty("user_id")
    expect(project).toHaveProperty("character_id")
    expect(project).toHaveProperty("voice_id")
    expect(project).toHaveProperty("title")
    expect(project).toHaveProperty("status")
    expect(project).toHaveProperty("final_video_url")
    expect(project).toHaveProperty("created_at")
  })

  it("optional character field can be included", () => {
    const project = makeMockProject({ character: makeMockCharacter() })
    expect(project.character).toBeDefined()
    expect(project.character!.name).toBe("Test Character")
  })

  it("optional scenes field can be included", () => {
    const project = makeMockProject({ scenes: [makeMockScene()] })
    expect(Array.isArray(project.scenes)).toBe(true)
    expect(project.scenes!).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

describe("Voice type", () => {
  it("has all required fields", () => {
    const voice = makeMockVoice()
    expect(voice).toHaveProperty("id")
    expect(voice).toHaveProperty("user_id")
    expect(voice).toHaveProperty("character_id")
    expect(voice).toHaveProperty("sample_audio_url")
    expect(voice).toHaveProperty("tts_params")
    expect(voice).toHaveProperty("created_at")
  })

  it("tts_params is a record object", () => {
    const voice = makeMockVoice({ tts_params: { speed: 1.0, pitch: 0 } })
    expect(typeof voice.tts_params).toBe("object")
    expect(voice.tts_params).toHaveProperty("speed", 1.0)
  })
})
