import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "../lib/api";
import type { BurnSeries } from "../lib/types";
import { Spinner, Alert, EmptyState } from "./ui";
import { formatHours, formatDateShort } from "../lib/format";

/**
 * Burn chart — cumulative planned vs actual vs EAC hours by week.
 *
 * We show hours regardless of role; fee / cost streams are optional and come
 * from the API only when the caller passes canViewFinancials. When present
 * we add a secondary y-axis and the extra lines.
 */

export function BurnChartPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", projectId, "burn"],
    queryFn: () => api.get<BurnSeries>(`/api/projects/${projectId}/burn`),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="md" color="indigo" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert tone="rose">Couldn&apos;t load burn chart.</Alert>;
  }

  if (data.series.length === 0) {
    return (
      <EmptyState
        title="No data yet"
        description="Once the project has planned hours and actuals, the burn chart will appear here."
      />
    );
  }

  // Map series into a shape Recharts likes — weekLabel for x-axis display.
  const rows = data.series.map((p) => ({
    week: p.week + 1,
    weekLabel: `W${p.week + 1}`,
    dateLabel: formatDateShort(p.weekStart),
    planned: p.plannedCumulative,
    actual: p.actualCumulative,
    eac: p.eacCumulative,
  }));

  return (
    <div>
      <div className="mb-3 text-xs text-gray-500">
        Cumulative hours per week — planned (quoted), actual (to date), and EAC (estimate at
        completion using actuals where recorded, planned otherwise).
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="weekLabel"
              stroke="#9ca3af"
              style={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              stroke="#9ca3af"
              style={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatHours(v)}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
              labelFormatter={(label, payload) => {
                const datePart = payload?.[0]?.payload?.dateLabel ?? "";
                return `${label} · ${datePart}`;
              }}
              formatter={(value: number) => formatHours(value) + " h"}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="planned"
              name="Planned"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#4f46e5"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="eac"
              name="EAC"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
