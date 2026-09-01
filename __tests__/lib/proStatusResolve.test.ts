/**
 * The entitlement the take import runs on (OLD-127, spec §2.4 step 2).
 *
 * The rule this pins is the conservative one: an entitlement we could not
 * confirm stays `unknown`. Collapsing it to "free" here would delete a paying
 * subscriber's reminders on the server, which is the exact failure the
 * tri-state exists to prevent.
 */
const mockGetProStatusSnapshot = jest.fn();
const mockForceRefreshProStatus = jest.fn();

jest.mock("../../lib/purchases", () => ({
  __esModule: true,
  getProStatusSnapshot: (...args: unknown[]) => mockGetProStatusSnapshot(...args),
  forceRefreshProStatus: (...args: unknown[]) => mockForceRefreshProStatus(...args),
}));

import { resolveImportProStatus } from "../../lib/proStatusResolve";

beforeEach(() => {
  mockGetProStatusSnapshot.mockReset();
  mockForceRefreshProStatus.mockReset();
});

it("takes a confirmed answer from the cache and spends no round trip", async () => {
  for (const status of ["pro", "free"] as const) {
    mockGetProStatusSnapshot.mockReturnValue(status);
    await expect(resolveImportProStatus()).resolves.toBe(status);
  }
  expect(mockForceRefreshProStatus).not.toHaveBeenCalled();
});

it("spends exactly one forced refresh on an unresolved entitlement", async () => {
  mockGetProStatusSnapshot.mockReturnValue("unknown");
  mockForceRefreshProStatus.mockResolvedValue("pro");

  await expect(resolveImportProStatus()).resolves.toBe("pro");
  expect(mockForceRefreshProStatus).toHaveBeenCalledTimes(1);
});

it("stays unknown when the refresh comes back unresolved", async () => {
  mockGetProStatusSnapshot.mockReturnValue("unknown");
  mockForceRefreshProStatus.mockResolvedValue("unknown");

  await expect(resolveImportProStatus()).resolves.toBe("unknown");
});

it("stays unknown when the refresh cannot be made at all — never 'free'", async () => {
  mockGetProStatusSnapshot.mockReturnValue("unknown");
  mockForceRefreshProStatus.mockRejectedValue(new Error("offline"));

  await expect(resolveImportProStatus()).resolves.toBe("unknown");
});
