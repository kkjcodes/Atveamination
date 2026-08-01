"use client"

import { useState, useRef } from "react"

type Props = {
  characterId: string
  initialName: string
}

export default function CharacterNameEditor({ characterId, initialName }: Props) {
  const [name, setName] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditing(true)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(initialName)
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Verify res.ok — old code accepted the new name locally even when
      // the PATCH failed, so users thought they'd renamed but the DB row
      // still had the old value on next refresh.
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      }).catch(() => null)
      if (!res || !res.ok) {
        setError("Couldn't rename. Try again.")
        setName(initialName)
        return
      }
      setName(trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save()
    if (e.key === "Escape") {
      setName(name)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
          disabled={saving}
          className="text-3xl font-bold text-zinc-900 bg-transparent border-b-2 border-violet-400 outline-none w-full max-w-sm"
        />
        {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="text-3xl font-bold text-zinc-900 hover:text-violet-700 transition-colors text-left group"
      title="Click to rename"
    >
      {name}
      <span className="ml-2 text-base font-normal text-zinc-300 group-hover:text-violet-400 transition-colors">
        ✎
      </span>
    </button>
  )
}
