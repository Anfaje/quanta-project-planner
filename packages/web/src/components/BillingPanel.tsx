import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { BillingSchedule } from "../lib/types";
import { Card, CardBody, CardHeader, Spinner, Alert } from "./ui";
import { formatMoney, formatHours, formatDate, formatPercent } from "../lib/format";

/**
 * The offer schedule: planned hours × bill rates over the timeline, weekly or
 * monthly, plus the team's rates — everything a PM or AC needs to build a
 * contract offer with the draft team. Fee-side only by design (no cost or
 * margin), so it's safe for bill-rate-visibility callers.
 */
export function BillingPanel({ projectId }: { projectId: string }) {
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("monthly");
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", projectId, "billing"],
    queryFn: () => api.get<BillingSchedule>(`/api/projects/${projectId}/billing`),
  });

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner size="lg" color="indigo" />
      </div>
    );
  }
  if (error || !data) {
    return <Alert tone="rose">Couldn't load the billing schedule.</Alert>;
  }

  const isFixed = data.pricingModel === "fixed_price";
  const rows = granularity === "weekly" ? data.weekly : data.monthly;
  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(Date.UTC(Number(y), Number(mo) - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Offer headline ── */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500">
                {isFixed ? "Contract value" : "Offer total"}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
                {data.totals.offerTotal != null ? formatMoney(data.totals.offerTotal) : "—"}
              </div>
              {!isFixed && data.totals.fee != null && data.totals.contingencyAmt != null && (
                <div className="mt-0.5 text-xs text-gray-400">
                  {formatMoney(data.totals.fee)} + {formatPercent(data.contingencyPct * 100, 0)}{" "}
                  contingency ({formatMoney(data.totals.contingencyAmt)})
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500">Planned hours</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
                {formatHours(data.totals.hours)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">
                {isFixed ? "Implied blended rate" : "Blended rate"}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
                {data.totals.blendedRate != null ? `${formatMoney(data.totals.blendedRate)}/h` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Timeline</div>
              <div className="mt-1 text-sm text-gray-800">
                {formatDate(data.startDate)} → {formatDate(data.endDate)}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {data.weekly.length} billed week{data.weekly.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── Team & rates ── */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-gray-800">Team & rates</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            The draft team behind the numbers — rates and planned effort per person.
          </p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 font-medium">Person</th>
                <th className="px-6 py-2 font-medium">Role</th>
                <th className="px-6 py-2 font-medium text-right">Bill rate</th>
                <th className="px-6 py-2 font-medium text-right">Planned hours</th>
                <th className="px-6 py-2 font-medium text-right">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.team.map((t) => (
                <tr key={t.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-2.5 text-gray-800">{t.name}</td>
                  <td className="px-6 py-2.5 text-gray-500">{t.projectRole}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-600">
                    {t.billRate != null ? `${formatMoney(t.billRate)}/h` : "—"}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-600">
                    {formatHours(t.totalHours)}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-800">
                    {t.totalFee != null ? formatMoney(t.totalFee) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Schedule ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Billing schedule</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {isFixed
                  ? "Planned delivery over time — the contract value is fixed, so periods carry hours, not fees."
                  : "Planned hours and fee per period, ready to lift into an offer."}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {(["monthly", "weekly"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    granularity === g ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {g === "monthly" ? "Monthly" : "Weekly"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 font-medium">Period</th>
                <th className="px-6 py-2 font-medium text-right">Hours</th>
                <th className="px-6 py-2 font-medium text-right">Blended rate</th>
                <th className="px-6 py-2 font-medium text-right">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={"week" in r ? `w${r.week}` : r.month} className="hover:bg-gray-50">
                  <td className="px-6 py-2.5 text-gray-800">
                    {"week" in r ? (
                      <>
                        Week {r.week + 1}
                        <span className="ml-2 text-xs text-gray-400">
                          {formatDate(r.weekStartDate)}
                        </span>
                      </>
                    ) : (
                      monthLabel(r.month)
                    )}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-600">
                    {formatHours(r.hours)}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-500">
                    {r.blendedRate != null ? `${formatMoney(r.blendedRate)}/h` : "—"}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-800">
                    {r.fee != null ? formatMoney(r.fee) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50/60 font-medium">
                <td className="px-6 py-2.5 text-gray-700">Total</td>
                <td className="px-6 py-2.5 text-right tabular-nums text-gray-700">
                  {formatHours(data.totals.hours)}
                </td>
                <td className="px-6 py-2.5 text-right tabular-nums text-gray-500">
                  {data.totals.blendedRate != null ? `${formatMoney(data.totals.blendedRate)}/h` : "—"}
                </td>
                <td className="px-6 py-2.5 text-right tabular-nums text-gray-800">
                  {data.totals.fee != null ? formatMoney(data.totals.fee) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
