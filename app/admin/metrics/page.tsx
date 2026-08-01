import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth/config"
import Nav from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import {
  countSignupsBySegment,
  countAdsAndRenders,
  medianIterationsPerAd,
  galleryOptInRate,
} from "@/lib/events"
import { killSwitchEngaged } from "@/lib/limits"

// Admin-only. Middleware guards /admin/* — redirects non-ADMIN to /dashboard.
// The metrics here are the tinest useful set: signups per door, ad throughput,
// median iterations (the doc's core health metric), opt-in rate, kill switch status.
export default async function AdminMetricsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")

  const [segments, adsRenders, medianIter, optRate, kill] = await Promise.all([
    countSignupsBySegment(),
    countAdsAndRenders(),
    medianIterationsPerAd(),
    galleryOptInRate(),
    killSwitchEngaged(),
  ])

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Admin" }, { label: "Metrics" }]} />
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Metrics</h1>
          <p className="text-zinc-500 mt-1">Business fork health.</p>
        </div>

        {/* Kill switch banner */}
        <Card className={kill.engaged ? "border-red-300 bg-red-50" : "border-green-200 bg-green-50/40"}>
          <CardContent className="p-4">
            <p className="text-sm font-semibold">
              {kill.engaged ? "🛑 Kill switch ENGAGED" : "✅ Systems nominal"}
            </p>
            {kill.reason && <p className="text-xs text-red-700 mt-0.5">{kill.reason}</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricTile label="Ads created (all-time)" value={adsRenders.ads} />
          <MetricTile label="Renders completed (all-time)" value={adsRenders.renders} />
          <MetricTile label="Median iterations / ad" value={medianIter.toFixed(1)} suffix=" edits" />
          <MetricTile label="Gallery opt-in rate" value={`${(optRate * 100).toFixed(0)}%`} />
        </div>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-zinc-800 mb-3">Signups by segment</h2>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(segments).map(([seg, count]) => (
                  <tr key={seg} className="border-t border-zinc-100 first:border-t-0">
                    <td className="py-2 text-zinc-600 capitalize">{seg}</td>
                    <td className="py-2 text-right font-semibold text-zinc-900">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricTile({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{label}</p>
        <p className="text-3xl font-bold text-zinc-900">
          {value}{suffix && <span className="text-lg font-normal text-zinc-500">{suffix}</span>}
        </p>
      </CardContent>
    </Card>
  )
}
