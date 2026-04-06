// TZ=UTC is set in jest.config.js (before Node initializes timezone)

// Fail tests on unexpected console.error (catches real bugs)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Allow known noisy library warnings
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("Reanimated") ||
      msg.includes("RevenueCat") ||
      msg.includes("NativeModule") ||
      msg.startsWith("[Schedule]") ||
      msg.startsWith("[VR Store]") ||
      msg.startsWith("[VR]")
    ) {
      return;
    }
    originalError.call(console, ...args);
    throw new Error(`Unexpected console.error: ${args[0]}`);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Suppress known noisy warnings from libraries
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    // Suppress expected defensive warnings from model code under test
    if (msg.startsWith("[VR]")) return;
    if (msg.includes("Reanimated")) return;
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});

// Silence console.log in tests (passing tests = no output)
const originalLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});

afterAll(() => {
  console.log = originalLog;
});

// Reset mocks between tests
afterEach(() => {
  jest.restoreAllMocks();
});
