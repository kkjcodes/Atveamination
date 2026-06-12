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
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditing(true)
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
    try {
      await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      setName(trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
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
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        disabled={saving}
        className="text-3xl font-bold text-zinc-900 bg-transparent border-b-2 border-violet-400 outline-none w-full max-w-sm"
      />
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
