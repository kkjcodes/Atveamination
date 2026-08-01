"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { STYLE_PRESETS, MAX_PAGES_PER_PROJECT, type ScrapbookStyle } from "@/lib/scrapbook/config"

type CharSummary = {
  id: string
  name: string
  source_photo_url: string
  selected_style_url: string | null
}

type StagedItem =
  | { kind: "file"; id: string; file: File; previewUrl: string }
  | { kind: "character"; id: string; characterId: string; name: string; previewUrl: string }

export default function NewScrapbookPage() {
  const router = useRouter()
  const [title, setTitle] = useState("Untitled Scrapbook")
  const [style, setStyle] = useState<ScrapbookStyle>("watercolor")
  const [tab, setTab] = useState<"upload" | "library">("upload")
  const [staged, setStaged] = useState<StagedItem[]>([])
  const [allCharacters, setAllCharacters] = useState<CharSummary[]>([])
  const [charLoading, setCharLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((data) => setAllCharacters(data.characters ?? []))
      .catch(() => setAllCharacters([]))
      .finally(() => setCharLoading(false))
  }, [])

  const stagedCharIds = new Set(
    staged.filter((s): s is Extract<StagedItem, { kind: "character" }> => s.kind === "character").map((s) => s.characterId),
  )
  const availableChars = allCharacters.filter((c) => !stagedCharIds.has(c.id))
  const remaining = MAX_PAGES_PER_PROJECT - staged.length

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, remaining)
    const items = list.map<StagedItem>((file) => ({
      kind: "file",
      id: `f_${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setStaged((prev) => [...prev, ...items])
  }

  function addCharacter(char: CharSummary) {
    if (remaining <= 0) return
    setStaged((prev) => [
      ...prev,
      {
        kind: "character",
        id: `c_${char.id}`,
        characterId: char.id,
        name: char.name,
        previewUrl: char.selected_style_url ?? char.source_photo_url,
      },
    ])
  }

  function removeItem(id: string) {
    setStaged((prev) => {
      const item = prev.find((s) => s.id === id)
      if (item?.kind === "file") URL.revokeObjectURL(item.previewUrl)
      return prev.filter((s) => s.id !== id)
    })
  }

  async function handleCreate() {
    if (staged.length === 0) {
      setError("Add at least one photo")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // 1. Create the project shell.
      const projRes = await fetch("/api/scrapbook/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, style }),
      })
      if (!projRes.ok) throw new Error((await projRes.json()).error ?? "Failed to create project")
      const { project } = await projRes.json()

      // 2. Add photos + library characters in one call.
      const fileItems = staged.filter((s): s is Extract<StagedItem, { kind: "file" }> => s.kind === "file")
      const charItems = staged.filter((s): s is Extract<StagedItem, { kind: "character" }> => s.kind === "character")

      const form = new FormData()
      for (const it of fileItems) form.append("photos", it.file)
      if (charItems.length > 0) {
        form.append("character_ids", JSON.stringify(charItems.map((c) => c.characterId)))
      }
      const photosRes = await fetch(`/api/scrapbook/projects/${project.id}/photos`, {
        method: "POST",
        body: form,
      })
      if (!photosRes.ok) throw new Error((await photosRes.json()).error ?? "Failed to add photos")

      router.push(`/scrapbook/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Scrapbook", href: "/scrapbook" }, { label: "New" }]} />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">New scrapbook</h1>
        <p className="text-zinc-500 mb-8">Upload photos, pick a style — we make an animated scrapbook.</p>

        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Title */}
            <div>
              <Label htmlFor="title" className="text-sm font-medium text-zinc-700 mb-1.5 block">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Summer trip, first day of school..."
              />
            </div>

            {/* Style tiles */}
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-1.5 block">Style</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(STYLE_PRESETS) as [ScrapbookStyle, typeof STYLE_PRESETS.watercolor][])
                  .map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStyle(key)}
                      className={`text-left rounded-xl border-2 p-3 transition-colors ${
                        style === key
                          ? "border-violet-500 bg-violet-50"
                          : "border-zinc-200 hover:border-zinc-300 bg-white"
                      }`}
                    >
                      <p className="font-semibold text-zinc-900 text-sm">{preset.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{preset.description}</p>
                    </button>
                  ))}
              </div>
            </div>

            {/* Photo source toggle */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-zinc-700 block">
                  Photos <span className="text-xs font-normal text-zinc-400 ml-1">up to {MAX_PAGES_PER_PROJECT}</span>
                </Label>
                <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setTab("upload")}
                    className={`px-3 py-1.5 transition-colors ${tab === "upload" ? "bg-violet-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    Upload new
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("library")}
                    className={`px-3 py-1.5 transition-colors ${tab === "library" ? "bg-violet-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    From your characters
                  </button>
                </div>
              </div>

              {tab === "upload" && (
                <label className="block border-2 border-dashed border-zinc-200 hover:border-violet-300 rounded-xl p-6 text-center cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={remaining <= 0}
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                  <div className="text-zinc-400 text-sm">
                    {remaining > 0 ? `Tap to choose photos (${remaining} left)` : "Photo limit reached"}
                  </div>
                </label>
              )}

              {tab === "library" && (
                <div className="border rounded-xl border-zinc-200 p-3">
                  {charLoading ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">Loading…</p>
                  ) : availableChars.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">
                      No characters available — {allCharacters.length === 0 ? "create one first" : "all already added"}.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                      {availableChars.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => addCharacter(c)}
                          disabled={remaining <= 0}
                          className="text-left rounded-lg border-2 border-zinc-200 hover:border-violet-300 transition-colors overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.selected_style_url ?? c.source_photo_url} alt={c.name} className="w-full h-16 object-cover" />
                          <p className="text-xs text-zinc-600 truncate px-1 py-0.5">{c.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Staged preview */}
              {staged.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {staged.map((item) => (
                    <div key={item.id} className="relative w-16 h-16 rounded-lg overflow-hidden group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center hover:bg-black/80"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                      {item.kind === "character" && (
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 truncate">
                          {item.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <Button
              size="lg"
              onClick={handleCreate}
              disabled={submitting || staged.length === 0}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0"
            >
              {submitting
                ? "Getting things ready…"
                : `Make my scrapbook (${staged.length} ${staged.length === 1 ? "page" : "pages"})`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
