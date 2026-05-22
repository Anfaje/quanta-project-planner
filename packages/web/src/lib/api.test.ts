import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "./api";

/**
 * Tests for the api fetch wrapper.
 *
 * We stub global.fetch with vi.fn to control responses exactly. Each test
 * asserts both the request shape (url, method, headers, credentials,
 * serialized body) and the response handling (parsed JSON, ApiError on
 * non-2xx, text body for non-JSON, etc).
 */

describe("ApiError", () => {
  it("captures status, message, and details", () => {
    const err = new ApiError(403, "Forbidden", { detail: "domain" });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe("Forbidden");
    expect(err.details).toEqual({ detail: "domain" });
    expect(err.name).toBe("ApiError");
  });
});

describe("api fetch wrapper", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends GET with credentials:'include' and no body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const result = await api.get<{ ok: boolean }>("/api/me");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/me");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
  });

  it("sends POST with JSON content-type and serialized body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "mfa_required" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await api.post("/api/auth/login", { email: "a@b.com", password: "secret" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.com", password: "secret" });
  });

  it("throws ApiError with parsed details on JSON error response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Invalid email or password" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(api.post("/api/auth/login", {})).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await api.delete("/api/admin/domains/abc");
    expect(result).toBeUndefined();
  });

  it("falls back to 'HTTP <status>' when the error body has no 'error' field", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ unrelated: "shape" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(api.get("/api/whatever")).rejects.toMatchObject({
      status: 500,
      message: "HTTP 500",
    });
  });

  it("handles non-JSON response bodies (text/html) by returning the text", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const result = await api.get<string>("/api/something");
    expect(result).toBe("<html>oops</html>");
  });
});
