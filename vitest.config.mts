/**
 * Vitest, for the convex-test suites ONLY.
 *
 * The repo's test runner is jest (`npm test` / `npm run test:coverage`) and that
 * does not change. `convex-test` — the in-process mock of the Convex backend
 * that the creation-job race tests need — is an ESM-only, Vite-native package:
 * it is published without a CJS build and it discovers function modules through
 * `import.meta.glob`. Under jest-expo it fails at the first `import` statement,
 * and the fix would be an edit to jest.config.js (transformIgnorePatterns) that
 * this wave is not allowed to make.
 *
 * So it gets its own runner and its own directory. `include` is pinned to
 * `__vitest__/`, which jest's `testMatch` (`**​/__tests__/**​/*.test.ts`) does not
 * reach, so neither runner ever sees the other's suites.
 *
 *   npm run test         → jest, everything under __tests__/
 *   npm run test:convex  → vitest, everything under __vitest__/
 */

import { defineConfig } from "vitest/config";

// Must be set before any test code runs, same as jest.config.js does it.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    include: ["__vitest__/**/*.test.ts"],
    environment: "node",
    // convex-test is ESM-only; inlining keeps Vite in charge of it rather than
    // handing it to Node's resolver.
    server: { deps: { inline: ["convex-test"] } },
  },
});
