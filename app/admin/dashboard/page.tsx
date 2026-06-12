"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

type DayPoint = { day: string; count: number }

type Stats = {
  totals: {
    users: number
    projects: number
    scenes: number
    completedScenes: number
    characters: number
    voices: number
    stitchedVideos: number
    successRate: number
  }
  today: { newUsers: number; newUsersYesterday: number; activeUsers: number }
  activity: { activeUsers7d: number; activeUsers30d: number }
  usersByRole: Record<string, number>
  recentUsers: { id: string; email: string; name: string | null; role: string; createdAt: string }[]
  charts: { dailyUsers: DayPoint[]; dailyScenes: DayPoint[]; dailyProjects: DayPoint[] }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "violet" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    violet: "text-violet-600", emerald: "text-emerald-600", blue: "text-blue-600", amber: "text-amber-600", rose: "text-rose-600",
  }
  return (
    <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-1 text-3xl font-black ${colors[color] ?? colors.violet}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-zinc-800">{title}</h2>
      {children}
    </div>
  )
}

const ROLE_COLORS: Record<string, string> = { FREE: "#8b5cf6", SUPER_USER: "#10b981", ADMIN: "#f59e0b" }
const LINE_COLOR = "#7c3aed"
const BAR_COLOR  = "#10b981"

function shortDay(iso: string) {
  return iso.slice(5) // "MM-DD"
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setError("Failed to load stats"))
  }, [])

  if (error) return <div className="p-10 text-red-600">{error}</div>
  if (!stats) return <div className="p-10 text-zinc-400">Loading…</div>

  const { totals, today, activity, usersByRole, recentUsers, charts } = stats

  const userGrowth = today.newUsersYesterday > 0
    ? (((today.newUsers - today.newUsersYesterday) / today.newUsersYesterday) * 100).toFixed(0)
    : null

  const roleData = Object.entries(usersByRole).map(([name, value]) => ({ name, value }))

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Admin Dashboard</h1>
          <p className="text-sm text-zinc-400">AtVeAnimation — internal metrics</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/email" className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 transition">
            Contact Users
          </Link>
          <Link href="/admin/users" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition">
            Manage Users →
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-10 px-8 py-10">

        {/* ── Top KPIs ── */}
        <Section title="Overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Users" value={totals.users.toLocaleString()} color="violet" />
            <StatCard label="New Users Today" value={today.newUsers}
              sub={userGrowth !== null ? `${Number(userGrowth) >= 0 ? "+" : ""}${userGrowth}% vs yesterday` : "no data yet"}
              color={Number(userGrowth) >= 0 ? "emerald" : "rose"} />
            <StatCard label="Active Today" value={today.activeUsers} sub="users who generated something" color="blue" />
            <StatCard label="Active (30d)" value={activity.activeUsers30d} color="blue" />
          </div>
        </Section>

        {/* ── Content KPIs ── */}
        <Section title="Content">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Scenes Generated" value={totals.completedScenes.toLocaleString()} color="violet" />
            <StatCard label="Scene Success Rate" value={`${totals.successRate}%`} sub={`${totals.scenes} total attempted`} color={totals.successRate >= 80 ? "emerald" : "amber"} />
            <StatCard label="Projects Created" value={totals.projects.toLocaleString()} color="violet" />
            <StatCard label="Videos Stitched" value={totals.stitchedVideos.toLocaleString()} sub="full MP4 downloads" color="emerald" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Characters Trained" value={totals.characters.toLocaleString()} sub="LoRA fine-tunes run" color="amber" />
            <StatCard label="Voice Clones" value={totals.voices.toLocaleString()} color="amber" />
            <StatCard label="Active (7d)" value={activity.activeUsers7d} color="blue" />
          </div>
        </Section>

        {/* ── Charts row ── */}
        <Section title="Daily New Users — last 30 days">
          <div className="rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={charts.dailyUsers.map((d) => ({ ...d, day: shortDay(d.day) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={LINE_COLOR} strokeWidth={2} dot={false} name="New users" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Daily Scenes Completed — last 30 days">
            <div className="rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.dailyScenes.map((d) => ({ ...d, day: shortDay(d.day) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={BAR_COLOR} radius={[3, 3, 0, 0]} name="Scenes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Users by Role">
            <div className="rounded-xl border border-zinc-100 bg-white p-6 shadow-sm flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={roleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} (${value})`}>
                    {roleData.map((entry) => (
                      <Cell key={entry.name} fill={ROLE_COLORS[entry.name] ?? "#a1a1aa"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                {roleData.map((r) => (
                  <span key={r.name} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: ROLE_COLORS[r.name] }} />
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          </Section>
        </div>

        <Section title="Daily Projects Created — last 30 days">
          <div className="rounded-xl border border-zinc-100 bg-white p-6 shadow-sm">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={charts.dailyProjects.map((d) => ({ ...d, day: shortDay(d.day) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} name="Projects" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* ── Recent users ── */}
        <Section title="Recent Sign-ups">
          <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  {["Name", "Email", "Role", "Joined"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50 transition">
                    <td className="px-5 py-3 font-medium text-zinc-800">{u.name ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN:      "bg-amber-100 text-amber-700",
    SUPER_USER: "bg-emerald-100 text-emerald-700",
    FREE:       "bg-zinc-100 text-zinc-500",
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[role] ?? styles.FREE}`}>
      {role.replace("_", " ")}
    </span>
  )
}
