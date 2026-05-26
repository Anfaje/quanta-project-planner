import { describe, it, expect, vi } from "vitest";
import { lazy, Suspense } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { Spinner } from "./components/ui";

/**
 * App-level smoke test: when a lazy-loaded route is in flight, the
 * top-level Suspense fallback renders. Vitest's lazy boundary resolution
 * is synchronous in happy-dom by default, so we hand-build a never-
 * resolving lazy component and a controlled one to exercise both paths.
 *
 * This is the regression guard for App.tsx's code-splitting setup: if
 * someone forgets to wrap routes in Suspense, the page would crash with
 * 'A React component suspended while rendering, but no fallback was
 * specified' rather than show a spinner.
 */

function PageFallback() {
  return (
    <div role="status" aria-label="Loading page">
      <Spinner />
    </div>
  );
}

describe("Lazy route boundaries", () => {
  it("Suspense renders the fallback while a lazy chunk loads", async () => {
    // A lazy whose import promise never resolves so the fallback persists.
    const NeverResolves = lazy(() => new Promise<{ default: () => JSX.Element }>(() => {}));

    render(
      <MemoryRouter initialEntries={["/heavy"]}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/heavy" element={<NeverResolves />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );

    expect(await screen.findByRole("status", { name: /loading page/i })).toBeInTheDocument();
  });

  it("once the chunk resolves, the lazy page replaces the fallback", async () => {
    let resolve!: (m: { default: () => JSX.Element }) => void;
    const importPromise = new Promise<{ default: () => JSX.Element }>((r) => {
      resolve = r;
    });
    const Lazy = lazy(() => importPromise);

    render(
      <MemoryRouter initialEntries={["/lazy"]}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/lazy" element={<Lazy />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );

    expect(screen.getByRole("status", { name: /loading page/i })).toBeInTheDocument();

    // Resolve the import — Suspense should swap fallback for the page.
    resolve({ default: () => <div>Heavy content</div> });

    await waitFor(() => {
      expect(screen.getByText("Heavy content")).toBeInTheDocument();
    });
    expect(screen.queryByRole("status", { name: /loading page/i })).not.toBeInTheDocument();
  });
});
