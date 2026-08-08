"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// Progressive-save onboarding form. Contract:
//   - First keystroke on ANY field lazily creates the Business draft row.
//   - Every subsequent change is auto-saved (500ms debounce).
//   - Save status is visible ("Saving…" / "Saved") so users know their work
//     is safe before closing the tab.
//   - Photos/logo save immediately on upload (no debounce needed — those are
//     explicit user actions).
//
// Result: closing the tab at ANY point is safe. Revisiting /business/new
// resumes exactly where we left off.

const MAX_PHOTOS = 20

type InitialBusiness = {
  id: string
  name: string
  oneLiner: string
  address: string | null
  notes: string | null
  phone: string | null
  website: string | null
  logoAssetId: string | null
} | null

type Photo = { id: string; url: string }
type SaveState = "idle" | "saving" | "saved" | "error"

export default function BusinessOnboarding({
  initialBusiness,
  initialPhotos,
  initialLogoUrl,
}: {
  initialBusiness: InitialBusiness
  initialPhotos: Photo[]
  initialLogoUrl: string | null
}) {
  const router = useRouter()

  const [businessId, setBusinessId] = useState<string | null>(initialBusiness?.id ?? null)
  const [name, setName] = useState(initialBusiness?.name ?? "")
  const [oneLiner, setOneLiner] = useState(initialBusiness?.oneLiner ?? "")
  const [address, setAddress] = useState(initialBusiness?.address ?? "")
  const [notes, setNotes] = useState(initialBusiness?.notes ?? "")
  const [phone, setPhone] = useState(initialBusiness?.phone ?? "")
  const [website, setWebsite] = useState(initialBusiness?.website ?? "")
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)

  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const businessIdRef = useRef<string | null>(businessId)
  useEffect(() => { businessIdRef.current = businessId }, [businessId])
  // In-flight POST /api/business promise, so concurrent ensureBusiness calls
  // don't each create a new draft row. Cleared on rejection.
  const draftPromiseRef = useRef<Promise<string> | null>(null)

  const complete = useMemo(
    () => name.trim().length > 0 && oneLiner.trim().length > 0 && photos.length >= 1,
    [name, oneLiner, photos.length],
  )

  // Lazy-create the business draft row on first touch of any field. Guards
  // against a well-hidden race: when Playwright (or a fast typist) fires
  // several field changes back to back, each debounced persist could call
  // ensureBusiness before the first response landed → duplicate businesses,
  // and the ref would win/lose arbitrarily, leaving user's real edits stuck
  // on an orphan draft. Memoize the in-flight promise, not just the id.
  const ensureBusiness = useCallback(async (): Promise<string> => {
    if (businessIdRef.current) return businessIdRef.current
    if (draftPromiseRef.current) return draftPromiseRef.current
    draftPromiseRef.current = (async () => {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        draftPromiseRef.current = null
        throw new Error("Failed to create draft")
      }
      const { business } = await res.json()
      businessIdRef.current = business.id
      setBusinessId(business.id)
      return business.id
    })()
    return draftPromiseRef.current
  }, [])

  const persist = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const id = await ensureBusiness()
      setSaveState("saving")
      const res = await fetch(`/api/business/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error("save failed")
      setSaveState("saved")
    } catch {
      setSaveState("error")
    }
  }, [ensureBusiness])

  // Debounced text-field auto-save.
  useEffect(() => {
    if (!initialBusiness && name.length === 0 && oneLiner.length === 0 && address.length === 0 && notes.length === 0 && phone.length === 0 && website.length === 0) {
      // Don't fire on the empty initial render.
      return
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    // Debounced-save UX: setSaveState "saving" as the visible signal that the
    // debounce timer is running; the persist() call inside setTimeout fires
    // outside this render pass, so the state update chain doesn't cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveState("saving")
    debounceTimer.current = setTimeout(() => {
      persist({ name, oneLiner, address: address || null, notes: notes || null, phone: phone || null, website: website || null })
    }, 500)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, oneLiner, address, notes, phone, website])

  async function handlePhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = MAX_PHOTOS - photos.length
    const slice = Array.from(files).slice(0, remaining)
    if (slice.length === 0) return

    try {
      const id = await ensureBusiness()
      const form = new FormData()
      for (const f of slice) form.append("photos", f)
      const res = await fetch(`/api/business/${id}/photos`, { method: "POST", body: form })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Upload failed")
      }
      const { photos: uploaded } = await res.json() as { photos: Photo[] }
      setPhotos((prev) => [...prev, ...uploaded])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    }
  }

  async function movePhoto(assetId: string, dir: -1 | 1) {
    const i = photos.findIndex((p) => p.id === assetId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= photos.length) return
    const next = [...photos]
    ;[next[i], next[j]] = [next[j], next[i]]
    setPhotos(next)
    // Persist — best-effort; the grid already shows the new order.
    const id = businessIdRef.current
    if (!id) return
    void fetch(`/api/business/${id}/photos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedAssetIds: next.map((p) => p.id) }),
    }).catch(() => {})
  }

  async function removePhoto(assetId: string) {
    const id = businessIdRef.current
    if (!id) return
    // Verify res.ok — old code removed locally regardless, so a failed delete
    // left the row in the DB but the user thought the photo was gone. Next
    // render would try to use the "removed" asset and 400 with "not found".
    const res = await fetch(`/api/business/${id}/photos?assetId=${assetId}`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) {
      setError("Couldn't remove this photo. Check your connection and try again.")
      return
    }
    setPhotos((prev) => prev.filter((p) => p.id !== assetId))
  }

  async function handleLogo(file: File) {
    try {
      const id = await ensureBusiness()
      const form = new FormData()
      form.append("logo", file)
      const res = await fetch(`/api/business/${id}/logo`, { method: "POST", body: form })
      if (!res.ok) throw new Error("Logo upload failed")
      const { logo } = await res.json() as { logo: { url: string } }
      setLogoUrl(logo.url)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logo upload failed")
    }
  }

  async function removeLogo() {
    const id = businessIdRef.current
    if (!id) return
    const res = await fetch(`/api/business/${id}/logo`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) {
      setError("Couldn't remove the logo. Check your connection and try again.")
      return
    }
    setLogoUrl(null)
  }

  async function markReady() {
    setSubmitting(true)
    setError(null)
    try {
      const id = await ensureBusiness()
      const res = await fetch(`/api/business/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      })
      if (!res.ok) throw new Error("Failed to save")
      // Business ready → land on the (M3) ad-generation page. M2 stops here.
      router.push(`/business`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Save status pill — always visible, tells user their work is safe */}
        <div className="flex items-center justify-end -mt-2 -mr-2">
          <SaveIndicator state={saveState} />
        </div>

        {/* Business name */}
        <div>
          <Label htmlFor="name" className="text-sm font-medium text-zinc-700 mb-1.5 block">
            What&apos;s your business called? <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rosie's Bakery"
          />
        </div>

        {/* One-liner */}
        <div>
          <Label htmlFor="oneLiner" className="text-sm font-medium text-zinc-700 mb-1.5 block">
            Tell us what you offer <span className="text-red-500">*</span>
          </Label>
          <Input
            id="oneLiner"
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            placeholder="Fresh sourdough baked every morning at 6am."
          />
          <p className="text-xs text-zinc-400 mt-1">This shapes the tone of the ad.</p>
        </div>

        {/* Address */}
        <div>
          <Label htmlFor="address" className="text-sm font-medium text-zinc-700 mb-1.5 block">
            Where are you? <span className="text-xs font-normal text-zinc-400">optional</span>
          </Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Example Street"
          />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="phone" className="text-sm font-medium text-zinc-700 mb-1.5 block">
              Phone <span className="text-xs font-normal text-zinc-400">optional — shown on your ads</span>
            </Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-013-0142" />
          </div>
          <div>
            <Label htmlFor="website" className="text-sm font-medium text-zinc-700 mb-1.5 block">
              Website <span className="text-xs font-normal text-zinc-400">optional</span>
            </Label>
            <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbusiness.com" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="notes" className="text-sm font-medium text-zinc-700 mb-1.5 block">
            Anything else? <span className="text-xs font-normal text-zinc-400">optional</span>
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Open Tue-Sun 6am-2pm. Family-owned since 1998."
            rows={2}
          />
        </div>

        {/* Logo */}
        <div>
          <Label className="text-sm font-medium text-zinc-700 mb-1.5 block">
            Logo <span className="text-xs font-normal text-zinc-400">optional</span>
          </Label>
          {logoUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="logo" className="w-16 h-16 object-contain border border-zinc-200 rounded-lg bg-white p-1" />
              <button
                type="button"
                onClick={removeLogo}
                className="text-xs text-zinc-500 hover:text-red-500"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-zinc-200 hover:border-amber-300 rounded-xl p-4 text-center cursor-pointer transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
              />
              <span className="text-sm text-zinc-400">Add your logo</span>
            </label>
          )}
        </div>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-sm font-medium text-zinc-700 block">
              Photos of your work <span className="text-red-500">*</span>
              <span className="text-xs font-normal text-zinc-400 ml-1">pick 1–{MAX_PHOTOS}</span>
            </Label>
            <span className="text-xs text-zinc-400">{photos.length}/{MAX_PHOTOS}</span>
          </div>
          <label className="block border-2 border-dashed border-zinc-200 hover:border-orange-300 rounded-xl p-6 text-center cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={photos.length >= MAX_PHOTOS}
              onChange={(e) => handlePhotos(e.target.files)}
            />
            <span className="text-sm text-zinc-400">
              {photos.length >= MAX_PHOTOS
                ? `That's ${MAX_PHOTOS}. Remove one to swap it out.`
                : `Add photos (${MAX_PHOTOS - photos.length} of ${MAX_PHOTOS} spots open)`}
            </span>
          </label>
          {photos.length > 0 && (
            <>
              {photos.length > 1 && (
                <p className="mt-2 text-xs text-zinc-400">
                  This is the order your ad will use — the arrows rearrange it.
                </p>
              )}
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-5 gap-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="w-full">
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-0 right-0 bg-black/60 text-white text-xs w-5 h-5 flex items-center justify-center hover:bg-black/80"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                    {photos.length > 1 && (
                      <div className="mt-1 flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePhoto(p.id, -1)}
                          disabled={i === 0}
                          aria-label={`Move photo ${i + 1} earlier`}
                          className="rounded border border-zinc-200 px-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-30"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhoto(p.id, 1)}
                          disabled={i === photos.length - 1}
                          aria-label={`Move photo ${i + 1} later`}
                          className="rounded border border-zinc-200 px-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-30"
                        >
                          →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <Button
          size="lg"
          onClick={markReady}
          disabled={!complete || submitting}
          className="w-full bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white border-0"
        >
          {submitting
            ? "Saving your progress…"
            : complete
              ? "Save and keep going"
              : "Add a name, a one-liner, and one photo first"}
        </Button>
      </CardContent>
    </Card>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null
  return (
    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
      state === "saving" ? "text-zinc-500 bg-zinc-100" :
      state === "saved" ? "text-green-700 bg-green-50" :
      "text-red-600 bg-red-50"
    }`}>
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save failed"}
    </span>
  )
}
