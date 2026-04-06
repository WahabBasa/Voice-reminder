// Must be set before any test code runs — setupFilesAfterEnv is too late
process.env.TZ = "UTC";

module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "lib/time.ts",
    "lib/schedule.ts",
    "lib/reminderActive.ts",
    "lib/usageGate.ts",
    "lib/store.ts",
    "lib/notificationDecisions.ts",
    "convex/helpers.ts",
  ],
  coverageThreshold: {
    "lib/time.ts": { lines: 85, branches: 70 },
    "lib/schedule.ts": { lines: 95, branches: 80 },
    "lib/reminderActive.ts": { lines: 95, branches: 80 },
    "lib/usageGate.ts": { lines: 90, branches: 100 },
    "lib/store.ts": { lines: 65, branches: 60 },
    "lib/notificationDecisions.ts": { lines: 100, branches: 100 },
    "convex/helpers.ts": { lines: 100, branches: 100 },
  },
};
