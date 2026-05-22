/**
 * Brand logo — lightning bolt glyph in an indigo square, with optional
 * wordmark. Used in auth pages (large) and the app shell (small).
 */

interface Props {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}

export function QuantaLogo({ size = "md", withWordmark = true }: Props) {
  const box =
    size === "lg" ? "w-10 h-10" : size === "md" ? "w-8 h-8" : "w-7 h-7";
  const icon =
    size === "lg" ? "w-6 h-6" : size === "md" ? "w-5 h-5" : "w-4 h-4";
  const wordmark =
    size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base";

  return (
    <div className="flex items-center gap-2" role={withWordmark ? undefined : "img"} aria-label={withWordmark ? undefined : "Quanta"}>
      <div className={`${box} bg-indigo-600 rounded-lg flex items-center justify-center`}>
        <svg
          aria-hidden="true"
          className={`${icon} text-white`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      {withWordmark && (
        <span className={`${wordmark} font-bold text-gray-800 tracking-tight`}>Quanta</span>
      )}
    </div>
  );
}
