import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { BaselineComparison } from "../lib/types";
import { Card, CardBody, CardHeader, Spinner, Alert, Badge } from "./ui";
import { formatHours, formatMoney, formatPercent, formatDate } from "../lib/format";

/**
 * Live plan vs the Initial Plan baseline captured when the project was first
 * approved. Hours drift is the headline (visible to everyone with access);
 * fee/cost/margin deltas appear only when the API includes them for the caller.
 */
export function DriftPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", projectId, "baseline-comparison"],
    queryFn: () =>
      api.get<BaselineComparison>(`/api/projects/${projectId}/baseline-comparison`),
  });

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner size="lg" color="indigo" />
      </div>
    );
  }
  if (error || !data) {
    return <Alert tone="rose">Couldn't load the baseline comparison.</Alert>;
  }

  const t = data.totals;
  const drift = t.hoursDriftPct;
  const driftTone = drift == null ? "gray" : Math.abs(drift) < 5 ? "emerald" : "amber";
  const hasFin = t.baselineFee != null;
  const sign = (n: number) => (n > 0 ? "+" : "");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-gray-800">Plan vs Initial Plan</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Baseline captured {formatDate(data.capturedAt)} at first approval — the frozen plan
            every change is measured against.
          </p>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500">Planned hours</div>
              <div className="mt-1 text-sm text-gray-800 tabular-nums">
                {formatHours(t.baselineHours)} → <strong>{formatHours(t.currentHours)}</strong>
              </div>
              <div className="mt-1">
                <Badge tone={driftTone}>
                  {drift == null ? "—" : `${sign(drift)}${drift.toFixed(1)}%`}
                </Badge>
              </div>
            </div>
            {hasFin && (
              <>
                <div>
                  <div className="text-xs text-gray-500">Planned fee</div>
                  <div className="mt-1 text-sm text-gray-800 tabular-nums">
                    {formatMoney(t.baselineFee)} → <strong>{formatMoney(t.currentFee)}</strong>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Planned cost</div>
                  <div className="mt-1 text-sm text-gray-800 tabular-nums">
                    {formatMoney(t.baselineCost)} → <strong>{formatMoney(t.currentCost)}</strong>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Planned margin</div>
                  <div className="mt-1 text-sm text-gray-800 tabular-nums">
                    {formatPercent(t.baselineMarginPct)} →{" "}
                    <strong>{formatPercent(t.currentMarginPct)}</strong>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-gray-800">Per person</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Planned hours by assignment — who was added, removed, or re-scoped since the baseline.
          </p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 font-medium">Person</th>
                <th className="px-6 py-2 font-medium">Role</th>
                <th className="px-6 py-2 font-medium text-right">Baseline</th>
                <th className="px-6 py-2 font-medium text-right">Current</th>
                <th className="px-6 py-2 font-medium text-right">Δ hours</th>
                <th className="px-6 py-2 font-medium text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map((r) => (
                <tr key={r.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-2.5 text-gray-800">{r.name}</td>
                  <td className="px-6 py-2.5 text-gray-500">{r.projectRole}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-600">
                    {formatHours(r.baselineHours)}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-gray-800">
                    {formatHours(r.currentHours)}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right tabular-nums ${
                      r.deltaHours === 0
                        ? "text-gray-400"
                        : r.deltaHours > 0
                          ? "text-amber-700"
                          : "text-sky-700"
                    }`}
                  >
                    {sign(r.deltaHours)}
                    {formatHours(r.deltaHours)}
                  </td>
                  <td className="px-6 py-2.5 text-right">
                    {r.change === "added" ? (
                      <Badge tone="sky">added</Badge>
                    ) : r.change === "removed" ? (
                      <Badge tone="rose">removed</Badge>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
