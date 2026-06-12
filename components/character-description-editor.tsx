"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type Props = {
  characterId: string
  initialDescription: string | null
}

export default function CharacterDescriptionEditor({ characterId, initialDescription }: Props) {
  const [description, setDescription] = useState(initialDescription ?? "")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() {
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_description: description.trim() || null }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? "Save failed")
      }
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDescription(initialDescription ?? "")
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 group">
        <div className="flex-1 min-w-0">
          {description ? (
            <p className="text-sm text-zinc-700">{description}</p>
          ) : (
            <p className="text-sm text-zinc-400 italic">
              No description — add one to guide consistent generation across all scenes
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={startEdit}
          className="text-xs text-zinc-400 hover:text-violet-600 shrink-0 transition-colors"
        >
          {description ? "Edit" : "Add"}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. 35-year-old man with curly brown hair, athletic build, friendly expression"
        rows={2}
        className="text-sm"
      />
      <p className="text-xs text-zinc-400">
        Include age, gender, physical traits — prepended to every scene prompt for consistency.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
