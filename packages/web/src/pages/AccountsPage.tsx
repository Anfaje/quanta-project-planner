import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Layout } from "../components/Layout";
import { Card, PageHeader, Spinner, Alert, Badge } from "../components/ui";
import { formatMoney, formatPercent } from "../lib/format";
import { TARGET_MARGIN_PCT, CURRENCIES } from "../lib/constants";
import type { AccountsSummary, Currency } from "../lib/types";

const SCOPES = [
  { id: "lifetime", label: "Lifetime" },
  { id: "ytd", label: "Year to date" },
  { id: "rolling12", label: "Rolling 12 mo" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

/**
 * Per-account rollup: revenue, cost, profit, margin, and project counts in a
 * chosen time scope. AAs see the whole book; ACs their managed accounts; BULs
 * their own BU's slice of each account (flagged in the header).
 */
export function AccountsPage() {
  const [scope, setScope] = useState<Scope>("ytd");
  const [currency, setCurrency] = useState<Currency>("USD");
  const { data, isLoading, error } = useQuery({
    queryKey: ["accounts", "summary", scope, currency],
    queryFn: () => api.get<AccountsSummary>(`/api/accounts/summary?scope=${scope}&currency=${currency}`),
  });

  const money = (n: number | null | undefined) => formatMoney(n, currency);

  return (
    <Layout>
      <PageHeader
        title="Accounts"
        subtitle="Revenue, profitability, and project volume per client account."
        actions={
          <div className="flex items-center gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
            aria-label="Display currency"
          >
            {CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  scope === s.id
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          </div>
        }
      />

      {data?.slice && (
        <div className="mt-4">
          <Alert tone="amber">
            Showing your business unit's slice ({data.slice.buCode}) of each account — work other
            BUs deliver on these clients isn't included.
          </Alert>
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <Spinner size="lg" color="indigo" />
          </div>
        ) : error || !data ? (
          <Alert tone="rose">Couldn't load account summaries.</Alert>
        ) : data.accounts.length === 0 ? (
          <Card>
            <div className="py-12 text-center text-sm text-gray-400">
              No accounts to summarize yet.
            </div>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-6 py-3 font-medium">Account</th>
                    <th className="px-6 py-3 font-medium text-right">Projects</th>
                    <th className="px-6 py-3 font-medium text-right">Revenue</th>
                    <th className="px-6 py-3 font-medium text-right">Cost</th>
                    <th className="px-6 py-3 font-medium text-right">Profit</th>
                    <th className="px-6 py-3 font-medium text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-800">{a.name}</div>
                        <div className="text-xs text-gray-400">{a.code}</div>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                        {a.projects}
                        {a.activeProjects > 0 && (
                          <span className="text-xs text-gray-400"> ({a.activeProjects} active)</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-800">
                        {money(a.revenue)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                        {money(a.cost)}
                      </td>
                      <td
                        className={`px-6 py-3 text-right tabular-nums ${
                          a.profit < 0 ? "text-rose-600" : "text-gray-800"
                        }`}
                      >
                        {money(a.profit)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {a.marginPct == null ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <Badge tone={a.marginPct >= TARGET_MARGIN_PCT ? "emerald" : "amber"}>
                            {formatPercent(a.marginPct)}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50/60 font-medium">
                    <td className="px-6 py-3 text-gray-700">Total</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {data.totals.projects}
                      {data.totals.activeProjects > 0 && (
                        <span className="text-xs text-gray-400">
                          {" "}
                          ({data.totals.activeProjects} active)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-800">
                      {money(data.totals.revenue)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {money(data.totals.cost)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right tabular-nums ${
                        data.totals.profit < 0 ? "text-rose-600" : "text-gray-800"
                      }`}
                    >
                      {money(data.totals.profit)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {data.totals.marginPct == null ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <Badge
                          tone={data.totals.marginPct >= TARGET_MARGIN_PCT ? "emerald" : "amber"}
                        >
                          {formatPercent(data.totals.marginPct)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
