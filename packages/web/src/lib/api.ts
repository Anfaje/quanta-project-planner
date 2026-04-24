/**
 * API client — thin fetch wrapper with:
 *   - credentials: "include" so the session cookie is sent
 *   - JSON body serialization
 *   - Structured ApiError with status + parsed details
 *   - No base URL needed (Vite dev server proxies /api → :4000,
 *     and prod bundles are served behind the API on the same origin).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Don't parse the response as JSON (for file downloads). */
  raw?: boolean;
  signal?: AbortSignal;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (opts.raw) {
    if (!res.ok) throw await toApiError(res);
    return res as unknown as T;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => undefined) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && payload && typeof payload === "object" && "error" in (payload as any)
        ? String((payload as any).error)
        : undefined) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => undefined)
    : undefined;
  const message =
    payload && typeof payload === "object" && "error" in payload
      ? String((payload as any).error)
      : `HTTP ${res.status}`;
  return new ApiError(res.status, message, payload);
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  /**
   * Trigger a file download by navigating to a GET endpoint. The browser
   * handles Content-Disposition, so we don't need to read the bytes.
   */
  download: (path: string) => {
    // A plain anchor click is more reliable than window.open for cookie flows.
    const a = document.createElement("a");
    a.href = path;
    a.download = ""; // let server set filename via header
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};
