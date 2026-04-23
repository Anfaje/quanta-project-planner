import { useState, useEffect, useRef } from "react";

// ── Mock data ──
const PROJECTS = [
  { id: "p1", name: "Brand Refresh 2026", account: "Meridian Corp", role: "Designer", color: "#6366f1" },
  { id: "p2", name: "Zephyr Mobile App", account: "Pinnacle Tech", role: "iOS Dev", color: "#f59e0b" },
  { id: "p3", name: "Atlas Data Migration", account: "Meridian Corp", role: "Support", color: "#10b981" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function generateWeekData(weekOffset) {
  const base = new Date(2026, 3, 13); // Mon Apr 13 2026
  const weekStart = new Date(base);
  weekStart.setDate(base.getDate() + weekOffset * 7);

  const isCurrentWeek = weekOffset === 0;
  const isPast = weekOffset < 0;
  const isFuture = weekOffset > 0;
  const isLocked = weekOffset <= -2;

  const planned = {
    p1: [4, 4, 0, 0, 2],
    p2: [0, 0, 6, 6, 0],
    p3: [0, 2, 2, 0, 4],
  };

  const actuals = {};
  PROJECTS.forEach(p => {
    if (isPast && !isLocked) {
      actuals[p.id] = planned[p.id].map(h => h + Math.round((Math.random() - 0.4) * 2));
    } else if (isPast && isLocked) {
      actuals[p.id] = planned[p.id].map(h => h + Math.round((Math.random() - 0.3) * 1.5));
    } else if (isCurrentWeek) {
      // Partially filled - first 3 days done
      actuals[p.id] = planned[p.id].map((h, i) => i < 3 ? h : null);
    } else {
      actuals[p.id] = [null, null, null, null, null];
    }
  });

  return {
    weekStart,
    weekOffset,
    isCurrentWeek,
    isPast,
    isFuture,
    isLocked,
    planned,
    actuals,
  };
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRange(start) {
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `${formatDate(start)} – ${formatDate(end)}, ${start.getFullYear()}`;
}

function getWeekLabel(offset) {
  if (offset === 0) return "Current week";
  if (offset === -1) return "Last week";
  if (offset === 1) return "Next week";
  if (offset < 0) return `${Math.abs(offset)} weeks ago`;
  return `In ${offset} weeks`;
}

// ── Components ──

function Pill({ children, color = "gray" }) {
  const styles = {
    gray: "bg-gray-100 text-gray-500",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-rose-50 text-rose-600",
    indigo: "bg-indigo-50 text-indigo-600",
    locked: "bg-gray-100 text-gray-400",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[color]}`}>{children}</span>;
}

function HourCell({ value, planned, locked, future, onChange, autoFocus }) {
  const ref = useRef(null);
  const isEmpty = value === null || value === undefined;
  const isMatch = !isEmpty && value === planned;
  const isDiff = !isEmpty && value !== planned;

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  if (locked) {
    return (
      <div className="flex items-center justify-center gap-1">
        <span className={`text-sm font-medium ${isEmpty ? "text-gray-300" : "text-gray-500"}`}>
          {isEmpty ? "–" : value}
        </span>
        <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
    );
  }

  if (future) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-sm text-gray-300">–</span>
      </div>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      min="0"
      max="24"
      step="0.5"
      value={isEmpty ? "" : value}
      placeholder={planned > 0 ? String(planned) : "0"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") onChange(null);
        else { const n = parseFloat(v); if (!isNaN(n) && n >= 0) onChange(n); }
      }}
      className={`w-14 text-sm text-center py-1.5 rounded-lg border outline-none transition-all duration-200 ${
        isMatch ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 font-semibold" :
        isDiff ? "border-indigo-200 bg-indigo-50/50 text-indigo-700 font-semibold" :
        "border-gray-200 bg-white text-gray-600 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
      }`}
    />
  );
}

function WeekNav({ weekOffset, onPrev, onNext, onToday }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToday}
        className={`text-xs font-medium w-14 text-center px-2 py-1 rounded-md transition-all ${weekOffset !== 0 ? "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 cursor-pointer" : "text-transparent pointer-events-none"}`}>
        Today
      </button>
      <button onClick={onPrev}
        className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all cursor-pointer">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button onClick={onNext}
        className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all cursor-pointer">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ── Main ──
export default function HoursGrid() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekCache, setWeekCache] = useState({});
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [showSummary, setShowSummary] = useState(false);

  // Initialize or get week data
  const getWeek = (offset) => {
    if (!weekCache[offset]) {
      const data = generateWeekData(offset);
      setWeekCache(prev => ({ ...prev, [offset]: data }));
      return data;
    }
    return weekCache[offset];
  };

  const week = getWeek(weekOffset);

  const updateActual = (projectId, dayIdx, value) => {
    setWeekCache(prev => ({
      ...prev,
      [weekOffset]: {
        ...prev[weekOffset],
        actuals: {
          ...prev[weekOffset].actuals,
          [projectId]: prev[weekOffset].actuals[projectId].map((v, i) => i === dayIdx ? value : v),
        },
      },
    }));
    setSaveState("idle");
  };

  const approveAllPlanned = () => {
    setWeekCache(prev => {
      const w = prev[weekOffset];
      const newActuals = {};
      PROJECTS.forEach(p => {
        newActuals[p.id] = w.actuals[p.id].map((v, i) =>
          v === null && w.planned[p.id][i] > 0 ? w.planned[p.id][i] : v
        );
      });
      return { ...prev, [weekOffset]: { ...w, actuals: newActuals } };
    });
    setSaveState("idle");
  };

  const save = () => {
    setSaveState("saving");
    setTimeout(() => setSaveState("saved"), 800);
    setTimeout(() => setSaveState("idle"), 2500);
  };

  // Calculate totals
  const dayTotalsActual = DAYS.map((_, di) =>
    PROJECTS.reduce((s, p) => s + (week.actuals[p.id]?.[di] || 0), 0)
  );
  const dayTotalsPlanned = DAYS.map((_, di) =>
    PROJECTS.reduce((s, p) => s + (week.planned[p.id]?.[di] || 0), 0)
  );
  const weekTotalActual = dayTotalsActual.reduce((a, b) => a + b, 0);
  const weekTotalPlanned = dayTotalsPlanned.reduce((a, b) => a + b, 0);

  const hasUnfilled = PROJECTS.some(p =>
    week.actuals[p.id]?.some((v, i) => v === null && week.planned[p.id][i] > 0)
  );

  // Week dates for column headers
  const dayDates = DAYS.map((_, i) => {
    const d = new Date(week.weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold text-gray-800 tracking-tight">Quanta</div>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-sm text-gray-400">Timesheet</span>
          </div>
          <div className="flex items-center gap-3">
            {saveState === "saved" && (
              <span className="text-xs text-emerald-500 font-medium flex items-center gap-1 animate-pulse">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Saved
              </span>
            )}
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">JD</div>
            <div className="text-sm text-gray-600">Jane Doe</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Week header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-gray-800" style={{ letterSpacing: "-0.02em" }}>
                {formatWeekRange(week.weekStart)}
              </h1>
              {week.isCurrentWeek && <Pill color="indigo">Current week</Pill>}
              {week.isLocked && <Pill color="locked">Locked</Pill>}
              {week.isFuture && <Pill color="gray">Future</Pill>}
            </div>
            <p className="text-sm text-gray-400">{getWeekLabel(weekOffset)}</p>
          </div>
          <WeekNav
            weekOffset={weekOffset}
            onPrev={() => { setWeekOffset(w => w - 1); getWeek(weekOffset - 1); }}
            onNext={() => { setWeekOffset(w => w + 1); getWeek(weekOffset + 1); }}
            onToday={() => setWeekOffset(0)}
          />
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <div className="text-xs text-gray-400 mb-1">Planned</div>
            <div className="text-2xl font-bold text-gray-800 tracking-tight">{weekTotalPlanned}h</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <div className="text-xs text-gray-400 mb-1">Logged</div>
            <div className={`text-2xl font-bold tracking-tight ${weekTotalActual >= weekTotalPlanned && weekTotalActual > 0 ? "text-emerald-600" : "text-gray-800"}`}>
              {weekTotalActual}h
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
            <div className="text-xs text-gray-400 mb-1">Remaining</div>
            <div className={`text-2xl font-bold tracking-tight ${weekTotalPlanned - weekTotalActual <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {Math.max(0, weekTotalPlanned - weekTotalActual)}h
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">Completion</div>
              <div className="text-2xl font-bold text-gray-800 tracking-tight">
                {weekTotalPlanned > 0 ? Math.min(100, Math.round((weekTotalActual / weekTotalPlanned) * 100)) : 0}%
              </div>
            </div>
            <div className="w-10 h-10">
              <svg viewBox="0 0 36 36" className="transform -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none"
                  stroke={weekTotalActual >= weekTotalPlanned && weekTotalPlanned > 0 ? "#10b981" : "#6366f1"}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 15}
                  strokeDashoffset={2 * Math.PI * 15 * (1 - Math.min(1, weekTotalPlanned > 0 ? weekTotalActual / weekTotalPlanned : 0))}
                  style={{ transition: "stroke-dashoffset 0.6s ease-out" }} />
              </svg>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-4">
          {/* Grid header */}
          <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "1fr repeat(5, 90px) 80px" }}>
            <div className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
              Project
            </div>
            {DAYS.map((day, i) => (
              <div key={day} className={`px-2 py-3 text-center ${i === new Date().getDay() - 1 && week.isCurrentWeek ? "bg-indigo-50/50" : ""}`}>
                <div className="text-xs font-semibold text-gray-500">{day}</div>
                <div className="text-xs text-gray-300 mt-0.5">{formatDate(dayDates[i])}</div>
              </div>
            ))}
            <div className="px-2 py-3 text-center">
              <div className="text-xs font-semibold text-gray-500">Total</div>
            </div>
          </div>

          {/* Project rows */}
          {PROJECTS.map((project, pi) => {
            const rowActuals = week.actuals[project.id] || [null, null, null, null, null];
            const rowPlanned = week.planned[project.id] || [0, 0, 0, 0, 0];
            const rowTotal = rowActuals.reduce((s, v) => s + (v || 0), 0);
            const rowPlannedTotal = rowPlanned.reduce((s, v) => s + v, 0);

            return (
              <div key={project.id}
                className={`grid border-b border-gray-50 last:border-0 transition-colors duration-150 hover:bg-gray-50/50 ${pi % 2 === 1 ? "bg-gray-50/30" : ""}`}
                style={{ gridTemplateColumns: "1fr repeat(5, 90px) 80px" }}>

                {/* Project info */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-1 h-8 rounded-full" style={{ backgroundColor: project.color }} />
                  <div>
                    <div className="text-sm font-medium text-gray-700 leading-tight">{project.name}</div>
                    <div className="text-xs text-gray-400">{project.role} · {project.account}</div>
                  </div>
                </div>

                {/* Day cells */}
                {DAYS.map((_, di) => {
                  const isToday = di === new Date().getDay() - 1 && week.isCurrentWeek;
                  return (
                    <div key={di} className={`px-2 py-2.5 flex items-center justify-center ${isToday ? "bg-indigo-50/30" : ""}`}>
                      <HourCell
                        value={rowActuals[di]}
                        planned={rowPlanned[di]}
                        locked={week.isLocked}
                        future={week.isFuture}
                        onChange={(v) => updateActual(project.id, di, v)}
                      />
                    </div>
                  );
                })}

                {/* Row total */}
                <div className="px-2 py-2.5 flex items-center justify-center">
                  <div className="text-center">
                    <div className={`text-sm font-semibold ${rowTotal >= rowPlannedTotal && rowPlannedTotal > 0 ? "text-emerald-600" : "text-gray-700"}`}>
                      {rowTotal}h
                    </div>
                    <div className="text-xs text-gray-300">/ {rowPlannedTotal}h</div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Day totals footer */}
          <div className="grid bg-gray-50 border-t border-gray-100" style={{ gridTemplateColumns: "1fr repeat(5, 90px) 80px" }}>
            <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center">
              Daily total
            </div>
            {DAYS.map((_, di) => {
              const isToday = di === new Date().getDay() - 1 && week.isCurrentWeek;
              const actual = dayTotalsActual[di];
              const planned = dayTotalsPlanned[di];
              return (
                <div key={di} className={`px-2 py-3 text-center ${isToday ? "bg-indigo-50/40" : ""}`}>
                  <div className={`text-sm font-semibold ${actual >= planned && planned > 0 ? "text-emerald-600" : "text-gray-700"}`}>
                    {actual}h
                  </div>
                  <div className="text-xs text-gray-300">/ {planned}h</div>
                </div>
              );
            })}
            <div className="px-2 py-3 text-center">
              <div className={`text-sm font-bold ${weekTotalActual >= weekTotalPlanned && weekTotalPlanned > 0 ? "text-emerald-600" : "text-gray-800"}`}>
                {weekTotalActual}h
              </div>
              <div className="text-xs text-gray-400">/ {weekTotalPlanned}h</div>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!week.isLocked && !week.isFuture && hasUnfilled && (
              <button onClick={approveAllPlanned}
                className="text-xs font-semibold px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer">
                Fill remaining as planned
              </button>
            )}
            {week.isLocked && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                This week has been locked by your PM. Contact them to make changes.
              </div>
            )}
            {week.isFuture && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Hours can only be entered for past and current weeks.
              </div>
            )}
          </div>

          {!week.isLocked && !week.isFuture && (
            <button onClick={save}
              disabled={saveState === "saving"}
              className={`text-sm font-semibold px-6 py-2.5 rounded-lg transition-all duration-200 cursor-pointer shadow-sm ${
                saveState === "saving" ? "bg-indigo-400 text-white" :
                saveState === "saved" ? "bg-emerald-500 text-white" :
                "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}>
              {saveState === "saving" ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Saving...
                </span>
              ) : saveState === "saved" ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Saved
                </span>
              ) : "Save timesheet"}
            </button>
          )}
        </div>

        {/* Planned vs. actual mini-summary (toggle) */}
        <div className="mt-6">
          <button onClick={() => setShowSummary(!showSummary)}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-all cursor-pointer mb-3">
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showSummary ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Weekly summary by project
          </button>

          {showSummary && (
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
              {PROJECTS.map((project) => {
                const rowActuals = week.actuals[project.id] || [];
                const rowPlanned = week.planned[project.id] || [];
                const actual = rowActuals.reduce((s, v) => s + (v || 0), 0);
                const planned = rowPlanned.reduce((s, v) => s + v, 0);
                const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
                const delta = actual - planned;

                return (
                  <div key={project.id} className="flex items-center gap-4 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: project.color }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-700">{project.name}</div>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <span className="text-gray-400">Plan: <span className="font-medium text-gray-600">{planned}h</span></span>
                      <span className="text-gray-400">Actual: <span className="font-medium text-gray-700">{actual}h</span></span>
                      <span className={`font-semibold ${delta > 0 ? "text-amber-500" : delta < 0 ? "text-sky-500" : "text-emerald-500"}`}>
                        {delta > 0 ? "+" : ""}{delta}h
                      </span>
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-emerald-400" : pct >= 70 ? "bg-indigo-400" : "bg-amber-400"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-gray-400 w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
