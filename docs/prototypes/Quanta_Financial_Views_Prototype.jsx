import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, ReferenceLine, Cell, PieChart, Pie, RadialBarChart, RadialBar, Legend } from "recharts";

// ── Mock data ──
const RESOURCES = [
  { id: "r1", name: "Maya Chen", role: "iOS Dev", bu: "US-ORD-OWLS", billRate: 185, costRate: 95, plannedHours: 320, actualHours: 274 },
  { id: "r2", name: "Jonas Berg", role: "Designer", bu: "DK-AAR-PANDA", billRate: 165, costRate: 82, plannedHours: 240, actualHours: 218, crossBU: true },
  { id: "r3", name: "Alex Rivera", role: "Backend", bu: "US-ORD-OWLS", billRate: 195, costRate: 105, plannedHours: 400, actualHours: 348 },
  { id: "r4", name: "Priya Sharma", role: "3D Dev", bu: "US-ORD-OWLS", billRate: 175, costRate: 88, plannedHours: 200, actualHours: 162 },
  { id: "r5", name: "Lena Kowalski", role: "PM", bu: "DK-AAR-PANDA", billRate: 210, costRate: 110, plannedHours: 120, actualHours: 108, crossBU: true },
  { id: "r6", name: "Tom Nguyen", role: "Full Stack", bu: "US-ORD-OWLS", billRate: 190, costRate: 98, plannedHours: 360, actualHours: 340 },
  { id: "r7", name: "Sara Olsen", role: "UX Lead", bu: "US-ORD-OWLS", billRate: 200, costRate: 102, plannedHours: 280, actualHours: 260 },
  { id: "r8", name: "Diego Ruiz", role: "DevOps", bu: "US-ORD-OWLS", billRate: 205, costRate: 115, plannedHours: 160, actualHours: 168 },
  { id: "r9", name: "Emma Walsh", role: "iOS Dev", bu: "US-ORD-OWLS", billRate: 180, costRate: 92, plannedHours: 300, actualHours: 295 },
  { id: "r10", name: "Kai Tanaka", role: "ML Engineer", bu: "US-ORD-OWLS", billRate: 220, costRate: 130, plannedHours: 240, actualHours: 238 },
  { id: "r11", name: "Noor Patel", role: "QA Lead", bu: "US-ORD-OWLS", billRate: 160, costRate: 78, plannedHours: 200, actualHours: 210 },
  { id: "r12", name: "Jess Kim", role: "Designer", bu: "US-ORD-OWLS", billRate: 170, costRate: 85, plannedHours: 180, actualHours: 120 },
  { id: "r13", name: "Marco Bianchi", role: "Backend", bu: "US-ORD-OWLS", billRate: 190, costRate: 140, plannedHours: 320, actualHours: 310 },
];

const PROJECTS = [
  // ── BUL projects (US-ORD-OWLS) — 8 total, mixed health ──
  { id: "p1", name: "Brand Refresh 2026", account: "Meridian Corp", bu: "US-ORD-OWLS", status: "active", contingency: 15,
    resources: ["r1", "r2", "r3"], startDate: "Feb 3", endDate: "May 22", weeks: 16 },
  { id: "p2", name: "Zephyr Mobile App", account: "Pinnacle Tech", bu: "US-ORD-OWLS", status: "active", contingency: 15,
    resources: ["r1", "r3", "r4", "r5"], startDate: "Jan 12", endDate: "Jun 5", weeks: 21 },
  { id: "p4", name: "Cascade CRM Integration", account: "Meridian Corp", bu: "US-ORD-OWLS", status: "active", contingency: 12,
    resources: ["r6", "r7"], startDate: "Mar 10", endDate: "Jun 20", weeks: 15 },
  { id: "p5", name: "Helios Design System", account: "Lumen Group", bu: "US-ORD-OWLS", status: "active", contingency: 10,
    resources: ["r7", "r12"], startDate: "Jan 20", endDate: "Apr 17", weeks: 13 },
  { id: "p6", name: "Titan Cloud Migration", account: "Pinnacle Tech", bu: "US-ORD-OWLS", status: "active", contingency: 15,
    resources: ["r3", "r8", "r6"], startDate: "Feb 17", endDate: "Jul 3", weeks: 20 },
  { id: "p7", name: "Polaris Recommender", account: "Lumen Group", bu: "US-ORD-OWLS", status: "active", contingency: 15,
    resources: ["r10", "r3", "r11"], startDate: "Mar 3", endDate: "Aug 7", weeks: 23 },
  { id: "p8", name: "Stratos E-commerce", account: "Pinnacle Tech", bu: "US-ORD-OWLS", status: "active", contingency: 12,
    resources: ["r9", "r13", "r11", "r12"], startDate: "Dec 1", endDate: "May 8", weeks: 23 },
  { id: "p9", name: "Vanguard Replatform", account: "Meridian Corp", bu: "US-ORD-OWLS", status: "active", contingency: 15,
    resources: ["r6", "r8", "r4", "r9"], startDate: "Jan 6", endDate: "Jun 12", weeks: 23 },
  // ── AC-only project (different BU) ──
  { id: "p3", name: "Atlas Data Migration", account: "Meridian Corp", bu: "DK-AAR-PANDA", status: "active", contingency: 10,
    resources: ["r2", "r5"], startDate: "Mar 2", endDate: "Jul 10", weeks: 19 },
];

const TARGET_MARGIN = 40;

const marginHistory = [
  { week: "W1", p1: 44, p2: 38, p3: 48, p4: 45, p5: 51, p6: 36, p7: 42, p8: 28, p9: 39, target: 40 },
  { week: "W2", p1: 43, p2: 37, p3: 47, p4: 44, p5: 50, p6: 35, p7: 41, p8: 27, p9: 38, target: 40 },
  { week: "W3", p1: 42, p2: 36, p3: 46, p4: 43, p5: 49, p6: 33, p7: 40, p8: 26, p9: 37, target: 40 },
  { week: "W4", p1: 43, p2: 35, p3: 45, p4: 44, p5: 50, p6: 34, p7: 41, p8: 25, p9: 38, target: 40 },
  { week: "W5", p1: 41, p2: 34, p3: 46, p4: 42, p5: 48, p6: 32, p7: 39, p8: 24, p9: 36, target: 40 },
  { week: "W6", p1: 40, p2: 33, p3: 44, p4: 43, p5: 49, p6: 31, p7: 40, p8: 23, p9: 37, target: 40 },
  { week: "W7", p1: 42, p2: 35, p3: 45, p4: 44, p5: 50, p6: 33, p7: 41, p8: 24, p9: 38, target: 40 },
  { week: "W8", p1: 41, p2: 34, p3: 46, p4: 43, p5: 49, p6: 32, p7: 40, p8: 25, p9: 37, target: 40 },
];

const revenueTimeline = [
  { week: "W1", actual: 95, projected: 100 },
  { week: "W2", actual: 198, projected: 200 },
  { week: "W3", actual: 290, projected: 300 },
  { week: "W4", actual: 392, projected: 400 },
  { week: "W5", actual: 482, projected: 500 },
  { week: "W6", actual: 580, projected: 600 },
  { week: "W7", actual: 672, projected: 700 },
  { week: "W8", actual: 768, projected: 800 },
  { week: "W9", projected: 900 },
  { week: "W10", projected: 1000 },
  { week: "W11", projected: 1100 },
  { week: "W12", projected: 1200 },
];

function getProjectFinancials(project) {
  const res = RESOURCES.filter(r => project.resources.includes(r.id));
  const rows = res.map(r => ({ ...r, fee: r.plannedHours * r.billRate, cost: r.actualHours * r.costRate, billed: r.actualHours * r.billRate }));
  const totalFee = rows.reduce((s, r) => s + r.fee, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
  const margin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;
  const contingencyAmt = totalFee * (project.contingency / 100);
  return { rows, totalFee, totalCost, totalBilled, margin, contingencyAmt, adjustedFee: totalFee + contingencyAmt };
}

const fmt = (n) => "$" + n.toLocaleString("en-US");
const fmtk = (n) => "$" + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k";
const fmtPct = (n) => n.toFixed(1) + "%";

function StatusPill({ status }) {
  const s = { active: "bg-emerald-50 text-emerald-700", "at-risk": "bg-rose-50 text-rose-700" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s[status] || "bg-gray-100 text-gray-500"}`}>{status}</span>;
}

function Section({ title, subtitle, actions, children, delay = 0 }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div className="mb-6 transition-all duration-500 ease-out" style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(12px)" }}>
      <div className="flex items-center justify-between mb-3">
        <div><h2 className="text-base font-semibold text-gray-800" style={{ letterSpacing: "-0.01em" }}>{title}</h2>{subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}</div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${className}`}>{children}</div>;
}

function GaugeMetric({ label, value, target, format = "pct", color }) {
  const pct = target > 0 ? Math.min(value / target, 1.3) : 0;
  const isOver = value >= target;
  const col = color || (isOver ? "#10b981" : value >= target * 0.9 ? "#f59e0b" : "#ef4444");
  const display = format === "pct" ? fmtPct(value) : fmtk(value);
  const targetDisplay = format === "pct" ? fmtPct(target) : fmtk(target);

  return (
    <div>
      <div className="text-xs text-gray-400 mb-2">{label}</div>
      <div className="flex items-end gap-3">
        <div className="text-2xl font-bold tracking-tight" style={{ color: col, letterSpacing: "-0.03em" }}>{display}</div>
        <div className="text-xs text-gray-400 pb-1">/ {targetDisplay} target</div>
      </div>
      <div className="mt-2 w-full h-2 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="absolute top-0 h-full w-px bg-gray-400" style={{ left: `${Math.min(100, (1 / Math.max(pct, 1)) * 100)}%` }} />
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct * 100 / 1.3, 100)}%`, backgroundColor: col }} />
      </div>
    </div>
  );
}

// ── Project Detail ──
function ProjectDetail({ project, onBack }) {
  const fin = getProjectFinancials(project);
  const pctBurn = fin.rows.reduce((s, r) => s + r.actualHours, 0) / fin.rows.reduce((s, r) => s + r.plannedHours, 0) * 100;
  const profit = fin.totalBilled - fin.totalCost;

  const marginByResource = fin.rows.map(r => {
    const m = r.fee > 0 ? ((r.fee - r.cost) / r.fee) * 100 : 0;
    return { name: r.name.split(" ")[0], margin: parseFloat(m.toFixed(1)), target: TARGET_MARGIN };
  });

  const feeVsCost = fin.rows.map(r => ({
    name: r.name.split(" ")[0],
    fee: r.fee / 1000,
    cost: r.cost / 1000,
  }));

  const costBreakdown = fin.rows.map(r => ({
    name: r.name.split(" ")[0] + " (" + r.role + ")",
    value: r.cost,
    pct: fin.totalCost > 0 ? (r.cost / fin.totalCost * 100) : 0,
  })).sort((a, b) => b.value - a.value);

  const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6"];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          All projects
        </button>
        <span className="text-xs text-gray-300">/</span>
        <span className="text-xs text-gray-500">{project.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800" style={{ letterSpacing: "-0.02em" }}>{project.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-400">{project.account}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-sm text-gray-400">{project.bu}</span>
            <span className="text-xs text-gray-300">·</span>
            <StatusPill status={pctBurn > 85 ? "at-risk" : project.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 cursor-pointer transition-all">Export CSV</button>
          <button className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer transition-all shadow-sm">Export PDF</button>
        </div>
      </div>

      {/* Hero gauges */}
      <Section title="Performance vs. targets" delay={40}>
        <div className="grid grid-cols-4 gap-3">
          <Card><GaugeMetric label="Margin %" value={fin.margin} target={TARGET_MARGIN} /></Card>
          <Card><GaugeMetric label="Revenue to date" value={fin.totalBilled} target={fin.totalFee} format="dollar" color="#6366f1" /></Card>
          <Card><GaugeMetric label="Profit to date" value={profit} target={fin.totalFee * TARGET_MARGIN / 100} format="dollar" color={profit >= fin.totalFee * TARGET_MARGIN / 100 ? "#10b981" : "#f59e0b"} /></Card>
          <Card>
            <div className="text-xs text-gray-400 mb-2">Budget burn</div>
            <div className="text-2xl font-bold tracking-tight text-gray-800" style={{ letterSpacing: "-0.03em" }}>{Math.round(pctBurn)}%</div>
            <div className="text-xs text-gray-400 pb-0.5">of planned hours consumed</div>
            <div className="mt-2 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${pctBurn > 85 ? "bg-rose-400" : pctBurn > 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: Math.min(pctBurn, 100) + "%" }} />
            </div>
          </Card>
        </div>
      </Section>

      {/* Charts row: margin by resource + fee vs cost */}
      <Section title="Resource-level analysis" subtitle="How each team member contributes to project financials" delay={100}>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <div className="text-xs text-gray-400 mb-3 font-medium">Margin by resource vs. {TARGET_MARGIN}% target</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={marginByResource} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" domain={[0, 60]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => v + "%"} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => [v + "%", ""]} />
                <ReferenceLine x={TARGET_MARGIN} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Target", position: "top", fontSize: 10, fill: "#f59e0b" }} />
                <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                  {marginByResource.map((entry, i) => (
                    <Cell key={i} fill={entry.margin >= TARGET_MARGIN ? "#10b981" : entry.margin >= TARGET_MARGIN - 5 ? "#f59e0b" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <div className="text-xs text-gray-400 mb-3 font-medium">Fee vs. cost by resource ($k)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={feeVsCost} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={35} tickFormatter={v => "$" + v + "k"} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => ["$" + v.toFixed(1) + "k", ""]} />
                <Bar dataKey="fee" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="Fee (planned)" />
                <Bar dataKey="cost" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Cost (actual)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </Section>

      {/* Cost distribution + margin trend */}
      <Section title="Cost distribution and margin trend" delay={160}>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <div className="text-xs text-gray-400 mb-3 font-medium">Cost allocation by resource</div>
            <div className="flex items-center gap-6">
              <div className="w-36 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costBreakdown} dataKey="value" cx="50%" cy="50%" innerRadius={36} outerRadius={60} paddingAngle={2} strokeWidth={0}>
                      {costBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => [fmt(v), ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid gap-1.5">
                {costBreakdown.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-gray-600">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-700">{fmtk(item.value)}</span>
                      <span className="text-xs text-gray-400 w-10 text-right">{item.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <div className="text-xs text-gray-400 mb-3 font-medium">Margin % over time vs. {TARGET_MARGIN}% target</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={marginHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} domain={[25, 55]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => [v + "%", ""]} />
                <ReferenceLine y={TARGET_MARGIN} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Target", position: "right", fontSize: 10, fill: "#f59e0b" }} />
                <Line type="monotone" dataKey={project.id} stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1" }} name="Margin %" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </Section>

      {/* Calculation transparency */}
      <Section title="Calculation breakdown" subtitle="How each figure is derived" delay={220}>
        <Card>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fee</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                <span className="font-medium text-gray-700">Per resource:</span> planned hrs × bill rate<br />
                <span className="font-medium text-gray-700">Project total:</span> {fmt(fin.totalFee)}<br />
                <span className="font-medium text-gray-700">+ Contingency ({project.contingency}%):</span> {fmt(Math.round(fin.contingencyAmt))}<br />
                <span className="font-medium text-gray-700">= Adjusted total:</span> <span className="font-semibold text-gray-800">{fmt(Math.round(fin.adjustedFee))}</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cost</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                <span className="font-medium text-gray-700">Per resource:</span> actual hrs × cost rate<br />
                <span className="font-medium text-gray-700">Project total:</span> <span className="font-semibold text-gray-800">{fmt(fin.totalCost)}</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Margin</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                <span className="font-medium text-gray-700">Margin $:</span> fee − cost = {fmt(fin.totalFee - fin.totalCost)}<br />
                <span className="font-medium text-gray-700">Margin %:</span> margin / fee = <span className="font-semibold text-gray-800">{fmtPct(fin.margin)}</span>
              </div>
            </div>
          </div>
        </Card>
      </Section>

      {/* Resource table */}
      <Section title="Resource detail" delay={280}>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Resource</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Bill</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cost</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actual</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fee</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cost $</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Margin</th>
              </tr>
            </thead>
            <tbody>
              {fin.rows.map((r, i) => {
                const m = r.fee > 0 ? ((r.fee - r.cost) / r.fee) * 100 : 0;
                return (
                  <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-gray-700">{r.name}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">{r.role} · {r.bu}{r.crossBU && <span className="text-xs font-medium px-1 rounded bg-amber-50 text-amber-600">cross-BU</span>}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-700">${r.billRate}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-700">${r.costRate}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500">{r.plannedHours}h</td>
                    <td className="py-2.5 px-3 text-right text-gray-700 font-medium">{r.actualHours}h</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{fmtk(r.fee)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{fmtk(r.cost)}</td>
                    <td className="py-2.5 px-4 text-right"><span className={`font-semibold ${m >= TARGET_MARGIN ? "text-emerald-600" : m >= TARGET_MARGIN - 5 ? "text-amber-600" : "text-rose-600"}`}>{fmtPct(m)}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="py-2.5 px-4 font-semibold text-gray-700" colSpan={3}>Total</td>
                <td className="py-2.5 px-3 text-right font-semibold text-gray-700">{fin.rows.reduce((s, r) => s + r.plannedHours, 0)}h</td>
                <td className="py-2.5 px-3 text-right font-semibold text-gray-700">{fin.rows.reduce((s, r) => s + r.actualHours, 0)}h</td>
                <td className="py-2.5 px-3 text-right font-bold text-gray-800">{fmtk(fin.totalFee)}</td>
                <td className="py-2.5 px-3 text-right font-bold text-gray-800">{fmtk(fin.totalCost)}</td>
                <td className="py-2.5 px-4 text-right"><span className={`font-bold ${fin.margin >= TARGET_MARGIN ? "text-emerald-600" : "text-amber-600"}`}>{fmtPct(fin.margin)}</span></td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </Section>
    </div>
  );
}

// ── Roll-up (list view) ──
function RollupView({ projects, viewScope, onSelect }) {
  const allFins = projects.map(p => ({ ...p, fin: getProjectFinancials(p) }));
  const totalFee = allFins.reduce((s, p) => s + p.fin.totalFee, 0);
  const totalCost = allFins.reduce((s, p) => s + p.fin.totalCost, 0);
  const totalBilled = allFins.reduce((s, p) => s + p.fin.totalBilled, 0);
  const profit = totalBilled - totalCost;
  const overallMargin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;
  const totalContingency = allFins.reduce((s, p) => s + p.fin.contingencyAmt, 0);

  // Yearly targets (BU-level)
  const yearlyRevenueTarget = 4200000;
  const yearlyProfitTarget = yearlyRevenueTarget * (TARGET_MARGIN / 100);
  const headcountCurrent = 14;
  const headcountTarget = 18;
  const headcountStart = 11;

  // Annualised run-rate (8 weeks in, project over ~48 remaining working weeks)
  const weeksElapsed = 8;
  const weeksInYear = 48;
  const annualisedRevenue = (totalBilled / weeksElapsed) * weeksInYear;
  const annualisedProfit = (profit / weeksElapsed) * weeksInYear;
  const annualisedMargin = annualisedRevenue > 0 ? (annualisedProfit / annualisedRevenue) * 100 : 0;

  const isProfitable = profit > 0;
  const revenueOnTrack = annualisedRevenue >= yearlyRevenueTarget * 0.95;
  const marginOnTrack = overallMargin >= TARGET_MARGIN - 2;
  const growthOnTrack = headcountCurrent >= headcountStart + Math.round((headcountTarget - headcountStart) * (weeksElapsed / weeksInYear));

  // Monthly revenue trajectory (actual vs target pace)
  const monthlyRevenue = [
    { month: "Jan", actual: 280, target: 350 },
    { month: "Feb", actual: 320, target: 350 },
    { month: "Mar", actual: 370, target: 350 },
    { month: "Apr", actual: 195, target: 350 },
    { month: "May", target: 350 },
    { month: "Jun", target: 350 },
    { month: "Jul", target: 350 },
    { month: "Aug", target: 350 },
    { month: "Sep", target: 350 },
    { month: "Oct", target: 350 },
    { month: "Nov", target: 350 },
    { month: "Dec", target: 350 },
  ];

  const monthlyProfit = [
    { month: "Jan", actual: 112, target: 140 },
    { month: "Feb", actual: 122, target: 140 },
    { month: "Mar", actual: 141, target: 140 },
    { month: "Apr", actual: 72, target: 140 },
    { month: "May", target: 140 },
    { month: "Jun", target: 140 },
  ];

  const headcountTimeline = [
    { month: "Jan", actual: 11, target: 12 },
    { month: "Feb", actual: 12, target: 13 },
    { month: "Mar", actual: 13, target: 14 },
    { month: "Apr", actual: 14, target: 15 },
    { month: "May", target: 15 },
    { month: "Jun", target: 16 },
    { month: "Jul", target: 16 },
    { month: "Aug", target: 17 },
    { month: "Sep", target: 17 },
    { month: "Oct", target: 18 },
    { month: "Nov", target: 18 },
    { month: "Dec", target: 18 },
  ];

  const perProjectMargin = allFins.map(p => ({
    name: p.name.split(" ").slice(0, 2).join(" "),
    margin: parseFloat(p.fin.margin.toFixed(1)),
  })).sort((a, b) => a.margin - b.margin);

  const perProjectRevenue = allFins.map(p => ({
    name: p.name.split(" ").slice(0, 2).join(" "),
    billed: p.fin.totalBilled / 1000,
    remaining: Math.max(0, (p.fin.totalFee - p.fin.totalBilled)) / 1000,
  }));

  function StatusSignal({ yes, labelYes, labelNo }) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${yes ? "bg-emerald-400" : "bg-rose-400"}`} />
        <span className={`text-sm font-semibold ${yes ? "text-emerald-700" : "text-rose-700"}`}>
          {yes ? labelYes : labelNo}
        </span>
      </div>
    );
  }

  return (
    <>
      {/* ═══ TOP: Three strategic questions ═══ */}
      <Section title={viewScope === "bul" ? "US-ORD-OWLS — BU health check" : "Account health check"}
        subtitle={`${weeksElapsed} weeks into fiscal year · ${projects.length} active projects · ${headcountCurrent} team members`} delay={0}>
        <div className="grid grid-cols-3 gap-3">
          {/* Q1: Are we profitable? */}
          <Card className="border-l-4" style={{ borderLeftColor: isProfitable && marginOnTrack ? "#10b981" : isProfitable ? "#f59e0b" : "#ef4444" }}>
            <div className="text-xs text-gray-400 mb-2 font-medium">Are we profitable?</div>
            <StatusSignal yes={isProfitable && marginOnTrack} labelYes="Yes — margin on target" labelNo={isProfitable ? "Yes, but margin below target" : "No — running at a loss"} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs text-gray-400">Profit YTD</div>
                <div className={`text-lg font-bold tracking-tight ${profit > 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtk(profit)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Margin</div>
                <div className={`text-lg font-bold tracking-tight ${overallMargin >= TARGET_MARGIN ? "text-emerald-700" : "text-amber-700"}`}>{fmtPct(overallMargin)}</div>
                <div className="text-xs text-gray-400">target: {TARGET_MARGIN}%</div>
              </div>
            </div>
          </Card>

          {/* Q2: Revenue on track? */}
          <Card className="border-l-4" style={{ borderLeftColor: revenueOnTrack ? "#10b981" : "#f59e0b" }}>
            <div className="text-xs text-gray-400 mb-2 font-medium">Are we on track for yearly revenue?</div>
            <StatusSignal yes={revenueOnTrack} labelYes="On pace" labelNo="Behind pace" />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs text-gray-400">Revenue YTD</div>
                <div className="text-lg font-bold tracking-tight text-gray-800">{fmtk(totalBilled)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Annualised run-rate</div>
                <div className={`text-lg font-bold tracking-tight ${annualisedRevenue >= yearlyRevenueTarget ? "text-emerald-700" : "text-amber-700"}`}>{fmtk(annualisedRevenue)}</div>
                <div className="text-xs text-gray-400">target: {fmtk(yearlyRevenueTarget)}</div>
              </div>
            </div>
          </Card>

          {/* Q3: Growth on track? */}
          <Card className="border-l-4" style={{ borderLeftColor: growthOnTrack ? "#10b981" : "#f59e0b" }}>
            <div className="text-xs text-gray-400 mb-2 font-medium">Are we growing to plan?</div>
            <StatusSignal yes={growthOnTrack} labelYes="Headcount on target" labelNo="Behind hiring plan" />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs text-gray-400">Current headcount</div>
                <div className="text-lg font-bold tracking-tight text-gray-800">{headcountCurrent}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">EOY target</div>
                <div className="text-lg font-bold tracking-tight text-gray-800">{headcountTarget}</div>
                <div className="text-xs text-gray-400">started at {headcountStart}</div>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* ═══ TRAJECTORY CHARTS ═══ */}
      <Section title="Yearly trajectories" subtitle="Tracking actuals against annual targets — are we converging or diverging?" delay={80}>
        <div className="grid grid-cols-3 gap-3">
          {/* Revenue trajectory */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-400 font-medium">Revenue (monthly, $k)</div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${revenueOnTrack ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                {revenueOnTrack ? "On pace" : "Behind"}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-2">YTD: {fmtk(totalBilled)} of {fmtk(yearlyRevenueTarget)}</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyRevenue} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} tickFormatter={v => v + "k"} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => v ? ["$" + v + "k", ""] : null} />
                <Bar dataKey="target" fill="#e0e7ff" radius={[3, 3, 0, 0]} name="Target pace" />
                <Bar dataKey="actual" fill="#6366f1" radius={[3, 3, 0, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Profit trajectory */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-400 font-medium">Profit (monthly, $k)</div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${marginOnTrack ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                {marginOnTrack ? "Margin healthy" : "Margin pressure"}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-2">YTD profit: {fmtk(profit)} · Target margin: {TARGET_MARGIN}%</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyProfit} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} tickFormatter={v => v + "k"} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => v ? ["$" + v + "k", ""] : null} />
                <Bar dataKey="target" fill="#d1fae5" radius={[3, 3, 0, 0]} name="Target pace" />
                <Bar dataKey="actual" radius={[3, 3, 0, 0]} name="Actual">
                  {monthlyProfit.map((e, i) => <Cell key={i} fill={e.actual && e.actual >= e.target ? "#10b981" : e.actual ? "#f59e0b" : "#e5e7eb"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Headcount trajectory */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-400 font-medium">Headcount</div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${growthOnTrack ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                {growthOnTrack ? "On plan" : "Behind plan"}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-2">{headcountCurrent} now → {headcountTarget} target EOY</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={headcountTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={24} domain={[8, 20]} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #f3f4f6" }} />
                <Line type="monotone" dataKey="target" stroke="#d1d5db" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Hiring plan" />
                <Line type="monotone" dataKey="actual" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6" }} name="Actual" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </Section>

      {/* ═══ PROJECT-LEVEL DETAIL ═══ */}
      <Section title="Project comparison" subtitle="How each project performs relative to targets" delay={140}>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <div className="text-xs text-gray-400 mb-3 font-medium">Margin by project vs. {TARGET_MARGIN}% target</div>
            <ResponsiveContainer width="100%" height={Math.max(180, perProjectMargin.length * 32)}>
              <BarChart data={perProjectMargin} layout="vertical" barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" domain={[0, 55]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => v + "%"} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => [v + "%", "Margin"]} />
                <ReferenceLine x={TARGET_MARGIN} stroke="#f59e0b" strokeDasharray="4 4" />
                <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                  {perProjectMargin.map((e, i) => <Cell key={i} fill={e.margin >= TARGET_MARGIN ? "#10b981" : e.margin >= TARGET_MARGIN - 5 ? "#f59e0b" : "#ef4444"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <div className="text-xs text-gray-400 mb-3 font-medium">Revenue: billed vs. remaining ($k)</div>
            <ResponsiveContainer width="100%" height={Math.max(180, perProjectRevenue.length * 32)}>
              <BarChart data={perProjectRevenue} layout="vertical" barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => "$" + v + "k"} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => ["$" + v.toFixed(0) + "k", ""]} />
                <Bar dataKey="billed" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} name="Billed" />
                <Bar dataKey="remaining" stackId="a" fill="#e0e7ff" radius={[0, 4, 4, 0]} name="Remaining" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </Section>

      {/* Margin trend (all projects) */}
      <Section title="Margin trend" subtitle={"At-risk projects highlighted — dashed line = " + TARGET_MARGIN + "% target"} delay={200}>
        <Card>
          <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-rose-400 inline-block rounded" /> Below target</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-gray-300 inline-block rounded" /> Healthy</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={marginHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} domain={[15, 55]} tickFormatter={v => v + "%"} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={v => v !== undefined ? [v + "%", ""] : null} />
              <ReferenceLine y={TARGET_MARGIN} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Target", position: "right", fontSize: 10, fill: "#f59e0b" }} />
              {projects.map((p) => {
                const lastMargin = marginHistory[marginHistory.length - 1]?.[p.id];
                const isAtRisk = lastMargin !== undefined && lastMargin < TARGET_MARGIN;
                return <Line key={p.id} type="monotone" dataKey={p.id} stroke={isAtRisk ? "#f43f5e" : "#d1d5db"} strokeWidth={isAtRisk ? 2 : 1} dot={isAtRisk ? { r: 2.5, fill: "#f43f5e" } : false} name={p.name.split(" ").slice(0, 2).join(" ")} />;
              })}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </Section>

      {/* Project list */}
      <Section title="Projects" subtitle="Click to drill into financial detail" delay={260}>
        <div className="grid gap-3">
          {allFins.map(p => {
            const pctBurn = p.fin.rows.reduce((s, r) => s + r.actualHours, 0) / p.fin.rows.reduce((s, r) => s + r.plannedHours, 0) * 100;
            return (
              <Card key={p.id} className="cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all duration-200" onClick={() => onSelect(p)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-700">{p.name}</span>
                      <StatusPill status={pctBurn > 85 ? "at-risk" : p.status} />
                      {viewScope === "ac" && <span className="text-xs text-gray-400">{p.bu}</span>}
                    </div>
                    <div className="text-xs text-gray-400">{p.account} · {p.startDate} → {p.endDate}</div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right"><div className="text-xs text-gray-400">Fee</div><div className="text-sm font-semibold text-gray-700">{fmtk(p.fin.totalFee)}</div></div>
                    <div className="text-right"><div className="text-xs text-gray-400">Cost</div><div className="text-sm font-semibold text-gray-700">{fmtk(p.fin.totalCost)}</div></div>
                    <div className="text-right"><div className="text-xs text-gray-400">Margin</div><div className={`text-sm font-bold ${p.fin.margin >= TARGET_MARGIN ? "text-emerald-600" : p.fin.margin >= TARGET_MARGIN - 5 ? "text-amber-600" : "text-rose-600"}`}>{fmtPct(p.fin.margin)}</div></div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ── Main ──
const PRESETS = { bul: ["p1", "p2", "p4", "p5", "p6", "p7", "p8", "p9"], ac: ["p1", "p2", "p3", "p4", "p6", "p8"] };

export default function FinancialViews() {
  const [viewScope, setViewScope] = useState("bul");
  const [selectedProject, setSelectedProject] = useState(null);
  const [key, setKey] = useState(0);

  const visibleProjects = PROJECTS.filter(p => PRESETS[viewScope].includes(p.id));

  const switchScope = (s) => { setViewScope(s); setSelectedProject(null); setKey(k => k + 1); };

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="text-lg font-bold text-gray-800 tracking-tight">Quanta</div><span className="text-xs text-gray-300">|</span><span className="text-sm text-gray-400">Financials</span></div>
          <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-xs font-semibold text-teal-600">SK</div><div className="text-sm text-gray-600">Sarah Kim</div></div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div><div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Prototype controls</div><div className="text-sm text-gray-500">Switch between BUL and AC financial perspectives</div></div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => switchScope("bul")} className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-all duration-200 cursor-pointer ${viewScope === "bul" ? "bg-teal-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>BUL — BU scoped</button>
              <button onClick={() => switchScope("ac")} className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-all duration-200 cursor-pointer ${viewScope === "ac" ? "bg-amber-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>AC — Account scoped</button>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">{viewScope === "bul" ? "Viewing as BUL of US-ORD-OWLS. Full financial access on BU projects." : "Viewing as AC managing Meridian Corp + Pinnacle Tech. Full financial access across BUs."}</div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {viewScope === "bul" ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 rounded-lg border border-teal-100"><span className="text-xs font-semibold text-teal-700">BUL</span><span className="text-xs text-teal-600">US-ORD-OWLS</span><span className="text-xs text-teal-400">· {visibleProjects.length} projects</span></div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100"><span className="text-xs font-semibold text-amber-700">AC</span><span className="text-xs text-amber-600">Meridian Corp, Pinnacle Tech</span><span className="text-xs text-amber-400">· {visibleProjects.length} projects across BUs</span></div>
          )}
        </div>

        <div key={key}>
          {selectedProject ? (
            <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(null)} />
          ) : (
            <RollupView projects={visibleProjects} viewScope={viewScope} onSelect={setSelectedProject} />
          )}
        </div>
      </div>
    </div>
  );
}
