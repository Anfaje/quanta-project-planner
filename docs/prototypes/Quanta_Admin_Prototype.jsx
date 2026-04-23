import { useState, useEffect } from "react";

// ── Mock data ──
const INITIAL_USERS = [
  { id: "u1", name: "Maya Chen", email: "maya@trifork.com", roles: ["IC"], bu: "US-ORD-OWLS", projects: 3, active: true, projectRoles: ["iOS Dev"] },
  { id: "u2", name: "Jonas Berg", email: "jonas@trifork.com", roles: ["IC", "PM"], bu: "DK-AAR-PANDA", projects: 4, active: true, projectRoles: ["Designer"] },
  { id: "u3", name: "Alex Rivera", email: "alex@trifork-na.com", roles: ["IC"], bu: "US-ORD-OWLS", projects: 5, active: true, projectRoles: ["Backend"] },
  { id: "u4", name: "Priya Sharma", email: "priya@trifork.com", roles: ["IC"], bu: "US-ORD-OWLS", projects: 2, active: true, projectRoles: ["3D Dev"] },
  { id: "u5", name: "Lena Kowalski", email: "lena@trifork.com", roles: ["IC", "PM", "AC"], bu: "DK-AAR-PANDA", projects: 3, active: true, projectRoles: ["PM"], managedAccounts: ["a1"] },
  { id: "u6", name: "Tom Nguyen", email: "tom@spantree.com", roles: ["IC", "PM"], bu: "US-ORD-OWLS", projects: 2, active: true, projectRoles: ["Full Stack"] },
  { id: "u7", name: "Sara Olsen", email: "sara@trifork.com", roles: ["IC", "PM", "BUL"], bu: "US-ORD-OWLS", projects: 6, active: true, projectRoles: ["UX Lead"], financialAccess: true },
  { id: "u8", name: "Diego Ruiz", email: "diego@trifork-na.com", roles: ["IC"], bu: "US-ORD-OWLS", projects: 2, active: true, projectRoles: ["DevOps"] },
  { id: "u9", name: "Emma Walsh", email: "emma@spantree.com", roles: ["IC"], bu: "US-CA-SE", projects: 1, active: true, projectRoles: ["iOS Dev"] },
  { id: "u10", name: "Kai Tanaka", email: "kai@trifork.com", roles: ["IC", "PM"], bu: "US-CA-SE", projects: 2, active: true, projectRoles: ["ML Engineer"] },
  { id: "u11", name: "Noor Patel", email: "noor@trifork.com", roles: ["IC"], bu: "EU-BER-FOXES", projects: 1, active: true, projectRoles: ["QA Lead"] },
  { id: "u12", name: "Marco Bianchi", email: "marco@trifork.com", roles: ["IC"], bu: "EU-BER-FOXES", projects: 1, active: false, projectRoles: ["Backend"] },
  { id: "u13", name: "Sarah Kim", email: "sarah@trifork.com", roles: ["AA", "IC"], bu: "US-ORD-OWLS", projects: 1, active: true, projectRoles: ["PM"], financialAccess: true },
];

const INITIAL_BUS = [
  { id: "bu1", code: "US-ORD-OWLS", name: "Chicago Owls", active: true },
  { id: "bu2", code: "DK-AAR-PANDA", name: "Aarhus Panda", active: true },
  { id: "bu3", code: "US-CA-SE", name: "California SE", active: true },
  { id: "bu4", code: "EU-BER-FOXES", name: "Berlin Foxes", active: true },
];

const INITIAL_ACCOUNTS = [
  { id: "a1", name: "Meridian Corp", code: "MER", active: true, managers: ["u5"] },
  { id: "a2", name: "Pinnacle Tech", code: "PIN", active: true, managers: [] },
  { id: "a3", name: "Lumen Group", code: "LUM", active: true, managers: [] },
  { id: "a4", name: "Apex Industries", code: "APX", active: false, managers: [] },
];

const INITIAL_DOMAINS = ["trifork.com", "trifork-na.com", "spantree.com"];

const ALL_ROLES = ["IC", "PM", "AC", "BUL", "AA"];

// ── Helpers ──
function RoleBadge({ role, size = "sm" }) {
  const colors = {
    IC: "bg-gray-100 text-gray-600",
    PM: "bg-indigo-50 text-indigo-600",
    AC: "bg-amber-50 text-amber-600",
    BUL: "bg-teal-50 text-teal-600",
    AA: "bg-violet-50 text-violet-600",
  };
  return <span className={`${size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-1"} font-semibold rounded ${colors[role] || "bg-gray-100 text-gray-500"}`}>{role}</span>;
}

function StatusDot({ active }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${active ? "bg-emerald-400" : "bg-gray-300"}`} />;
}

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-gray-100 rounded-xl shadow-sm ${className}`}>{children}</div>;
}

function TabButton({ active, children, onClick, count }) {
  return (
    <button onClick={onClick}
      className={`text-sm font-medium px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
        active ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"
      }`}>
      {children}
      {count !== undefined && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400"}`}>{count}</span>}
    </button>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" />
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="text-center py-12">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm text-gray-500 font-medium">{title}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

// ── User Detail Panel ──
function UserDetailPanel({ user, bus, accounts, onUpdate, onClose }) {
  const [roles, setRoles] = useState([...user.roles]);
  const [bu, setBu] = useState(user.bu);
  const [financialAccess, setFinancialAccess] = useState(user.financialAccess || false);
  const [managedAccounts, setManagedAccounts] = useState(user.managedAccounts || []);
  const [saved, setSaved] = useState(false);

  const toggleRole = (role) => {
    setRoles(prev => {
      const next = prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role];
      return next.length === 0 ? ["IC"] : next;
    });
    setSaved(false);
  };

  const toggleAccount = (accountId) => {
    setManagedAccounts(prev => prev.includes(accountId) ? prev.filter(a => a !== accountId) : [...prev, accountId]);
    setSaved(false);
  };

  const save = () => {
    onUpdate({ ...user, roles, bu, financialAccess, managedAccounts });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasAC = roles.includes("AC");
  const hasAA = roles.includes("AA");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.15)" }}>
      <div className="w-full max-w-md bg-white shadow-xl border-l border-gray-200 overflow-y-auto"
        style={{ animation: "slideIn 0.2s ease-out" }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-base font-semibold text-gray-800">{user.name}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusDot active={user.active} />
              <span className="text-sm font-medium text-gray-700">{user.active ? "Active" : "Deactivated"}</span>
            </div>
            <button className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              user.active ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            }`}>
              {user.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>

          {/* Primary BU */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Primary Business Unit</label>
            <select value={bu} onChange={e => { setBu(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300 bg-white cursor-pointer">
              {bus.filter(b => b.active).map(b => <option key={b.id} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </div>

          {/* Project roles */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Project roles</label>
            <div className="flex flex-wrap gap-1.5">
              {(user.projectRoles || []).map(r => (
                <span key={r} className="text-xs font-medium px-2 py-1 rounded-md bg-gray-100 text-gray-600">{r}</span>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">Set by the user during signup. Editable in their profile.</div>
          </div>

          {/* Application roles */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Application roles</label>
            <p className="text-xs text-gray-400 mb-3">Permissions are additive. The user gets the union of all selected roles.</p>
            <div className="grid gap-2">
              {ALL_ROLES.map(role => {
                const selected = roles.includes(role);
                const descriptions = {
                  IC: "Log own hours on assigned projects",
                  PM: "Create projects, manage team hours, view bill rates",
                  AC: "Full financials on assigned Accounts, crosses BU boundaries",
                  BUL: "Full financials and admin for their primary BU",
                  AA: "Platform-wide user and config management",
                };
                return (
                  <button key={role} onClick={() => toggleRole(role)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                      selected ? "border-indigo-200 bg-indigo-50/70" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        selected ? "border-indigo-600 bg-indigo-600" : "border-gray-300"
                      }`}>
                        {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={role} />
                          <span className={`text-xs ${selected ? "text-gray-700" : "text-gray-400"}`}>{descriptions[role]}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-xs text-gray-400">
              Effective: {roles.sort().map(r => <RoleBadge key={r} role={r} />)}
            </div>
          </div>

          {/* AA financial flag */}
          {hasAA && (
            <div className="p-3 bg-violet-50 rounded-lg border border-violet-100">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-violet-700">Financial data access</div>
                  <div className="text-xs text-violet-500">AA role does not include financials by default</div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-all relative cursor-pointer ${financialAccess ? "bg-violet-600" : "bg-gray-300"}`}
                  onClick={() => { setFinancialAccess(!financialAccess); setSaved(false); }}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${financialAccess ? "left-4" : "left-0.5"}`} />
                </div>
              </label>
            </div>
          )}

          {/* Managed accounts (AC role) */}
          {hasAC && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Managed Accounts</label>
              <p className="text-xs text-gray-400 mb-3">AC role grants financial access on these Accounts. Projects on selected Accounts are visible regardless of BU.</p>
              <div className="grid gap-1.5">
                {accounts.filter(a => a.active).map(account => {
                  const selected = managedAccounts.includes(account.id);
                  return (
                    <button key={account.id} onClick={() => toggleAccount(account.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                        selected ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          selected ? "border-amber-500 bg-amber-500" : "border-gray-300"
                        }`}>
                          {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className={`text-sm font-medium ${selected ? "text-amber-700" : "text-gray-700"}`}>{account.name}</span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">{account.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-gray-400 space-y-1 pt-2 border-t border-gray-100">
            <div>Active projects: {user.projects}</div>
            <div>Member since: Jan 2026</div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
          <button onClick={save}
            className={`text-sm font-semibold px-6 py-2 rounded-lg transition-all cursor-pointer shadow-sm ${
              saved ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}>
            {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ──
function UsersTab({ users, bus, accounts, onUpdateUser }) {
  const [search, setSearch] = useState("");
  const [filterBU, setFilterBU] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterActive, setFilterActive] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  const filtered = users.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterBU && u.bu !== filterBU) return false;
    if (filterRole && !u.roles.includes(filterRole)) return false;
    if (filterActive === "active" && !u.active) return false;
    if (filterActive === "inactive" && u.active) return false;
    return true;
  });

  const roleDistribution = ALL_ROLES.map(r => ({ role: r, count: users.filter(u => u.roles.includes(r) && u.active).length }));

  return (
    <div>
      {/* Stats row */}
      <div className="flex items-center gap-3 mb-5">
        {roleDistribution.map(({ role, count }) => (
          <div key={role} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded-lg shadow-sm">
            <RoleBadge role={role} />
            <span className="text-sm font-semibold text-gray-700">{count}</span>
          </div>
        ))}
        <div className="flex-1" />
        <div className="text-xs text-gray-400">{users.filter(u => u.active).length} active · {users.filter(u => !u.active).length} inactive</div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="Search users..." /></div>
        <select value={filterBU} onChange={e => setFilterBU(e.target.value)}
          className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none bg-white cursor-pointer">
          <option value="">All BUs</option>
          {bus.filter(b => b.active).map(b => <option key={b.id} value={b.code}>{b.code}</option>)}
        </select>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none bg-white cursor-pointer">
          <option value="">All roles</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)}
          className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none bg-white cursor-pointer">
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={() => setShowInvite(!showInvite)}
          className="text-xs font-semibold px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer shadow-sm whitespace-nowrap">
          Invite user
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <Card className="p-4 mb-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Invite new user</div>
          <div className="grid grid-cols-4 gap-3">
            <input placeholder="Email address" className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
            <select className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none bg-white cursor-pointer">
              {bus.filter(b => b.active).map(b => <option key={b.id}>{b.code}</option>)}
            </select>
            <button className="text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-all">
              Send invite
            </button>
          </div>
          <div className="text-xs text-gray-400 mt-2">New users start with IC role. You can assign additional roles after they sign up.</div>
        </Card>
      )}

      {/* User table */}
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">BU</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Roles</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Skills</th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Projects</th>
              <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="py-2.5 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><EmptyState icon="🔍" title="No matching users" sub="Try adjusting your filters" /></td></tr>
            ) : filtered.map((u, i) => (
              <tr key={u.id} className={`border-b border-gray-50 last:border-0 hover:bg-indigo-50/30 transition-colors cursor-pointer ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}
                onClick={() => setSelectedUser(u)}>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600 flex-shrink-0">
                      {u.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <div className="font-medium text-gray-700">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-500">{u.bu}</td>
                <td className="py-2.5 px-3">
                  <div className="flex flex-wrap gap-1">{u.roles.map(r => <RoleBadge key={r} role={r} />)}</div>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex flex-wrap gap-1">{(u.projectRoles || []).map(r => <span key={r} className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{r}</span>)}</div>
                </td>
                <td className="py-2.5 px-3 text-right text-gray-600">{u.projects}</td>
                <td className="py-2.5 px-3 text-center"><StatusDot active={u.active} /></td>
                <td className="py-2.5 px-3">
                  <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selectedUser && (
        <UserDetailPanel user={selectedUser} bus={bus} accounts={accounts}
          onUpdate={(updated) => { onUpdateUser(updated); setSelectedUser(updated); }}
          onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}

// ── Business Units Tab ──
function BusinessUnitsTab({ bus, users, onUpdateBUs }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const addBU = () => {
    if (newCode && newName) {
      onUpdateBUs([...bus, { id: "bu" + Date.now(), code: newCode, name: newName, active: true }]);
      setNewCode(""); setNewName(""); setShowAdd(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-400">{bus.filter(b => b.active).length} active · {bus.filter(b => !b.active).length} inactive</div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-xs font-semibold px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer shadow-sm">
          Add Business Unit
        </button>
      </div>

      {showAdd && (
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-3 gap-3">
            <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Code (e.g. US-NYC-HAWKS)"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Display name"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
            <button onClick={addBU} disabled={!newCode || !newName}
              className="text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-all disabled:opacity-40">
              Create
            </button>
          </div>
        </Card>
      )}

      <div className="grid gap-3">
        {bus.map(b => {
          const buUsers = users.filter(u => u.bu === b.code && u.active);
          const buProjects = buUsers.reduce((s, u) => s + u.projects, 0);
          const bul = buUsers.find(u => u.roles.includes("BUL"));
          return (
            <Card key={b.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot active={b.active} />
                  <div>
                    <div className="text-sm font-semibold text-gray-700">{b.code}</div>
                    <div className="text-xs text-gray-400">{b.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Users</div>
                    <div className="text-sm font-semibold text-gray-700">{buUsers.length}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">BUL</div>
                    <div className="text-sm font-medium text-gray-700">{bul ? bul.name : <span className="text-amber-500">Unassigned</span>}</div>
                  </div>
                  <button className={`text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                    b.active ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  }`}>
                    {b.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Accounts Tab ──
function AccountsTab({ accounts, users, onUpdateAccounts }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const addAccount = () => {
    if (newName && newCode) {
      onUpdateAccounts([...accounts, { id: "a" + Date.now(), name: newName, code: newCode.toUpperCase(), active: true, managers: [] }]);
      setNewName(""); setNewCode(""); setShowAdd(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-400">{accounts.filter(a => a.active).length} active · {accounts.filter(a => !a.active).length} inactive</div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-xs font-semibold px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer shadow-sm">
          Add Account
        </button>
      </div>

      {showAdd && (
        <Card className="p-4 mb-4">
          <div className="grid grid-cols-3 gap-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Account name"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
            <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Code (e.g. APX)"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300" />
            <button onClick={addAccount} disabled={!newName || !newCode}
              className="text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-all disabled:opacity-40">
              Create
            </button>
          </div>
        </Card>
      )}

      <div className="grid gap-3">
        {accounts.map(a => {
          const managers = users.filter(u => (a.managers || []).includes(u.id));
          return (
            <Card key={a.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot active={a.active} />
                  <div>
                    <div className="text-sm font-semibold text-gray-700">{a.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{a.code}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Account Managers</div>
                    <div className="flex items-center gap-1.5 justify-end mt-0.5">
                      {managers.length > 0 ? managers.map(m => (
                        <span key={m.id} className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{m.name.split(" ")[0]}</span>
                      )) : <span className="text-xs text-amber-500">None assigned</span>}
                    </div>
                  </div>
                  <button className={`text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                    a.active ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  }`}>
                    {a.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Domains Tab ──
function DomainsTab({ domains, onUpdateDomains }) {
  const [newDomain, setNewDomain] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);

  const addDomain = () => {
    const d = newDomain.toLowerCase().trim();
    if (d && !domains.includes(d) && d.includes(".")) {
      onUpdateDomains([...domains, d]);
      setNewDomain("");
    }
  };

  const removeDomain = (domain) => {
    onUpdateDomains(domains.filter(d => d !== domain));
    setConfirmRemove(null);
  };

  return (
    <div>
      <p className="text-sm text-gray-400 mb-5">Only users with email addresses on these domains can sign up. Everyone else is blocked at registration.</p>

      {/* Add form */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-2 text-sm text-gray-300">@</span>
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addDomain()}
            placeholder="newdomain.com"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" />
        </div>
        <button onClick={addDomain} disabled={!newDomain.includes(".")}
          className="text-xs font-semibold px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer shadow-sm disabled:opacity-40">
          Add domain
        </button>
      </div>

      {/* Domain list */}
      <div className="grid gap-2">
        {domains.map(d => (
          <Card key={d} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-gray-700">@{d}</span>
                <span className="text-xs text-gray-400">
                  ({INITIAL_USERS.filter(u => u.email.endsWith("@" + d) && u.active).length} active users)
                </span>
              </div>
              {confirmRemove === d ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-500">Remove this domain?</span>
                  <button onClick={() => removeDomain(d)} className="text-xs font-semibold px-2 py-1 bg-rose-500 text-white rounded cursor-pointer">Yes</button>
                  <button onClick={() => setConfirmRemove(null)} className="text-xs font-medium px-2 py-1 border border-gray-200 rounded text-gray-500 cursor-pointer">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmRemove(d)}
                  className="text-xs text-gray-400 hover:text-rose-500 cursor-pointer transition-colors">
                  Remove
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-2">
        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        <div className="text-xs text-amber-700">Removing a domain does not deactivate existing users on that domain. They can still log in until individually deactivated.</div>
      </div>
    </div>
  );
}

// ── Main ──
export default function AdminConsole() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState(INITIAL_USERS);
  const [bus, setBUs] = useState(INITIAL_BUS);
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [domains, setDomains] = useState(INITIAL_DOMAINS);

  const updateUser = (updated) => setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold text-gray-800 tracking-tight">Quanta</div>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-sm text-gray-400">Admin</span>
            <RoleBadge role="AA" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-semibold text-violet-600">SK</div>
            <div className="text-sm text-gray-600">Sarah Kim</div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <TabButton active={tab === "users"} onClick={() => setTab("users")} count={users.length}>Users</TabButton>
          <TabButton active={tab === "bus"} onClick={() => setTab("bus")} count={bus.length}>Business Units</TabButton>
          <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} count={accounts.length}>Accounts</TabButton>
          <TabButton active={tab === "domains"} onClick={() => setTab("domains")} count={domains.length}>Email domains</TabButton>
        </div>

        {/* Tab content */}
        {tab === "users" && <UsersTab users={users} bus={bus} accounts={accounts} onUpdateUser={updateUser} />}
        {tab === "bus" && <BusinessUnitsTab bus={bus} users={users} onUpdateBUs={setBUs} />}
        {tab === "accounts" && <AccountsTab accounts={accounts} users={users} onUpdateAccounts={setAccounts} />}
        {tab === "domains" && <DomainsTab domains={domains} onUpdateDomains={setDomains} />}
      </div>
    </div>
  );
}
