import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import type { Clip } from "@/lib/video/concat"

// Mock fluent-ffmpeg before importing the module under test
const mockRun = vi.fn()
const mockOutput = vi.fn()
const mockOutputOptions = vi.fn()
const mockInputOptions = vi.fn()
const mockInput = vi.fn()
const mockOn = vi.fn()

const chain = {
  input: mockInput,
  inputOptions: mockInputOptions,
  outputOptions: mockOutputOptions,
  output: mockOutput,
  on: mockOn,
  run: mockRun,
}
mockInput.mockReturnValue(chain)
mockInputOptions.mockReturnValue(chain)
mockOutputOptions.mockReturnValue(chain)
mockOutput.mockReturnValue(chain)
mockOn.mockReturnValue(chain)

const mockFfmpegFactory = vi.fn(() => chain)

vi.mock("fluent-ffmpeg", () => ({
  default: Object.assign(mockFfmpegFactory, {
    setFfmpegPath: vi.fn(),
  }),
}))

vi.mock("ffmpeg-static", () => ({ default: "/usr/bin/ffmpeg" }))

const { concatenateClips } = await import("@/lib/video/concat")

function toArrayBuffer(data: string): ArrayBuffer {
  const nodeBuf = Buffer.from(data)
  return nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength)
}

function makeFetchOk(data = "video-bytes") {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(toArrayBuffer(data)),
  })
}

function clip(videoUrl: string, audioUrl: string | null = null): Clip {
  return { videoUrl, audioUrl }
}

// Auto-resolve all ffmpeg .on("end") calls so tests don't hang
function autoResolveEnd() {
  mockOn.mockImplementation((event: string, cb: () => void) => {
    if (event === "end") setTimeout(cb, 0)
    return chain
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInput.mockReturnValue(chain)
  mockInputOptions.mockReturnValue(chain)
  mockOutputOptions.mockReturnValue(chain)
  mockOutput.mockReturnValue(chain)
  mockOn.mockReturnValue(chain)
  mockFfmpegFactory.mockReturnValue(chain)
  // FFmpeg is mocked so it never writes the merged output file;
  // stub copyFile so the single-clip path doesn't fail on a missing file.
  vi.spyOn(fs, "copyFile").mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("concatenateClips", () => {
  it("throws when given an empty clip list", async () => {
    await expect(concatenateClips([], "/tmp/out.mp4")).rejects.toThrow("No clips to concatenate")
  })

  it("throws when a download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(
      concatenateClips([clip("https://example.com/v.mp4")], "/tmp/out.mp4")
    ).rejects.toThrow("404")
  })

  it("calls ffmpeg to merge video with silent audio for a clip without audio", async () => {
    vi.stubGlobal("fetch", makeFetchOk())
    autoResolveEnd()

    const outputPath = join(tmpdir(), `test_silent_${Date.now()}.mp4`)
    try {
      await concatenateClips([clip("https://example.com/v.mp4")], outputPath)
      // One merge call (video + silent audio), no concat call (single clip → copyFile)
      expect(mockFfmpegFactory).toHaveBeenCalledTimes(1)
      // Should use anullsrc for silent audio
      expect(mockInput).toHaveBeenCalledWith(expect.stringContaining("anullsrc"))
    } finally {
      await fs.unlink(outputPath).catch(() => {})
    }
  })

  it("maps the audio file when a clip has an audioUrl", async () => {
    vi.stubGlobal("fetch", makeFetchOk())
    autoResolveEnd()

    const outputPath = join(tmpdir(), `test_with_audio_${Date.now()}.mp4`)
    try {
      await concatenateClips(
        [clip("https://example.com/v.mp4", "https://example.com/a.wav")],
        outputPath
      )
      // Should pass audio file path (not anullsrc) as the second input
      const audioInputCall = mockInput.mock.calls.find(
        (args) => typeof args[0] === "string" && !args[0].includes("anullsrc")
          && args[0].includes("atve_")
      )
      expect(audioInputCall).toBeDefined()
    } finally {
      await fs.unlink(outputPath).catch(() => {})
    }
  })

  it("calls ffmpeg N+1 times for N clips (N merges + 1 concat)", async () => {
    vi.stubGlobal("fetch", makeFetchOk())
    autoResolveEnd()

    const outputPath = join(tmpdir(), `test_multi_${Date.now()}.mp4`)
    await concatenateClips(
      [clip("https://example.com/a.mp4"), clip("https://example.com/b.mp4")],
      outputPath
    )

    // 2 merge calls + 1 concat call
    expect(mockFfmpegFactory).toHaveBeenCalledTimes(3)
    // Final concat uses -f concat demuxer
    expect(mockInputOptions).toHaveBeenCalledWith(expect.arrayContaining(["-f", "concat", "-safe", "0"]))
  })

  it("uses -shortest flag to align audio length with video", async () => {
    vi.stubGlobal("fetch", makeFetchOk())
    autoResolveEnd()

    const outputPath = join(tmpdir(), `test_shortest_${Date.now()}.mp4`)
    await concatenateClips([clip("https://example.com/v.mp4")], outputPath)
    expect(mockOutputOptions).toHaveBeenCalledWith(expect.arrayContaining(["-shortest"]))
  })

  it("cleans up all temp files after success", async () => {
    vi.stubGlobal("fetch", makeFetchOk())
    autoResolveEnd()

    const createdPaths: string[] = []
    const origWriteFile = fs.writeFile.bind(fs)
    vi.spyOn(fs, "writeFile").mockImplementation(async (path, data) => {
      if (typeof path === "string" && path.includes("atve_")) createdPaths.push(path)
      return origWriteFile(path, data)
    })

    const outputPath = join(tmpdir(), `test_cleanup_${Date.now()}.mp4`)
    try {
      await concatenateClips(
        [clip("https://example.com/a.mp4"), clip("https://example.com/b.mp4")],
        outputPath
      )
    } finally {
      vi.restoreAllMocks()
    }

    for (const p of createdPaths) {
      await expect(fs.access(p)).rejects.toThrow()
    }
  })

  it("cleans up temp files even when ffmpeg errors", async () => {
    vi.stubGlobal("fetch", makeFetchOk())

    mockOn.mockImplementation((event: string, cb: (err?: Error) => void) => {
      if (event === "error") setTimeout(() => cb(new Error("ffmpeg crashed")), 0)
      return chain
    })

    const createdPaths: string[] = []
    const origWriteFile = fs.writeFile.bind(fs)
    vi.spyOn(fs, "writeFile").mockImplementation(async (path, data) => {
      if (typeof path === "string" && path.includes("atve_")) createdPaths.push(path)
      return origWriteFile(path, data)
    })

    const outputPath = join(tmpdir(), `test_cleanup_err_${Date.now()}.mp4`)
    try {
      await expect(
        concatenateClips(
          [clip("https://example.com/a.mp4"), clip("https://example.com/b.mp4")],
          outputPath
        )
      ).rejects.toThrow("ffmpeg crashed")
    } finally {
      vi.restoreAllMocks()
    }

    for (const p of createdPaths) {
      await expect(fs.access(p)).rejects.toThrow()
    }
  })
})
