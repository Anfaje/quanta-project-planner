import { useState, useEffect, useRef } from "react";

// ── Mock data ──
const ACCOUNTS = [
  { id: "a1", name: "Meridian Corp", code: "MER" },
  { id: "a2", name: "Pinnacle Tech", code: "PIN" },
  { id: "a3", name: "Lumen Group", code: "LUM" },
  { id: "a4", name: "Apex Industries", code: "APX" },
];

const USER_DIRECTORY = [
  { id: "u1", name: "Maya Chen", role: "iOS Dev", bu: "US-ORD-OWLS", billRate: 185, costRate: 95 },
  { id: "u2", name: "Jonas Berg", role: "Designer", bu: "DK-AAR-PANDA", billRate: 165, costRate: 82 },
  { id: "u3", name: "Alex Rivera", role: "Backend", bu: "US-ORD-OWLS", billRate: 195, costRate: 105 },
  { id: "u4", name: "Priya Sharma", role: "3D Dev", bu: "US-ORD-OWLS", billRate: 175, costRate: 88 },
  { id: "u5", name: "Lena Kowalski", role: "PM", bu: "DK-AAR-PANDA", billRate: 210, costRate: 110 },
  { id: "u6", name: "Tom Nguyen", role: "Full Stack", bu: "US-ORD-OWLS", billRate: 190, costRate: 98 },
  { id: "u7", name: "Sara Olsen", role: "UX Lead", bu: "US-ORD-OWLS", billRate: 200, costRate: 102 },
  { id: "u8", name: "Diego Ruiz", role: "DevOps", bu: "US-ORD-OWLS", billRate: 205, costRate: 115 },
  { id: "u9", name: "Emma Walsh", role: "iOS Dev", bu: "US-CA-SE", billRate: 180, costRate: 92 },
  { id: "u10", name: "Kai Tanaka", role: "ML Engineer", bu: "US-CA-SE", billRate: 220, costRate: 130 },
  { id: "u11", name: "Noor Patel", role: "QA Lead", bu: "EU-BER-FOXES", billRate: 160, costRate: 78 },
  { id: "u12", name: "Marco Bianchi", role: "Backend", bu: "EU-BER-FOXES", billRate: 190, costRate: 140 },
];

const ROLE_PRESETS = ["PM", "Lead", "iOS Dev", "Android Dev", "Backend", "Full Stack", "3D Dev", "Designer", "UX Lead", "DevOps", "ML Engineer", "QA Lead", "Support"];

const OWNING_BU = "US-ORD-OWLS";

function generateCode(name) {
  return name.replace(/[^A-Z0-9]/gi, "").substring(0, 3).toUpperCase() + "-" + String(Math.floor(Math.random() * 9000) + 1000);
}

// ── Components ──

function StepIndicator({ steps, current, onStepClick }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {steps.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const isClickable = i < current;
        return (
          <div key={i} className="flex items-center flex-1">
            <button
              onClick={() => isClickable && onStepClick(i)}
              className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg transition-all duration-200 ${
                isActive ? "bg-indigo-50 border border-indigo-200" :
                isDone ? "bg-emerald-50 border border-emerald-100 cursor-pointer hover:bg-emerald-100" :
                "bg-gray-50 border border-gray-100"
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                isActive ? "bg-indigo-600 text-white" :
                isDone ? "bg-emerald-500 text-white" :
                "bg-gray-200 text-gray-400"
              }`}>
                {isDone ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : i + 1}
              </div>
              <div className="text-left min-w-0">
                <div className={`text-xs font-semibold truncate ${isActive ? "text-indigo-700" : isDone ? "text-emerald-700" : "text-gray-400"}`}>{step.label}</div>
              </div>
            </button>
            {i < steps.length - 1 && <div className={`w-4 h-px flex-shrink-0 mx-1 ${isDone ? "bg-emerald-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", disabled }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 disabled:bg-gray-50 disabled:text-gray-400" />
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 bg-white appearance-none cursor-pointer"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Step 1: Project Details ──
function Step1({ data, onChange }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Project details</h2>
      <p className="text-sm text-gray-400 mb-6">Basic information about the project.</p>
      <div className="grid grid-cols-2 gap-x-6">
        <Field label="Project name" required>
          <Input value={data.name} onChange={v => onChange({ ...data, name: v })} placeholder="e.g. Brand Refresh 2026" />
        </Field>
        <Field label="Account (client)" required>
          <Select value={data.accountId} onChange={v => onChange({ ...data, accountId: v })}
            options={ACCOUNTS.map(a => ({ value: a.id, label: a.name }))} placeholder="Select an account" />
        </Field>
        <Field label="Project code" hint="Auto-generated. Edit if needed.">
          <Input value={data.code} onChange={v => onChange({ ...data, code: v })} />
        </Field>
        <Field label="Owning Business Unit">
          <Input value={OWNING_BU} disabled />
        </Field>
        <Field label="Start date" required>
          <Input type="date" value={data.startDate} onChange={v => onChange({ ...data, startDate: v })} />
        </Field>
        <Field label="End date or duration" required>
          <div className="flex gap-2">
            <Input type="date" value={data.endDate} onChange={v => onChange({ ...data, endDate: v })} />
          </div>
        </Field>
        <div className="col-span-2">
          <Field label="Description" hint="Optional. Internal notes about the project.">
            <textarea value={data.description} onChange={e => onChange({ ...data, description: e.target.value })}
              rows={3} placeholder="Brief project description..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 resize-none" />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Add Resources ──
function Step2({ resources, onChange, viewerRole }) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef(null);

  const filtered = USER_DIRECTORY.filter(u =>
    !resources.find(r => r.userId === u.id) &&
    (u.name.toLowerCase().includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase()) || u.bu.toLowerCase().includes(search.toLowerCase()))
  );

  const addResource = (user) => {
    onChange([...resources, {
      userId: user.id, name: user.name, bu: user.bu,
      projectRole: user.role, billRate: user.billRate, costRate: user.costRate,
      crossBU: user.bu !== OWNING_BU,
    }]);
    setSearch("");
    setShowDropdown(false);
  };

  const removeResource = (idx) => onChange(resources.filter((_, i) => i !== idx));
  const updateResource = (idx, field, val) => onChange(resources.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const canSeeCost = viewerRole === "BUL" || viewerRole === "AC";

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Add resources</h2>
      <p className="text-sm text-gray-400 mb-6">Search across all Business Units to find team members.</p>

      {/* Search */}
      <div className="relative mb-4" ref={ref}>
        <div className="relative">
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search by name, role, or BU..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" />
        </div>
        {showDropdown && search.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">No matching users found</div>
            ) : filtered.map(u => (
              <button key={u.id} onClick={() => addResource(u)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors flex items-center justify-between cursor-pointer border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
                    {u.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div className="font-medium text-gray-700">{u.name}</div>
                    <div className="text-xs text-gray-400">{u.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{u.bu}</span>
                  {u.bu !== OWNING_BU && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">cross-BU</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resource list */}
      {resources.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <div className="text-sm text-gray-400">No resources added yet</div>
          <div className="text-xs text-gray-300 mt-1">Search above to add team members</div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">BU</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project role</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Bill rate</th>
                {canSeeCost && <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cost rate</th>}
                <th className="py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                        {r.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="font-medium text-gray-700">{r.name}</span>
                      {r.crossBU && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">cross-BU</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-500 text-xs">{r.bu}</td>
                  <td className="py-2.5 px-3">
                    <select value={r.projectRole} onChange={e => updateResource(i, "projectRole", e.target.value)}
                      className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white outline-none focus:border-indigo-300 cursor-pointer">
                      {ROLE_PRESETS.map(rp => <option key={rp} value={rp}>{rp}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <span className="text-xs text-gray-400">$</span>
                      <input type="number" value={r.billRate} onChange={e => updateResource(i, "billRate", Number(e.target.value))}
                        className="w-14 text-sm text-right py-0.5 px-1 border border-gray-200 rounded-md outline-none focus:border-indigo-300" />
                    </div>
                  </td>
                  {canSeeCost && (
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <span className="text-xs text-gray-400">$</span>
                        <input type="number" value={r.costRate} onChange={e => updateResource(i, "costRate", Number(e.target.value))}
                          className="w-14 text-sm text-right py-0.5 px-1 border border-gray-200 rounded-md outline-none focus:border-indigo-300" />
                      </div>
                    </td>
                  )}
                  <td className="py-2.5 px-3">
                    <button onClick={() => removeResource(i)}
                      className="p-1 rounded-md text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Planned Hours ──
function Step3({ resources, weeks, hours, onChange }) {
  const visibleWeeks = Math.min(weeks || 12, 12);
  const weekLabels = Array.from({ length: visibleWeeks }, (_, i) => `W${i + 1}`);

  const getVal = (rIdx, wIdx) => hours[rIdx]?.[wIdx] ?? "";
  const setVal = (rIdx, wIdx, val) => {
    const next = { ...hours };
    if (!next[rIdx]) next[rIdx] = {};
    next[rIdx][wIdx] = val === "" ? "" : Number(val);
    onChange(next);
  };

  const rowTotal = (rIdx) => Object.values(hours[rIdx] || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const colTotal = (wIdx) => resources.reduce((s, _, rIdx) => s + (Number(hours[rIdx]?.[wIdx]) || 0), 0);
  const grandTotal = resources.reduce((s, _, rIdx) => s + rowTotal(rIdx), 0);

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Set planned hours</h2>
      <p className="text-sm text-gray-400 mb-6">Enter the expected hours per resource per week. Totals update live.</p>

      {resources.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <div className="text-sm text-gray-400">Add resources in the previous step first</div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[140px]">Resource</th>
                {weekLabels.map(w => <th key={w} className="text-center py-2 px-1 text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[56px]">{w}</th>)}
                <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[60px] bg-gray-50">Total</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r, rIdx) => (
                <tr key={rIdx} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 px-3 sticky left-0 bg-white">
                    <div className="text-sm font-medium text-gray-700">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.projectRole}</div>
                  </td>
                  {weekLabels.map((_, wIdx) => (
                    <td key={wIdx} className="py-1.5 px-1 text-center">
                      <input type="number" min="0" max="60" step="1"
                        value={getVal(rIdx, wIdx)} onChange={e => setVal(rIdx, wIdx, e.target.value)}
                        placeholder="0"
                        className="w-12 text-xs text-center py-1.5 border border-gray-200 rounded-md outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-50" />
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center">
                    <span className={`text-sm font-semibold ${rowTotal(rIdx) > 0 ? "text-gray-700" : "text-gray-300"}`}>{rowTotal(rIdx)}h</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50">Weekly total</td>
                {weekLabels.map((_, wIdx) => (
                  <td key={wIdx} className="py-2 px-1 text-center text-xs font-semibold text-gray-600">{colTotal(wIdx) || ""}</td>
                ))}
                <td className="py-2 px-2 text-center text-sm font-bold text-gray-800">{grandTotal}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Financial Setup (BUL/AC only) ──
function Step4({ data, resources, hours, onChange }) {
  const totalPlanned = resources.reduce((s, _, rIdx) => s + Object.values(hours[rIdx] || {}).reduce((ss, v) => ss + (Number(v) || 0), 0), 0);
  const totalFee = resources.reduce((s, r, rIdx) => {
    const rHours = Object.values(hours[rIdx] || {}).reduce((ss, v) => ss + (Number(v) || 0), 0);
    return s + rHours * r.billRate;
  }, 0);
  const totalCost = resources.reduce((s, r, rIdx) => {
    const rHours = Object.values(hours[rIdx] || {}).reduce((ss, v) => ss + (Number(v) || 0), 0);
    return s + rHours * r.costRate;
  }, 0);
  const margin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;
  const contingencyAmt = totalFee * (data.contingency / 100);
  const adjustedFee = totalFee + contingencyAmt;

  const fmt = n => "$" + n.toLocaleString("en-US");

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Financial setup</h2>
      <p className="text-sm text-gray-400 mb-6">Review projected financials and set the contingency percentage.</p>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <Field label="Contingency percentage" hint="Applied to the total fee. Overrides the BU default.">
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" step="1" value={data.contingency}
                onChange={e => onChange({ ...data, contingency: Number(e.target.value) })}
                className="w-20 text-sm text-center py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </Field>
          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Calculation preview</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total planned hours</span><span className="font-medium text-gray-700">{totalPlanned}h</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Base fee (planned × bill rates)</span><span className="font-medium text-gray-700">{fmt(totalFee)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Projected cost (planned × cost rates)</span><span className="font-medium text-gray-700">{fmt(totalCost)}</span></div>
              <div className="border-t border-gray-200 pt-2 flex justify-between"><span className="text-gray-500">Contingency ({data.contingency}%)</span><span className="font-medium text-gray-700">+ {fmt(Math.round(contingencyAmt))}</span></div>
              <div className="flex justify-between"><span className="font-semibold text-gray-700">Adjusted fee total</span><span className="font-bold text-gray-800">{fmt(Math.round(adjustedFee))}</span></div>
            </div>
          </div>
        </div>

        <div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Projected financial health</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-1">Projected margin</div>
                <div className={`text-2xl font-bold tracking-tight ${margin >= 40 ? "text-emerald-600" : margin >= 35 ? "text-amber-600" : "text-rose-600"}`}>
                  {margin.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-400 mt-0.5">Target: 40%</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Projected profit</div>
                <div className={`text-2xl font-bold tracking-tight ${totalFee - totalCost > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {fmt(totalFee - totalCost)}
                </div>
              </div>
            </div>
            <div className="mt-4 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${margin >= 40 ? "bg-emerald-400" : margin >= 35 ? "bg-amber-400" : "bg-rose-400"}`}
                style={{ width: Math.min(margin / 50 * 100, 100) + "%" }} />
            </div>
          </div>

          {margin < 35 && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-rose-50 rounded-lg border border-rose-100">
              <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              <div className="text-xs text-rose-700">Projected margin is below the 35% threshold. Consider adjusting bill rates or resource allocation before launching.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Review & Launch ──
function Step5({ project, resources, hours, financials, viewerRole, onLaunch, launching }) {
  const totalPlanned = resources.reduce((s, _, rIdx) => s + Object.values(hours[rIdx] || {}).reduce((ss, v) => ss + (Number(v) || 0), 0), 0);
  const account = ACCOUNTS.find(a => a.id === project.accountId);
  const canSeeFinancials = viewerRole === "BUL" || viewerRole === "AC";

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Review and launch</h2>
      <p className="text-sm text-gray-400 mb-6">Confirm everything looks right. All assigned resources will be notified by email.</p>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Project</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-700">{project.name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Account</span><span className="font-medium text-gray-700">{account?.name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Code</span><span className="font-mono text-gray-700">{project.code || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">BU</span><span className="font-medium text-gray-700">{OWNING_BU}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Dates</span><span className="font-medium text-gray-700">{project.startDate || "—"} → {project.endDate || "—"}</span></div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Summary</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Resources</span><span className="font-medium text-gray-700">{resources.length}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Cross-BU</span><span className="font-medium text-gray-700">{resources.filter(r => r.crossBU).length}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total planned hours</span><span className="font-medium text-gray-700">{totalPlanned}h</span></div>
            {canSeeFinancials && (
              <>
                <div className="border-t border-gray-100 pt-2 flex justify-between"><span className="text-gray-500">Projected fee</span><span className="font-semibold text-gray-700">${financials.totalFee.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Projected margin</span>
                  <span className={`font-semibold ${financials.margin >= 40 ? "text-emerald-600" : "text-amber-600"}`}>{financials.margin.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Contingency</span><span className="font-medium text-gray-700">+{financials.contingency}%</span></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Resource list preview */}
      <div className="mt-4 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Resources ({resources.length})</div>
        <div className="grid gap-1.5">
          {resources.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                  {r.name.split(" ").map(n => n[0]).join("")}
                </div>
                <span className="text-sm font-medium text-gray-700">{r.name}</span>
                <span className="text-xs text-gray-400">{r.projectRole}</span>
                {r.crossBU && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">cross-BU</span>}
              </div>
              <div className="text-xs text-gray-400">{r.bu}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Launch button */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          {resources.length} team members will be notified
        </div>
        <button onClick={onLaunch} disabled={launching}
          className={`text-sm font-semibold px-8 py-2.5 rounded-lg transition-all duration-200 shadow-sm cursor-pointer ${
            launching ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
          {launching ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Creating project...
            </span>
          ) : "Create project and notify team"}
        </button>
      </div>
    </div>
  );
}

// ── Main ──
const VIEWER_ROLES = [
  { id: "PM", label: "PM + IC", color: "bg-indigo-600 text-white", desc: "Cannot see cost rates or Step 4" },
  { id: "AC", label: "AC + PM + IC", color: "bg-amber-500 text-white", desc: "Sees financials on their Accounts" },
  { id: "BUL", label: "BUL + PM + IC", color: "bg-teal-600 text-white", desc: "Full financial access" },
];

export default function OnboardingWizard() {
  const [viewerRole, setViewerRole] = useState("BUL");
  const [step, setStep] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  const canSeeFinancials = viewerRole === "BUL" || viewerRole === "AC";
  const allSteps = [
    { id: "details", label: "Project details" },
    { id: "resources", label: "Add resources" },
    { id: "hours", label: "Planned hours" },
    ...(canSeeFinancials ? [{ id: "financial", label: "Financial setup" }] : []),
    { id: "review", label: "Review & launch" },
  ];

  const [project, setProject] = useState({ name: "", accountId: "", code: generateCode(""), startDate: "2026-05-01", endDate: "2026-08-21", description: "", contingency: 15 });
  const [resources, setResources] = useState([]);
  const [hours, setHours] = useState({});

  useEffect(() => {
    if (project.name && !project.code.startsWith(project.name.substring(0, 3).toUpperCase())) {
      setProject(p => ({ ...p, code: generateCode(p.name) }));
    }
  }, [project.name]);

  const weeks = (() => {
    if (project.startDate && project.endDate) {
      const diff = (new Date(project.endDate) - new Date(project.startDate)) / (1000 * 60 * 60 * 24 * 7);
      return Math.max(1, Math.min(52, Math.ceil(diff)));
    }
    return 12;
  })();

  const totalFee = resources.reduce((s, r, rIdx) => s + Object.values(hours[rIdx] || {}).reduce((ss, v) => ss + (Number(v) || 0), 0) * r.billRate, 0);
  const totalCost = resources.reduce((s, r, rIdx) => s + Object.values(hours[rIdx] || {}).reduce((ss, v) => ss + (Number(v) || 0), 0) * r.costRate, 0);
  const margin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;

  const stepValid = (idx) => {
    const stepId = allSteps[idx]?.id;
    if (stepId === "details") return project.name && project.accountId && project.startDate && project.endDate;
    if (stepId === "resources") return resources.length > 0;
    return true;
  };

  const handleLaunch = () => { setLaunching(true); setTimeout(() => { setLaunching(false); setLaunched(true); }, 1500); };

  const currentStepId = allSteps[step]?.id;

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />

      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="text-lg font-bold text-gray-800 tracking-tight">Quanta</div><span className="text-xs text-gray-300">|</span><span className="text-sm text-gray-400">New project</span></div>
          <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-xs font-semibold text-teal-600">SK</div><div className="text-sm text-gray-600">Sarah Kim</div></div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Role toggle */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Prototype: viewing as</div>
          <div className="flex items-center gap-2">
            {VIEWER_ROLES.map(r => (
              <button key={r.id} onClick={() => { setViewerRole(r.id); setStep(0); setLaunched(false); }}
                className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border ${
                  viewerRole === r.id ? r.color + " border-transparent" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                {r.label}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-2">
              {VIEWER_ROLES.find(r => r.id === viewerRole)?.desc}
            </span>
          </div>
        </div>

        {launched ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Project created</h2>
            <p className="text-sm text-gray-400 mb-1">{project.name} is now active</p>
            <p className="text-sm text-gray-400 mb-6">{resources.length} team members have been notified</p>
            <button onClick={() => { setLaunched(false); setStep(0); setProject({ name: "", accountId: "", code: generateCode(""), startDate: "2026-05-01", endDate: "2026-08-21", description: "", contingency: 15 }); setResources([]); setHours({}); }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer">
              Create another project
            </button>
          </div>
        ) : (
          <>
            <StepIndicator steps={allSteps} current={step} onStepClick={setStep} />

            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm mb-6">
              {currentStepId === "details" && <Step1 data={project} onChange={setProject} />}
              {currentStepId === "resources" && <Step2 resources={resources} onChange={setResources} viewerRole={viewerRole} />}
              {currentStepId === "hours" && <Step3 resources={resources} weeks={weeks} hours={hours} onChange={setHours} />}
              {currentStepId === "financial" && <Step4 data={project} resources={resources} hours={hours} onChange={setProject} />}
              {currentStepId === "review" && <Step5 project={project} resources={resources} hours={hours}
                financials={{ totalFee, totalCost, margin, contingency: project.contingency }} viewerRole={viewerRole}
                onLaunch={handleLaunch} launching={launching} />}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${step === 0 ? "text-gray-300" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"}`}>
                Back
              </button>
              {step < allSteps.length - 1 && (
                <button onClick={() => setStep(s => Math.min(allSteps.length - 1, s + 1))}
                  disabled={!stepValid(step)}
                  className={`text-sm font-semibold px-6 py-2 rounded-lg transition-all shadow-sm ${
                    stepValid(step) ? "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer" : "bg-gray-200 text-gray-400"}`}>
                  Continue
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
