import { useState, useEffect } from "react";

const WHITELISTED_DOMAINS = ["trifork.com", "trifork-na.com", "spantree.com"];

const INVITE_CONTEXT = {
  projectName: "Brand Refresh 2026",
  invitedBy: "Sarah Kim",
  role: "Designer",
  account: "Meridian Corp",
};

function getDomain(email) {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isDomainAllowed(email) {
  return WHITELISTED_DOMAINS.includes(getDomain(email));
}

// ── Logo ──
function QuantaLogo({ size = "lg" }) {
  const s = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <div className="flex items-center gap-2">
      <div className={`${size === "lg" ? "w-9 h-9" : "w-7 h-7"} bg-indigo-600 rounded-lg flex items-center justify-center`}>
        <svg className={`${size === "lg" ? "w-5 h-5" : "w-4 h-4"} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <span className={`${s} font-bold text-gray-800 tracking-tight`}>Quanta</span>
    </div>
  );
}

// ── Input ──
function FormInput({ label, type = "text", value, onChange, placeholder, error, hint, autoFocus }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all ${
          error ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-50" : "border-gray-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        }`} />
      {error && <div className="text-xs text-rose-500 mt-1 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" /></svg>
        {error}
      </div>}
      {hint && !error && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

// ── Screens ──

function LoginScreen({ onSwitch, onEmailLogin, hasInvite }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!isValidEmail(email)) { setError("Enter a valid email address"); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); onEmailLogin(email); }, 1000);
  };

  return (
    <div>
      {hasInvite && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">You've been invited</div>
          <div className="text-sm text-indigo-800 font-medium">{INVITE_CONTEXT.invitedBy} invited you to <span className="font-semibold">{INVITE_CONTEXT.projectName}</span> as {INVITE_CONTEXT.role}</div>
          <div className="text-xs text-indigo-500 mt-1">{INVITE_CONTEXT.account}</div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-800 mb-1 tracking-tight">Welcome back</h1>
      <p className="text-sm text-gray-400 mb-6">Sign in to your Quanta account</p>

      <FormInput label="Email" type="email" value={email} onChange={v => { setEmail(v); setError(""); }} placeholder="you@trifork.com" error={error} autoFocus />
      <FormInput label="Password" type="password" value={password} onChange={setPassword} placeholder="Enter your password" />

      <div className="flex items-center justify-between mb-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer" />
          <span className="text-xs text-gray-500">Remember me</span>
        </label>
        <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">Forgot password?</button>
      </div>

      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-60">
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <div className="mt-5 text-center">
        <span className="text-sm text-gray-400">No account yet? </span>
        <button onClick={onSwitch} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">Sign up</button>
      </div>
    </div>
  );
}

function SignupScreen({ onSwitch, onEmailSignup, hasInvite }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [domainChecked, setDomainChecked] = useState(false);
  const [preferredRoles, setPreferredRoles] = useState([]);

  const PROJECT_ROLES = ["PM", "Lead", "iOS Dev", "Android Dev", "Backend", "Full Stack", "3D Dev", "Designer", "UX Lead", "DevOps", "ML Engineer", "QA Lead", "Support"];

  const toggleRole = (role) => {
    setPreferredRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const validateEmail = (v) => {
    setEmail(v);
    setEmailError("");
    setDomainChecked(false);
    if (v && isValidEmail(v)) {
      setDomainChecked(true);
      if (!isDomainAllowed(v)) {
        setEmailError("This email domain is not authorised. Allowed: " + WHITELISTED_DOMAINS.join(", "));
      }
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (!isValidEmail(email)) { setEmailError("Enter a valid email address"); return; }
    if (!isDomainAllowed(email)) { setEmailError("This email domain is not authorised"); return; }
    if (password.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); onEmailSignup(email, name); }, 1200);
  };

  const domainOk = domainChecked && !emailError && isValidEmail(email);

  return (
    <div>
      {hasInvite && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">You've been invited</div>
          <div className="text-sm text-indigo-800 font-medium">{INVITE_CONTEXT.invitedBy} invited you to <span className="font-semibold">{INVITE_CONTEXT.projectName}</span> as {INVITE_CONTEXT.role}</div>
          <div className="text-xs text-indigo-500 mt-1">Sign up to join the project</div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-800 mb-1 tracking-tight">Create your account</h1>
      <p className="text-sm text-gray-400 mb-6">Available for authorised email domains</p>

      <FormInput label="Full name" value={name} onChange={setName} placeholder="Jane Doe" autoFocus />
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Work email</label>
        <div className="relative">
          <input type="email" value={email} onChange={e => validateEmail(e.target.value)} placeholder="you@trifork.com"
            className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all pr-10 ${
              emailError ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-50" :
              domainOk ? "border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50" :
              "border-gray-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
            }`} />
          {domainOk && (
            <div className="absolute right-3 top-2.5">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
          )}
          {emailError && (
            <div className="absolute right-3 top-2.5">
              <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
          )}
        </div>
        {emailError && <div className="text-xs text-rose-500 mt-1">{emailError}</div>}
        {domainOk && <div className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Domain verified
        </div>}
        {!domainChecked && !emailError && <div className="text-xs text-gray-400 mt-1">Must be from an authorised domain</div>}
      </div>

      <FormInput label="Password" type="password" value={password} onChange={v => { setPassword(v); setPasswordError(""); }}
        placeholder="At least 8 characters" error={passwordError} />

      {/* Project roles */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">What do you do? <span className="font-normal text-gray-400">(select all that apply)</span></label>
        <div className="flex flex-wrap gap-2">
          {PROJECT_ROLES.map(role => {
            const selected = preferredRoles.includes(role);
            return (
              <button key={role} onClick={() => toggleRole(role)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                  selected ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}>
                {selected && <svg className="w-3 h-3 inline mr-1 -mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                {role}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-gray-400 mt-1.5">Helps us match you to the right projects</div>
      </div>

      <button onClick={handleSubmit} disabled={loading || !name || !domainOk || password.length < 8}
        className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-default">
        {loading ? "Creating account..." : "Create account"}
      </button>

      <div className="mt-3 text-center text-xs text-gray-400">
        You'll start as an Individual Contributor. An admin can grant additional permissions.
      </div>

      <div className="mt-5 text-center">
        <span className="text-sm text-gray-400">Already have an account? </span>
        <button onClick={onSwitch} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">Sign in</button>
      </div>
    </div>
  );
}

function MFAScreen({ onVerify, email }) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);

  const handleChange = (idx, val) => {
    if (val.length > 1) val = val.slice(-1);
    if (val && !/^\d$/.test(val)) return;
    const next = [...code];
    next[idx] = val;
    setCode(next);
    if (val && idx < 5) {
      const nextInput = document.getElementById("mfa-" + (idx + 1));
      if (nextInput) nextInput.focus();
    }
    if (next.every(c => c !== "")) {
      setLoading(true);
      setTimeout(() => onVerify(), 800);
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      const prev = document.getElementById("mfa-" + (idx - 1));
      if (prev) prev.focus();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1 tracking-tight">Two-factor authentication</h1>
      <p className="text-sm text-gray-400 mb-6">Enter the 6-digit code from your authenticator app</p>

      <div className="flex items-center justify-center gap-2 mb-6">
        {code.map((c, i) => (
          <input key={i} id={"mfa-" + i} type="text" inputMode="numeric" maxLength={1}
            value={c} onChange={e => handleChange(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)}
            autoFocus={i === 0}
            className={`w-11 h-13 text-center text-lg font-bold border rounded-lg outline-none transition-all ${
              c ? "border-indigo-300 bg-indigo-50/50 text-indigo-700" : "border-gray-200 text-gray-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
            }`} />
        ))}
      </div>

      {loading && (
        <div className="text-center text-sm text-indigo-600 font-medium flex items-center justify-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Verifying...
        </div>
      )}

      <div className="mt-6 text-center text-xs text-gray-400">
        Signing in as <span className="font-medium text-gray-600">{email}</span>
      </div>
      <div className="mt-2 text-center">
        <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">Use recovery code instead</button>
      </div>
    </div>
  );
}

function WelcomeScreen({ name, hasInvite }) {
  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2 tracking-tight">Welcome to Quanta{name ? `, ${name.split(" ")[0]}` : ""}</h1>

      {hasInvite ? (
        <div>
          <p className="text-sm text-gray-400 mb-4">You've been added to <span className="font-medium text-gray-600">{INVITE_CONTEXT.projectName}</span> as {INVITE_CONTEXT.role}</p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg mb-6">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">IC</span>
            <span className="text-xs text-gray-500">Your starting role · An admin can grant additional permissions</span>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-400 mb-4">Your account has been created</p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg mb-6">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">IC</span>
            <span className="text-xs text-gray-500">Individual Contributor · An admin can grant additional roles</span>
          </div>
        </div>
      )}

      <button className="px-8 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-all cursor-pointer shadow-sm">
        {hasInvite ? "Go to project" : "Go to dashboard"}
      </button>
    </div>
  );
}

// ── Main ──
const ENTRY_MODES = [
  { id: "direct", label: "Direct visit", desc: "User goes straight to quanta.app" },
  { id: "invite", label: "Project invite link", desc: "User clicks an invite email link" },
];

export default function AuthFlow() {
  const [entryMode, setEntryMode] = useState("direct");
  const [screen, setScreen] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const hasInvite = entryMode === "invite";

  const reset = (mode) => { setEntryMode(mode); setScreen("login"); setEmail(""); setName(""); };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />

      {/* Prototype controls */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto px-6 py-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Prototype: entry point</div>
          <div className="flex items-center gap-2">
            {ENTRY_MODES.map(m => (
              <button key={m.id} onClick={() => reset(m.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  entryMode === m.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}>
                {m.label}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-2">{ENTRY_MODES.find(m => m.id === entryMode)?.desc}</span>
          </div>
        </div>
      </div>

      {/* Auth card */}
      <div className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <QuantaLogo />
          </div>

          {/* Card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
            {screen === "login" && (
              <LoginScreen
                hasInvite={hasInvite}
                onSwitch={() => setScreen("signup")}
                onEmailLogin={(e) => { setEmail(e); setScreen("mfa"); }}
              />
            )}
            {screen === "signup" && (
              <SignupScreen
                hasInvite={hasInvite}
                onSwitch={() => setScreen("login")}
                onEmailSignup={(e, n) => { setEmail(e); setName(n); setScreen("mfa-setup"); }}
              />
            )}
            {screen === "mfa" && (
              <MFAScreen email={email} onVerify={() => { setName("Jane Doe"); setScreen("welcome"); }} />
            )}
            {screen === "mfa-setup" && (
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-1 tracking-tight">Set up two-factor auth</h1>
                <p className="text-sm text-gray-400 mb-6">Scan this QR code with your authenticator app</p>
                <div className="flex justify-center mb-6">
                  <div className="w-40 h-40 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center">
                    <div className="grid grid-cols-8 gap-0.5 w-28 h-28">
                      {Array.from({ length: 64 }, (_, i) => (
                        <div key={i} className={`w-full aspect-square rounded-sm ${Math.random() > 0.45 ? "bg-gray-800" : "bg-white"}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-center mb-4">
                  <div className="text-xs text-gray-400 mb-1">Or enter this key manually:</div>
                  <code className="text-sm font-mono bg-gray-50 px-3 py-1 rounded-md text-gray-600 border border-gray-200">JBSW Y3DP EHPK 3PXP</code>
                </div>
                <MFAScreen email={email} onVerify={() => setScreen("welcome")} />
              </div>
            )}
            {screen === "welcome" && (
              <WelcomeScreen name={name} hasInvite={hasInvite} />
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-300">
            Authorised domains: {WHITELISTED_DOMAINS.join(", ")}
          </div>
          <div className="mt-1 text-center text-xs text-gray-300">
            Additional domains can be configured by an Application Admin
          </div>
        </div>
      </div>
    </div>
  );
}
