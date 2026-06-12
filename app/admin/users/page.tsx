"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import type { UserRole } from "@prisma/client"

type User = {
  id: string
  email: string
  name: string | null
  role: UserRole
  createdAt: string
  _count: { projects: number; characters: number; jobs: number }
}

type Response = { users: User[]; total: number; page: number; pages: number }

const ROLES: UserRole[] = ["FREE", "SUPER_USER", "ADMIN"]

const ROLE_STYLES: Record<UserRole, string> = {
  ADMIN:      "bg-amber-100 text-amber-700 border-amber-200",
  SUPER_USER: "bg-emerald-100 text-emerald-700 border-emerald-200",
  FREE:       "bg-zinc-100 text-zinc-500 border-zinc-200",
}

export default function AdminUsers() {
  const [data, setData]       = useState<Response | null>(null)
  const [search, setSearch]   = useState("")
  const [page, setPage]       = useState(1)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError]     = useState("")

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), ...(search && { q: search }) })
    fetch(`/api/admin/users?${qs}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load users"))
  }, [page, search])

  useEffect(() => { load() }, [load])

  async function changeRole(userId: string, role: UserRole) {
    setUpdating(userId)
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setData((prev) => prev
        ? { ...prev, users: prev.users.map((u) => u.id === userId ? { ...u, role } : u) }
        : prev
      )
    } else {
      const { error: msg } = await res.json()
      alert(msg ?? "Failed to update role")
    }
    setUpdating(null)
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">User Management</h1>
          <p className="text-sm text-zinc-400">{data?.total ?? "—"} total users</p>
        </div>
        <Link href="/admin/dashboard" className="text-sm text-violet-600 hover:underline">← Dashboard</Link>
      </div>

      <div className="mx-auto max-w-7xl px-8 py-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full max-w-sm rounded-lg border border-zinc-200 px-4 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                {["User", "Joined", "Projects", "Characters", "Jobs", "Role", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {data?.users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50 transition">
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-800">{u.name ?? "—"}</p>
                    <p className="text-xs text-zinc-400">{u.email}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-zinc-600">{u._count.projects}</td>
                  <td className="px-5 py-3 text-zinc-600">{u._count.characters}</td>
                  <td className="px-5 py-3 text-zinc-600">{u._count.jobs}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[u.role]}`}>
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={u.role}
                      disabled={updating === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                      className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-violet-400 disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-zinc-100"
            >
              ← Prev
            </button>
            <span className="text-sm text-zinc-500">Page {page} of {data.pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-zinc-100"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
