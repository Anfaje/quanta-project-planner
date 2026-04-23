import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Area, AreaChart, ReferenceLine, Legend } from "recharts";

const burnData = Array.from({ length: 12 }, (_, i) => {
  const week = `W${i + 1}`;
  const plannedCumulative = (i + 1) * 120;
  const noise = [0, -5, 8, -3, 12, 6, -8, 15, 22, 30, 28, 35];
  const actualCumulative = i <= 7 ? plannedCumulative + noise[i] : null;
  return { week, planned: plannedCumulative, actual: actualCumulative };
});

const detailWeekly = [
  { week: "W1", planned: 120, actual: 115, resources: 6 },
  { week: "W2", planned: 120, actual: 128, resources: 6 },
  { week: "W3", planned: 120, actual: 117, resources: 6 },
  { week: "W4", planned: 120, actual: 132, resources: 7 },
  { week: "W5", planned: 120, actual: 126, resources: 7 },
  { week: "W6", planned: 120, actual: 138, resources: 7 },
  { week: "W7", planned: 120, actual: 112, resources: 6 },
  { week: "W8", planned: 120, actual: 135, resources: 7 },
];

const marginTrend = [
  { week: "W1", margin: 42 }, { week: "W2", margin: 40 }, { week: "W3", margin: 38 },
  { week: "W4", margin: 41 }, { week: "W5", margin: 39 }, { week: "W6", margin: 37 },
  { week: "W7", margin: 36 }, { week: "W8", margin: 38 },
];

const dailyPlan = [
  { day: "Mon", project: "Brand Refresh 2026", planned: 4 },
  { day: "Tue", project: "Brand Refresh 2026", planned: 4 },
  { day: "Wed", project: "Zephyr Mobile App", planned: 6 },
  { day: "Thu", project: "Zephyr Mobile App", planned: 6 },
  { day: "Fri", project: "Atlas Data Migration", planned: 4 },
  { day: "Mon", project: "Zephyr Mobile App", planned: 4 },
  { day: "Tue", project: "Atlas Data Migration", planned: 4 },
];

function groupByProject(entries) {
  const map = {};
  entries.forEach(e => { if (!map[e.project]) map[e.project] = []; map[e.project].push(e); });
  return map;
}

const teamMembers = [
  { name: "Maya Chen", role: "iOS Dev", planned: 40, actual: 38 },
  { name: "Jonas Berg", role: "Designer", planned: 32, actual: 34 },
  { name: "Priya Sharma", role: "3D Dev", planned: 24, actual: 20 },
  { name: "Alex Rivera", role: "Backend", planned: 40, actual: 42 },
  { name: "Lena Kowalski", role: "PM", planned: 16, actual: 14 },
];

const projects = [
  { name: "Brand Refresh 2026", account: "Meridian Corp", bu: "US-ORD-OWLS", pctUsed: 68, hoursRemain: 320, status: "on-track", fee: 245000, cost: 142000, margin: 42, billed: 166600, projectedRevenue: 245000 },
  { name: "Zephyr Mobile App", account: "Pinnacle Tech", bu: "US-ORD-OWLS", pctUsed: 87, hoursRemain: 104, status: "at-risk", fee: 380000, cost: 248000, margin: 35, billed: 330600, projectedRevenue: 380000 },
  { name: "Atlas Data Migration", account: "Meridian Corp", bu: "DK-AAR-PANDA", pctUsed: 42, hoursRemain: 580, status: "on-track", fee: 165000, cost: 89000, margin: 46, billed: 69300, projectedRevenue: 165000 },
  { name: "Nova Platform Redesign", account: "Pinnacle Tech", bu: "US-CA-SE", pctUsed: 91, hoursRemain: 45, status: "at-risk", fee: 420000, cost: 310000, margin: 26, billed: 382200, projectedRevenue: 420000 },
  { name: "Horizon Analytics", account: "Lumen Group", bu: "DK-AAR-PANDA", pctUsed: 55, hoursRemain: 400, status: "on-track", fee: 198000, cost: 108000, margin: 45, billed: 108900, projectedRevenue: 198000 },
];

const allUsers = [
  { roles: ["IC"], count: 24 }, { roles: ["IC", "PM"], count: 8 },
  { roles: ["PM"], count: 3 }, { roles: ["IC", "PM", "AC"], count: 2 },
  { roles: ["IC", "PM", "BUL"], count: 2 }, { roles: ["AC"], count: 1 },
  { roles: ["AA", "IC"], count: 1 }, { roles: ["AA"], count: 1 },
];

const busData = [
  { code: "US-ORD-OWLS", users: 14, projects: 6, active: true },
  { code: "DK-AAR-PANDA", users: 11, projects: 5, active: true },
  { code: "US-CA-SE", users: 8, projects: 4, active: true },
  { code: "EU-BER-FOXES", users: 3, projects: 1, active: true },
];

const fmt = (n) => n.toLocaleString("en-US");
const fmtk = (n) => n >= 1000 ? "$" + (n / 1000).toFixed(0) + "k" : "$" + n;
const fmtCurrency = (n) => "$" + (n / 1000).toFixed(1) + "k";

function StatusDot({ status }) {
  const c = { "on-track": "bg-emerald-400", "over": "bg-amber-400", "under": "bg-sky-400", "at-risk": "bg-rose-400" };
  return <span className={`inline-block w-2 h-2 rounded-full ${c[status] || "bg-gray-400"}`} />;
}

function SectionShell({ title, subtitle, children, delay = 0 }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div className="mb-6 transition-all duration-500 ease-out" style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(12px)" }}>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800" style={{ letterSpacing: "-0.01em" }}>{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${className}`}>{children}</div>;
}

function Metric({ label, value, sub, accent }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${accent || "text-gray-800"}`} style={{ letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ProgressRing({ value, target, size = 56, stroke = 5, color = "#6366f1" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / target, 1);
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
    </svg>
  );
}

function ICSection() {
  const [entries, setEntries] = useState(dailyPlan.map(e => ({ ...e, actual: null, approved: false })));
  const grouped = groupByProject(entries);
  const totalPlanned = entries.reduce((s, e) => s + e.planned, 0);
  const totalLogged = entries.reduce((s, e) => s + (e.approved ? e.planned : (e.actual || 0)), 0);
  const allDone = entries.every(e => e.approved || e.actual !== null);

  const approve = (idx) => setEntries(p => p.map((e, i) => i === idx ? { ...e, approved: true, actual: e.planned } : e));
  const approveAll = () => setEntries(p => p.map(e => e.approved || e.actual !== null ? e : { ...e, approved: true, actual: e.planned }));
  const setAct = (idx, val) => {
    if (val === "") setEntries(p => p.map((e, i) => i === idx ? { ...e, actual: null, approved: false } : e));
    else { const n = parseFloat(val); if (!isNaN(n) && n >= 0) setEntries(p => p.map((e, i) => i === idx ? { ...e, actual: n, approved: n === e.planned } : e)); }
  };

  return (
    <SectionShell title="My hours" subtitle="This week's time entries" delay={80}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><Metric label="Expected this week" value={totalPlanned + "h"} sub={"across " + Object.keys(grouped).length + " projects"} /></Card>
        <Card><Metric label="Logged so far" value={totalLogged + "h"} accent={totalLogged >= totalPlanned ? "text-emerald-600" : "text-gray-800"} sub={totalLogged >= totalPlanned ? "Complete" : (totalPlanned - totalLogged) + "h remaining"} /></Card>
        <Card className="flex items-center justify-between">
          <Metric label="Quick actions" value="" />
          <button onClick={approveAll} disabled={allDone}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all duration-200 ${allDone ? "bg-gray-100 text-gray-300 cursor-default" : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-sm"}`}>
            {allDone ? "All confirmed" : "Approve all as planned"}
          </button>
        </Card>
      </div>
      {Object.entries(grouped).map(([project, pEntries]) => {
        const pPlan = pEntries.reduce((s, e) => s + e.planned, 0);
        const pLog = pEntries.reduce((s, e) => s + (e.approved ? e.planned : (e.actual || 0)), 0);
        return (
          <Card key={project} className="mb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{project}</span>
                <span className="text-xs text-gray-400">{pLog}h / {pPlan}h</span>
              </div>
              <StatusDot status={pLog >= pPlan ? "on-track" : "under"} />
            </div>
            <div className="grid gap-1.5">
              {pEntries.map((entry, idx) => {
                const done = entry.approved || entry.actual !== null;
                return (
                  <div key={idx} className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-200 ${done ? "bg-emerald-50/60" : "bg-gray-50"}`}>
                    <span className="text-xs font-semibold text-gray-400 w-8">{entry.day}</span>
                    <span className="text-xs text-gray-400 w-16">Plan: {entry.planned}h</span>
                    <div className="flex-1 flex items-center gap-2">
                      <input type="number" min="0" step="0.5" value={entry.actual !== null ? entry.actual : ""} placeholder={String(entry.planned)}
                        onChange={(e) => setAct(entries.indexOf(entry), e.target.value)}
                        className={`w-16 text-sm text-center py-1 rounded-md border transition-all duration-200 outline-none ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700 font-medium" : "border-gray-200 bg-white text-gray-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"}`} />
                      <span className="text-xs text-gray-300">h</span>
                    </div>
                    {!done ? (
                      <button onClick={() => approve(entries.indexOf(entry))}
                        className="text-xs font-medium px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-all duration-200 cursor-pointer whitespace-nowrap">
                        = {entry.planned}h
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-500 font-medium w-16 text-right">{entry.approved ? "Approved" : "Logged"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </SectionShell>
  );
}

function PMSection() {
  const [showDetail, setShowDetail] = useState(false);
  const cur = burnData.filter(d => d.actual !== null).slice(-1)[0];
  const variance = cur ? cur.actual - cur.planned : 0;

  return (
    <SectionShell title="Project health" subtitle="Burn rate, team utilisation, and project status" delay={160}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {projects.slice(0, 3).map((p, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between mb-2">
              <div><div className="text-sm font-medium text-gray-700">{p.name}</div><div className="text-xs text-gray-400">{p.account}</div></div>
              <StatusDot status={p.status} />
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Budget consumed</span><span className="font-medium text-gray-600">{p.pctUsed}%</span></div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${p.pctUsed > 85 ? "bg-rose-400" : p.pctUsed > 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: p.pctUsed + "%" }} />
              </div>
              <div className="text-xs text-gray-400 mt-1">{fmt(p.hoursRemain)}h remaining</div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-400 font-medium">Hours burn — planned vs. actual</div>
            <button onClick={() => setShowDetail(!showDetail)}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-all duration-200 cursor-pointer">
              {showDetail ? "Cumulative view" : "Weekly detail"}
            </button>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${variance > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
              {variance > 0 ? "+" + variance + "h over plan" : variance < 0 ? Math.abs(variance) + "h under plan" : "On plan"}
            </span>
            <span className="text-xs text-gray-400">through W8 of 12</span>
          </div>
          {!showDetail ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={burnData}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d1d5db" stopOpacity={0.3}/><stop offset="100%" stopColor="#d1d5db" stopOpacity={0.02}/></linearGradient>
                  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.2}/><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} formatter={(v, n) => v !== null ? [v + "h", n] : null} />
                <Area type="monotone" dataKey="planned" stroke="#d1d5db" strokeWidth={2} strokeDasharray="6 3" fill="url(#pg)" name="Planned burn" dot={false} />
                <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5} fill="url(#ag)" name="Actual burn" dot={{ r: 3, fill: "#6366f1" }} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-1.5 font-medium">Week</th><th className="text-right py-1.5 font-medium">Planned</th>
                <th className="text-right py-1.5 font-medium">Actual</th><th className="text-right py-1.5 font-medium">Delta</th>
                <th className="text-right py-1.5 font-medium">Team</th><th className="text-left py-1.5 font-medium pl-3">Variance</th>
              </tr></thead>
              <tbody>
                {detailWeekly.map((w, i) => {
                  const d = w.actual - w.planned, pct = ((d / w.planned) * 100).toFixed(0);
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-700 font-medium">{w.week}</td>
                      <td className="py-2 text-right text-gray-400">{w.planned}h</td>
                      <td className="py-2 text-right text-gray-700 font-medium">{w.actual}h</td>
                      <td className={`py-2 text-right font-medium ${d > 0 ? "text-amber-500" : d < 0 ? "text-emerald-500" : "text-gray-400"}`}>{d > 0 ? "+" : ""}{d}h</td>
                      <td className="py-2 text-right text-gray-400">{w.resources}</td>
                      <td className="py-2 pl-3"><div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${d > 0 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: Math.min(Math.abs(d / w.planned) * 100, 100) + "%" }} /></div>
                        <span className={`text-xs ${d > 0 ? "text-amber-500" : "text-emerald-500"}`}>{pct > 0 ? "+" : ""}{pct}%</span>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <div className="text-xs text-gray-400 mb-2 font-medium">Team this week</div>
          <table className="w-full text-xs">
            <thead><tr className="text-gray-400 border-b border-gray-50">
              <th className="text-left py-1.5 font-medium">Name</th><th className="text-left py-1.5 font-medium">Role</th>
              <th className="text-right py-1.5 font-medium">Plan</th><th className="text-right py-1.5 font-medium">Actual</th><th className="text-right py-1.5 font-medium">Delta</th>
            </tr></thead>
            <tbody>{teamMembers.map((m, i) => {
              const d = m.actual - m.planned;
              return (<tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-700 font-medium">{m.name}</td><td className="py-1.5 text-gray-400">{m.role}</td>
                <td className="py-1.5 text-right text-gray-400">{m.planned}h</td><td className="py-1.5 text-right text-gray-700 font-medium">{m.actual}h</td>
                <td className={`py-1.5 text-right font-medium ${d > 0 ? "text-amber-500" : d < 0 ? "text-sky-500" : "text-gray-400"}`}>{d > 0 ? "+" : ""}{d}h</td>
              </tr>);
            })}</tbody>
          </table>
        </Card>
      </div>
    </SectionShell>
  );
}

function ACSection() {
  const accounts = [
    { name: "Meridian Corp", projects: 2, totalFee: 410000, totalCost: 231000, margin: 44 },
    { name: "Pinnacle Tech", projects: 2, totalFee: 800000, totalCost: 558000, margin: 30 },
  ];
  return (
    <SectionShell title="Account overview" subtitle="Financial summary across your managed accounts" delay={240}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {accounts.map((a, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between mb-3">
              <div><div className="text-sm font-semibold text-gray-700">{a.name}</div><div className="text-xs text-gray-400">{a.projects} active projects</div></div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.margin >= 40 ? "bg-emerald-50 text-emerald-700" : a.margin >= 35 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{a.margin}% margin</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Total fee" value={fmtk(a.totalFee)} />
              <Metric label="Total cost" value={fmtk(a.totalCost)} />
              <Metric label="Gross margin" value={fmtk(a.totalFee - a.totalCost)} accent={a.margin >= 40 ? "text-emerald-600" : "text-amber-600"} />
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="text-xs text-gray-400 mb-2 font-medium">At-risk projects on your accounts</div>
        {projects.filter(p => p.status === "at-risk" && ["Meridian Corp", "Pinnacle Tech"].includes(p.account)).map((p, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2"><StatusDot status="at-risk" /><span className="text-sm font-medium text-gray-700">{p.name}</span><span className="text-xs text-gray-400">{p.account} · {p.bu}</span></div>
            <div className="flex items-center gap-4 text-xs"><span className="text-gray-400">Budget: <span className="font-medium text-rose-500">{p.pctUsed}%</span></span><span className="text-gray-400">Margin: <span className="font-medium text-gray-600">{p.margin}%</span></span></div>
          </div>
        ))}
      </Card>
    </SectionShell>
  );
}

function BULSection() {
  const buP = projects.filter(p => p.bu === "US-ORD-OWLS");
  const revToDate = buP.reduce((s, p) => s + p.billed, 0);
  const projRev = buP.reduce((s, p) => s + p.projectedRevenue, 0);
  const costToDate = buP.reduce((s, p) => s + p.cost, 0);
  const profit = revToDate - costToDate;
  const marg = Math.round((profit / revToDate) * 100);
  const target = 40;
  const revPct = Math.round((revToDate / projRev) * 100);

  return (
    <SectionShell title="BU overview" subtitle="US-ORD-OWLS · Revenue, profitability, and project health" delay={120}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <ProgressRing value={revToDate} target={projRev} size={52} stroke={5} color="#6366f1" />
            <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-semibold text-indigo-600">{revPct}%</span></div>
          </div>
          <div className="text-xs text-gray-400 mb-1 font-medium">Revenue to date</div>
          <div className="text-3xl font-bold text-gray-800 tracking-tight">{fmtCurrency(revToDate)}</div>
          <div className="flex items-center gap-2 mt-2"><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-indigo-500 transition-all duration-700" style={{ width: revPct + "%" }} /></div></div>
          <div className="text-xs text-gray-400 mt-1.5">Projected: <span className="font-medium text-gray-600">{fmtCurrency(projRev)}</span></div>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <ProgressRing value={marg} target={target} size={52} stroke={5} color={marg >= target ? "#10b981" : marg >= target - 5 ? "#f59e0b" : "#ef4444"} />
            <div className="absolute inset-0 flex items-center justify-center"><span className={`text-xs font-semibold ${marg >= target ? "text-emerald-600" : marg >= target - 5 ? "text-amber-600" : "text-rose-600"}`}>{marg}%</span></div>
          </div>
          <div className="text-xs text-gray-400 mb-1 font-medium">Profit to date</div>
          <div className={`text-3xl font-bold tracking-tight ${marg >= target ? "text-emerald-700" : marg >= target - 5 ? "text-amber-700" : "text-rose-700"}`}>{fmtCurrency(profit)}</div>
          <div className="flex items-center gap-2 mt-2"><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-700 ${marg >= target ? "bg-emerald-500" : marg >= target - 5 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: Math.min(marg / target * 100, 100) + "%" }} /></div></div>
          <div className="text-xs text-gray-400 mt-1.5">Margin: <span className={`font-semibold ${marg >= target ? "text-emerald-600" : "text-amber-600"}`}>{marg}%</span> <span className="mx-1.5 text-gray-300">·</span> Target: <span className="font-medium text-gray-600">{target}%</span></div>
        </Card>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card><Metric label="Total fee (all proj.)" value={fmtk(projRev)} /></Card>
        <Card><Metric label="Cost to date" value={fmtk(costToDate)} /></Card>
        <Card><Metric label="Contingency adj." value={fmtk(Math.round(projRev * 1.15))} sub="@ 15%" /></Card>
        <Card><Metric label="Active projects" value={buP.length} /></Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-gray-400 mb-3 font-medium">Margin trend</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={marginTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} domain={[25, 50]} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }} />
              <ReferenceLine y={target} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Target", position: "right", fontSize: 10, fill: "#f59e0b" }} />
              <Line type="monotone" dataKey="margin" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} name="Margin %" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div className="text-xs text-gray-400 mb-2 font-medium">BU projects</div>
          {buP.map((p, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2"><StatusDot status={p.status} /><span className="text-sm font-medium text-gray-700">{p.name}</span><span className="text-xs text-gray-400">{p.account}</span></div>
              <div className="flex items-center gap-4 text-xs"><span className="text-gray-400">Rev: <span className="font-medium text-gray-600">{fmtk(p.billed)}</span></span><span className="text-gray-400">Margin: <span className={`font-medium ${p.margin >= target ? "text-emerald-600" : "text-rose-500"}`}>{p.margin}%</span></span></div>
            </div>
          ))}
        </Card>
      </div>
    </SectionShell>
  );
}

function AASection() {
  const tot = allUsers.reduce((s, u) => s + u.count, 0);
  return (
    <SectionShell title="Platform admin" subtitle="System-wide overview across all business units" delay={100}>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card><Metric label="Total users" value={tot} /></Card>
        <Card><Metric label="Business units" value={busData.length} /></Card>
        <Card><Metric label="Active projects" value={projects.length} /></Card>
        <Card><Metric label="Accounts" value="3" /></Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-gray-400 mb-2 font-medium">Users by role combination</div>
          {allUsers.map((u, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-1.5">{u.roles.map(r => <span key={r} className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{r}</span>)}</div>
              <span className="text-sm font-semibold text-gray-700">{u.count}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div className="text-xs text-gray-400 mb-2 font-medium">Business units</div>
          {busData.map((b, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm font-medium text-gray-700">{b.code}</span>
              <div className="flex items-center gap-4 text-xs text-gray-400"><span>{b.users} users</span><span>{b.projects} projects</span><span className={`font-medium ${b.active ? "text-emerald-500" : "text-gray-300"}`}>{b.active ? "Active" : "Inactive"}</span></div>
            </div>
          ))}
        </Card>
      </div>
    </SectionShell>
  );
}

const PRESETS = [
  { label: "IC only", roles: ["IC"] }, { label: "PM + IC", roles: ["IC", "PM"] },
  { label: "AC + PM + IC", roles: ["IC", "PM", "AC"] }, { label: "BUL + PM + IC", roles: ["IC", "PM", "BUL"] },
  { label: "AA", roles: ["AA"] }, { label: "AA + IC", roles: ["AA", "IC"] },
];

const ROLE_DEFS = [
  { id: "IC", label: "IC", color: "bg-gray-100 text-gray-600 border-gray-200", activeColor: "bg-gray-700 text-white border-gray-700" },
  { id: "PM", label: "PM", color: "bg-indigo-50 text-indigo-600 border-indigo-200", activeColor: "bg-indigo-600 text-white border-indigo-600" },
  { id: "AC", label: "AC", color: "bg-amber-50 text-amber-600 border-amber-200", activeColor: "bg-amber-500 text-white border-amber-500" },
  { id: "BUL", label: "BUL", color: "bg-teal-50 text-teal-600 border-teal-200", activeColor: "bg-teal-600 text-white border-teal-600" },
  { id: "AA", label: "AA", color: "bg-violet-50 text-violet-600 border-violet-200", activeColor: "bg-violet-600 text-white border-violet-600" },
];

export default function QuantaDashboard() {
  const [roles, setRoles] = useState(["IC", "PM"]);
  const [key, setKey] = useState(0);
  const toggle = (id) => { setRoles(p => { const n = p.includes(id) ? p.filter(r => r !== id) : [...p, id]; return n.length === 0 ? [id] : n; }); setKey(k => k + 1); };
  const apply = (p) => { setRoles(p.roles); setKey(k => k + 1); };
  const has = (r) => roles.includes(r);
  const sections = [];
  if (has("BUL")) sections.push("BUL"); if (has("AC")) sections.push("AC"); if (has("AA")) sections.push("AA"); if (has("PM")) sections.push("PM"); if (has("IC")) sections.push("IC");

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="text-lg font-bold text-gray-800 tracking-tight">Quanta</div><span className="text-xs text-gray-300">|</span><span className="text-sm text-gray-400">Dashboard</span></div>
          <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">JD</div><div className="text-sm text-gray-600">Jane Doe</div></div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div><div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Prototype controls</div><div className="text-sm text-gray-500">Toggle roles to see how the dashboard adapts</div></div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg"><span className="text-xs text-gray-400">Active:</span>{[...roles].sort().map(r => { const d = ROLE_DEFS.find(x => x.id === r); return <span key={r} className={`text-xs font-semibold px-1.5 py-0.5 rounded ${d?.activeColor}`}>{r}</span>; })}</div>
          </div>
          <div className="flex items-center gap-2 mb-3"><span className="text-xs text-gray-400 mr-1">Roles:</span>{ROLE_DEFS.map(rd => <button key={rd.id} onClick={() => toggle(rd.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${has(rd.id) ? rd.activeColor : rd.color} hover:opacity-80`}>{rd.label}</button>)}</div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-400 mr-1">Presets:</span>{PRESETS.map((pr, i) => <button key={i} onClick={() => apply(pr)} className={`text-xs px-2.5 py-1 rounded-md border transition-all duration-200 cursor-pointer ${JSON.stringify([...roles].sort()) === JSON.stringify([...pr.roles].sort()) ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>{pr.label}</button>)}</div>
        </div>
        <div className="mb-6"><h1 className="text-xl font-semibold text-gray-800" style={{ letterSpacing: "-0.02em" }}>Good morning, Jane</h1><p className="text-sm text-gray-400 mt-0.5">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · Week 8</p></div>
        <div key={key}>{sections.length === 0 ? <div className="text-center py-16 text-gray-400"><div className="text-lg mb-2">No roles selected</div><div className="text-sm">Toggle at least one role above.</div></div> : sections.map(s => { switch(s) { case "IC": return <ICSection key="ic"/>; case "PM": return <PMSection key="pm"/>; case "AC": return <ACSection key="ac"/>; case "BUL": return <BULSection key="bul"/>; case "AA": return <AASection key="aa"/>; default: return null; }})}</div>
      </div>
    </div>
  );
}
