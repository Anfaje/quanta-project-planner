import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Global test setup.
 *
 * - Imports @testing-library/jest-dom matchers (.toBeInTheDocument, etc.)
 *   directly onto Vitest's expect so we get them everywhere without per-file
 *   boilerplate.
 * - Runs RTL cleanup after each test to unmount and prevent state bleed
 *   between adjacent it() blocks.
 */

afterEach(() => {
  cleanup();
});
