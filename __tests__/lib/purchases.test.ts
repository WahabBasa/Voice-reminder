/**
 * initializePurchases: Apple Ads attribution (AdServices token collection) is
 * switched on once, on iOS only, and only after configure succeeded. A failure
 * from it is swallowed so it can never undo a good configure.
 */
import { Platform } from "react-native";

const mockConfigure = jest.fn();
const mockEnableAdServices = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockAddListener = jest.fn();

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    enableAdServicesAttributionTokenCollection: (...args: unknown[]) =>
      mockEnableAdServices(...args),
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    addCustomerInfoUpdateListener: (...args: unknown[]) => mockAddListener(...args),
    setLogLevel: jest.fn(),
  },
  LOG_LEVEL: { WARN: "WARN" },
  PURCHASES_ERROR_CODE: {},
}));

type PurchasesModule = typeof import("../../lib/purchases");

const originalOS = Platform.OS;

function setOS(os: string) {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}

/** Fresh module per test: `configured` is module state. */
function loadPurchases(): PurchasesModule {
  let mod!: PurchasesModule;
  jest.isolateModules(() => {
    mod = jest.requireActual("../../lib/purchases");
  });
  return mod;
}

beforeEach(() => {
  mockConfigure.mockReset().mockResolvedValue(undefined);
  mockEnableAdServices.mockReset().mockResolvedValue(undefined);
  mockGetCustomerInfo.mockReset().mockResolvedValue({
    entitlements: { active: {}, all: {} },
  });
  mockAddListener.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  setOS(originalOS);
  jest.restoreAllMocks();
});

it("enables AdServices token collection once on iOS, after configure", async () => {
  setOS("ios");
  const purchases = loadPurchases();

  await purchases.initializePurchases();

  expect(mockConfigure).toHaveBeenCalledTimes(1);
  expect(mockEnableAdServices).toHaveBeenCalledTimes(1);
  expect(mockConfigure.mock.invocationCallOrder[0]).toBeLessThan(
    mockEnableAdServices.mock.invocationCallOrder[0]
  );

  // A second init is a no-op, so the call stays at one.
  await purchases.initializePurchases();
  expect(mockEnableAdServices).toHaveBeenCalledTimes(1);
});

it("skips it on Android", async () => {
  setOS("android");
  const purchases = loadPurchases();

  await purchases.initializePurchases();

  expect(mockConfigure).toHaveBeenCalledTimes(1);
  expect(mockEnableAdServices).not.toHaveBeenCalled();
  expect(purchases.isPurchasesConfigured()).toBe(true);
});

it("skips it when configure fails", async () => {
  setOS("ios");
  mockConfigure.mockRejectedValue(new Error("bad key"));
  const purchases = loadPurchases();

  await expect(purchases.initializePurchases()).resolves.toBeUndefined();

  expect(mockEnableAdServices).not.toHaveBeenCalled();
  expect(purchases.isPurchasesConfigured()).toBe(false);
});

it("swallows a rejection and still finishes initializing", async () => {
  setOS("ios");
  mockEnableAdServices.mockRejectedValue(new Error("not configured"));
  const purchases = loadPurchases();

  await expect(purchases.initializePurchases()).resolves.toBeUndefined();

  expect(purchases.isPurchasesConfigured()).toBe(true);
  expect(mockAddListener).toHaveBeenCalledTimes(1);
  expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);
  expect(purchases.getProStatusSnapshot()).toBe("free");
});
