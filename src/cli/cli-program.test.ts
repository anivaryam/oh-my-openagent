import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test"

// --- Mocks (must be registered BEFORE any import of cli-program) ---
// Only mock leaf commands that don't have their own test files or that
// other test files don't depend on. Avoid mocking ./run and ./mcp-oauth
// because their mock.module registrations leak into runner.test.ts and
// mcp-oauth/index.test.ts in the full suite.

const mockInstall = mock(() => Promise.resolve(0))
const mockGetLocalVersion = mock(() => Promise.resolve(0))
const mockDoctor = mock(() => Promise.resolve(0))
const mockRefreshModelCapabilities = mock(() => Promise.resolve(0))

mock.module("./install", () => ({ install: mockInstall }))
mock.module("./get-local-version", () => ({ getLocalVersion: mockGetLocalVersion }))
mock.module("./doctor", () => ({ doctor: mockDoctor }))
mock.module("./refresh-model-capabilities", () => ({
  refreshModelCapabilities: mockRefreshModelCapabilities,
}))

// --- Helpers ---

/**
 * Run a CLI command by setting process.argv, dynamically importing the
 * module (so Commander gets a fresh program), and waiting for the async
 * action handler to settle.
 *
 * Commander's `.parse()` fires async action handlers as fire-and-forget
 * promises. The handler calls `process.exit()` after awaiting the mock.
 * We stub `process.exit` as a no-op so the process stays alive.
 */
async function runCommand(args: string[]) {
  const savedArgv = process.argv
  const exitSpy = spyOn(process, "exit").mockImplementation(
    (() => {}) as () => never,
  )

  try {
    process.argv = ["node", "oh-my-opencode", ...args]
    const mod = await import("./cli-program")
    mod.runCli()
    // Wait for async action handlers to resolve and call process.exit
    await new Promise((r) => setTimeout(r, 100))
  } finally {
    process.argv = savedArgv
    exitSpy.mockRestore()
  }
}

// --- Tests ---

describe("cli-program", () => {
  beforeEach(() => {
    mockInstall.mockReset().mockResolvedValue(0)
    mockGetLocalVersion.mockReset().mockResolvedValue(0)
    mockDoctor.mockReset().mockResolvedValue(0)
    mockRefreshModelCapabilities.mockReset().mockResolvedValue(0)
  })

  describe("install command", () => {
    it("#given --no-tui --claude=max20 #when install is invoked #then tui is false and claude is max20", async () => {
      await runCommand(["install", "--no-tui", "--claude=max20"])

      expect(mockInstall).toHaveBeenCalledTimes(1)
      const args = mockInstall.mock.calls[0][0]
      expect(args.tui).toBe(false)
      expect(args.claude).toBe("max20")
    })

    it("#given --claude=yes with no --no-tui flag #when install is invoked #then tui defaults to true and skipAuth defaults to false", async () => {
      await runCommand(["install", "--claude=yes"])

      expect(mockInstall).toHaveBeenCalledTimes(1)
      const args = mockInstall.mock.calls[0][0]
      expect(args.tui).toBe(true)
      expect(args.skipAuth).toBe(false)
    })
  })

  describe("doctor command", () => {
    it("#given --status flag #when doctor is invoked #then mode is status", async () => {
      await runCommand(["doctor", "--status"])

      expect(mockDoctor).toHaveBeenCalledTimes(1)
      const opts = mockDoctor.mock.calls[0][0]
      expect(opts.mode).toBe("status")
    })

    it("#given --verbose flag #when doctor is invoked #then mode is verbose", async () => {
      await runCommand(["doctor", "--verbose"])

      expect(mockDoctor).toHaveBeenCalledTimes(1)
      const opts = mockDoctor.mock.calls[0][0]
      expect(opts.mode).toBe("verbose")
    })

    it("#given no flags #when doctor is invoked #then mode is default", async () => {
      await runCommand(["doctor"])

      expect(mockDoctor).toHaveBeenCalledTimes(1)
      const opts = mockDoctor.mock.calls[0][0]
      expect(opts.mode).toBe("default")
    })
  })

  describe("get-local-version command", () => {
    it("#given --json flag #when get-local-version is invoked #then json is true", async () => {
      await runCommand(["get-local-version", "--json"])

      expect(mockGetLocalVersion).toHaveBeenCalledTimes(1)
      const opts = mockGetLocalVersion.mock.calls[0][0]
      expect(opts.json).toBe(true)
    })
  })
})
