import { ReactNode, useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { QuantaLogo } from "./QuantaLogo";

/**
 * App shell — horizontal top nav, flat content container beneath. Persistent
 * across all authenticated routes.
 *
 * Nav items are filtered by the caller's role union: an IC-only user doesn't
 * see the Admin tab, etc. The server enforces the same rules; this is purely
 * UI hygiene.
 */

interface NavItem {
  label: string;
  to: string;
  show: (roles: string[]) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", show: () => true },
  { label: "Projects", to: "/projects", show: () => true },
  { label: "Admin", to: "/admin", show: (roles) => roles.includes("BUL") || roles.includes("AA") },
];

export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  if (!me) return null;

  const roleChips = me.roles.slice(0, 3); // keep the header tight
  const initials = me.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2">
              <QuantaLogo size="sm" />
            </button>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.filter((n) => n.show(me.roles)).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      isActive ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`User menu for ${me.name}`}
              className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <div aria-hidden="true" className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                {initials || "?"}
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className="text-xs font-medium text-gray-800">{me.name}</div>
                <div className="text-[10px] text-gray-400">{roleChips.join(" · ")}</div>
              </div>
            </button>

            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-800">{me.name}</div>
                  <div className="text-xs text-gray-500">{me.email}</div>
                  {me.primaryBu && (
                    <div className="text-xs text-gray-400 mt-1">{me.primaryBu.code} · {me.primaryBu.name}</div>
                  )}
                </div>
                <div className="px-4 py-2 border-b border-gray-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Roles</div>
                  <div className="flex flex-wrap gap-1">
                    {me.roles.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout().then(() => navigate("/login", { replace: true }));
                  }}
                  className="w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Page body ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
