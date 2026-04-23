import { Routes, Route } from "react-router-dom";

function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Quanta</h1>
        </div>
        <p className="text-gray-400 text-sm mb-6">Project Estimates & Resource Tracking Platform</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-sm text-emerald-700 font-medium">Foundation ready — Drop 1 complete</span>
        </div>
        <p className="text-xs text-gray-300 mt-4">Auth + RBAC coming in Drop 2</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
