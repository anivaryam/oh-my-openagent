import { describe, expect, it, beforeEach, mock } from "bun:test"

// Mock storage
const mockSaveState = mock(() => {})
const mockClearState = mock(() => {})
mock.module("./storage", () => ({
  saveInteractiveBashSessionState: mockSaveState,
  clearInteractiveBashSessionState: mockClearState,
  loadInteractiveBashSessionState: mock(() => null),
}))

// Mock state-manager
const mockKillAllTrackedSessions = mock(() => Promise.resolve())
mock.module("./state-manager", () => ({
  getOrCreateState: (sessionID: string, stateMap: Map<string, any>) => {
    if (!stateMap.has(sessionID)) {
      stateMap.set(sessionID, {
        sessionID,
        tmuxSessions: new Set<string>(),
        updatedAt: Date.now(),
      })
    }
    return stateMap.get(sessionID)!
  },
  isOmoSession: (name: string | null) => name !== null && name.startsWith("omo-"),
  killAllTrackedSessions: mockKillAllTrackedSessions,
}))

// Mock claude-code-session-state
const mockSubagentSessions = new Set<string>()
mock.module("../../features/claude-code-session-state", () => ({
  subagentSessions: mockSubagentSessions,
}))

import { createInteractiveBashSessionHook } from "./hook"

const mockAbort = mock(() => Promise.resolve())

function createMockCtx() {
  return {
    client: {
      session: {
        abort: mockAbort,
      },
    },
  } as any
}

function createOutput(output = "(no output)") {
  return { title: "", output, metadata: null }
}

function createInput(overrides: any = {}) {
  return {
    tool: "interactive_bash",
    sessionID: "session-1",
    callID: "call-1",
    args: { tmux_command: "new-session -d -s omo-test" },
    ...overrides,
  }
}

describe("createInteractiveBashSessionHook", () => {
  beforeEach(() => {
    mockSaveState.mockClear()
    mockClearState.mockClear()
    mockKillAllTrackedSessions.mockClear()
    mockAbort.mockClear()
    mockSubagentSessions.clear()
  })

  describe("tool.execute.after", () => {
    it("#given non-interactive_bash tool #when toolExecuteAfter called #then does nothing", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({ tool: "bash" })
      const output = createOutput()
      const originalOutput = output.output

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe(originalOutput)
      expect(mockSaveState).not.toHaveBeenCalled()
    })

    it("#given interactive_bash with non-string tmux_command #when called #then does nothing", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({ args: { tmux_command: 123 } })
      const output = createOutput()
      const originalOutput = output.output

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe(originalOutput)
      expect(mockSaveState).not.toHaveBeenCalled()
    })

    it("#given new-session with omo- prefix #when called successfully #then adds session to tracked set and saves state", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({
        args: { tmux_command: "new-session -d -s omo-dev" },
      })
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(mockSaveState).toHaveBeenCalledTimes(1)
      const savedState = mockSaveState.mock.calls[0][0] as any
      expect(savedState.tmuxSessions.has("omo-dev")).toBe(true)
    })

    it("#given new-session with non-omo prefix #when called #then does not track session", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({
        args: { tmux_command: "new-session -d -s my-session" },
      })
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(mockSaveState).not.toHaveBeenCalled()
    })

    it("#given new-session with omo- prefix but error output #when called #then does not track", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({
        args: { tmux_command: "new-session -d -s omo-fail" },
      })
      const output = createOutput("Error: duplicate session")

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(mockSaveState).not.toHaveBeenCalled()
    })

    it("#given kill-session with tracked omo-session #when called #then removes session from tracked set and saves state", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())

      // First, add the session
      const addInput = createInput({
        args: { tmux_command: "new-session -d -s omo-remove" },
      })
      await hook["tool.execute.after"](addInput, createOutput())

      mockSaveState.mockClear()

      // Now kill it
      const killInput = createInput({
        args: { tmux_command: "kill-session -t omo-remove" },
      })
      const killOutput = createOutput()

      //#when
      await hook["tool.execute.after"](killInput, killOutput)

      //#then
      expect(mockSaveState).toHaveBeenCalledTimes(1)
      const savedState = mockSaveState.mock.calls[0][0] as any
      expect(savedState.tmuxSessions.has("omo-remove")).toBe(false)
    })

    it("#given kill-server #when called #then clears all tracked sessions", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())

      // Add some sessions first
      await hook["tool.execute.after"](
        createInput({ args: { tmux_command: "new-session -d -s omo-a" } }),
        createOutput(),
      )
      await hook["tool.execute.after"](
        createInput({ args: { tmux_command: "new-session -d -s omo-b" } }),
        createOutput(),
      )

      mockSaveState.mockClear()

      const killServerInput = createInput({
        args: { tmux_command: "kill-server" },
      })
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](killServerInput, output)

      //#then
      expect(mockSaveState).toHaveBeenCalledTimes(1)
      const savedState = mockSaveState.mock.calls[0][0] as any
      expect(savedState.tmuxSessions.size).toBe(0)
    })

    it("#given session operation (new-session with omo-) #when called #then appends reminder message to output", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({
        args: { tmux_command: "new-session -d -s omo-remind" },
      })
      const output = createOutput("session created")

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toContain("[System Reminder]")
      expect(output.output).toContain("omo-remind")
    })

    it("#given non-session operation (send-keys) #when called #then does not append reminder", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())
      const input = createInput({
        args: { tmux_command: "send-keys -t omo-test 'ls' Enter" },
      })
      const output = createOutput("(no output)")
      const originalOutput = output.output

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe(originalOutput)
    })
  })

  describe("event", () => {
    it("#given session.deleted event with valid sessionID #when called #then kills all tracked sessions, clears state, and deletes from session map", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())

      // Pre-populate a session by running a tool execute
      await hook["tool.execute.after"](
        createInput({
          sessionID: "session-to-delete",
          args: { tmux_command: "new-session -d -s omo-cleanup" },
        }),
        createOutput(),
      )

      mockSaveState.mockClear()

      //#when
      await hook.event({
        event: {
          type: "session.deleted",
          properties: { info: { id: "session-to-delete" } },
        },
      })

      //#then
      expect(mockKillAllTrackedSessions).toHaveBeenCalledTimes(1)
      expect(mockClearState).toHaveBeenCalledWith("session-to-delete")
    })

    it("#given session.deleted event #when called #then aborts subagent sessions", async () => {
      //#given
      mockSubagentSessions.add("subagent-1")
      mockSubagentSessions.add("subagent-2")

      const hook = createInteractiveBashSessionHook(createMockCtx())

      //#when
      await hook.event({
        event: {
          type: "session.deleted",
          properties: { info: { id: "session-with-subagents" } },
        },
      })

      //#then
      expect(mockAbort).toHaveBeenCalledTimes(2)
      expect(mockAbort).toHaveBeenCalledWith({ path: { id: "subagent-1" } })
      expect(mockAbort).toHaveBeenCalledWith({ path: { id: "subagent-2" } })
    })

    it("#given non-session.deleted event #when called #then does nothing", async () => {
      //#given
      const hook = createInteractiveBashSessionHook(createMockCtx())

      //#when
      await hook.event({
        event: {
          type: "message.created",
          properties: { info: { id: "session-1" } },
        },
      })

      //#then
      expect(mockKillAllTrackedSessions).not.toHaveBeenCalled()
      expect(mockClearState).not.toHaveBeenCalled()
      expect(mockAbort).not.toHaveBeenCalled()
    })
  })
})
