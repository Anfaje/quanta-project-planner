import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage, MfaVerifyPage } from "./LoginPage";
import { renderWithProviders } from "../test/render";

// Mock the api module — the LoginPage calls api.post("/api/auth/login").
// We don't want a real fetch; we want full control over the resolved
// payload so we can exercise both the mfa_required and mfa_setup_required
// branches.
vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      download: vi.fn(),
    },
  };
});

import { api, ApiError } from "../lib/api";

// react-router's useNavigate is mocked so we can assert on the destination
// without actually mounting the target page in our memory router.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// AuthContext is mocked so useAuth/useMe don't require an AuthProvider
// in tests. Pages just see a stub state.
const refreshMock = vi.fn();
const logoutMock = vi.fn();
vi.mock("../context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    me: null,
    isLoading: false,
    refresh: refreshMock,
    logout: logoutMock,
  }),
  useMe: () => {
    throw new Error("useMe should not be called in auth-page tests");
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("on successful password submit, navigates to /login/mfa when MFA is already set up", async () => {
    (api.post as any).mockResolvedValueOnce({ status: "mfa_required" });
    renderWithProviders(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "ic@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login/mfa", expect.objectContaining({}));
    });
    // The api was called with the form values.
    expect(api.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "ic@example.com",
      password: "hunter2hunter2",
    });
  });

  it("on mfa_setup_required, navigates to /login/mfa-setup passing the QR payload through state", async () => {
    (api.post as any).mockResolvedValueOnce({
      status: "mfa_setup_required",
      mfaSetup: { qrUri: "otpauth://totp/...", manualKey: "ABCD1234" },
    });
    renderWithProviders(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "verylongpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/login/mfa-setup",
        expect.objectContaining({
          state: expect.objectContaining({
            mfaSetup: expect.objectContaining({ qrUri: expect.any(String), manualKey: "ABCD1234" }),
          }),
        })
      );
    });
  });

  it("displays the server's error message on a failed login", async () => {
    (api.post as any).mockRejectedValueOnce(
      new ApiError(401, "Invalid email or password", { error: "Invalid email or password" })
    );
    renderWithProviders(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "wrong@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpassword!!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("MfaVerifyPage", () => {
  it("strips non-digits and caps to 6 characters", async () => {
    renderWithProviders(<MfaVerifyPage />);
    const input = screen.getByLabelText(/verification code/i) as HTMLInputElement;

    await userEvent.type(input, "12abc3456789");
    // Stripped to digits, capped to 6.
    expect(input.value).toBe("123456");
  });

  it("rejects sub-6-digit submissions without calling the API", async () => {
    renderWithProviders(<MfaVerifyPage />);
    await userEvent.type(screen.getByLabelText(/verification code/i), "123");
    await userEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    expect(await screen.findByText(/code must be 6 digits/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
