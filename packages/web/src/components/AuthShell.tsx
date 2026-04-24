import { ReactNode } from "react";
import { QuantaLogo } from "./QuantaLogo";

/**
 * Wrapper used by every auth page. Centers a max-w-md card with the logo
 * above it and keeps vertical rhythm consistent across login, MFA, signup,
 * and invite-accept.
 */

export function AuthShell({
  children,
  banner,
}: {
  children: ReactNode;
  /** Optional ribbon above the card — used for invite context. */
  banner?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <QuantaLogo size="lg" />
        </div>
        {banner}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {children}
        </div>
        <div className="text-center mt-6 text-xs text-gray-400">
          Quanta · Project Estimates &amp; Resource Tracking
        </div>
      </div>
    </div>
  );
}
