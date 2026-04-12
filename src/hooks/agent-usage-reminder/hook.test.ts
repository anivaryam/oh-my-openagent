import { describe, expect, it, beforeEach, mock } from "bun:test"

// Mock storage
const mockLoadState = mock(() => null)
const mockSaveState = mock(() => {})
const mockClearState = mock(() => {})
mock.module("./storage", () => ({
  loadAgentUsageState: mockLoadState,
  saveAgentUsageState: mockSaveState,
  clearAgentUsageState: mockClearState,
}))

// Mock session agent getter
let mockSessionAgent: string | undefined = undefined
mock.module("../../features/claude-code-session-state", () => ({
  getSessionAgent: mock((sessionID: string) => mockSessionAgent),
}))

// Mock agent display names - getAgentConfigKey normalizes agent names
mock.module("../../shared/agent-display-names", () => ({
  getAgentConfigKey: mock((name: string) => name.toLowerCase()),
}))

import { createAgentUsageReminderHook } from "./hook"
import { REMINDER_MESSAGE, TARGET_TOOLS, AGENT_TOOLS } from "./constants"

function createMockCtx() {
  return {} as any
}

function createInput(tool: string, sessionID = "session-1") {
  return { tool, sessionID, callID: "call-1" }
}

function createOutput() {
  return { title: "", output: "result", metadata: null }
}

describe("createAgentUsageReminderHook", () => {
  beforeEach(() => {
    mockLoadState.mockReset().mockReturnValue(null)
    mockSaveState.mockReset()
    mockClearState.mockReset()
    mockSessionAgent = undefined
  })

  describe("tool.execute.after", () => {
    it("#given orchestrator agent using a TARGET_TOOL and agent not yet used #when toolExecuteAfter called #then appends REMINDER_MESSAGE to output", async () => {
      //#given
      mockSessionAgent = "prometheus"
      const hook = createAgentUsageReminderHook(createMockCtx())
      const input = createInput("grep")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result" + REMINDER_MESSAGE)
      expect(mockSaveState).toHaveBeenCalledTimes(1)
    })

    it("#given orchestrator agent using a TARGET_TOOL and agent already used #when called #then does NOT append reminder", async () => {
      //#given
      mockSessionAgent = "prometheus"
      const hook = createAgentUsageReminderHook(createMockCtx())
      // First use an AGENT_TOOL to mark agent as used
      await hook["tool.execute.after"](createInput("task"), createOutput())

      const input = createInput("grep")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result")
    })

    it("#given orchestrator agent using an AGENT_TOOL #when called #then marks agent as used and does NOT append reminder", async () => {
      //#given
      mockSessionAgent = "sisyphus"
      const hook = createAgentUsageReminderHook(createMockCtx())
      const input = createInput("task")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result")
      expect(mockSaveState).toHaveBeenCalledTimes(1)
      const savedState = mockSaveState.mock.calls[0][0] as any
      expect(savedState.agentUsed).toBe(true)
    })

    it("#given AGENT_TOOL used first then TARGET_TOOL #when called for target tool #then no reminder because agent was marked as used", async () => {
      //#given
      mockSessionAgent = "atlas"
      const hook = createAgentUsageReminderHook(createMockCtx())
      await hook["tool.execute.after"](createInput("task"), createOutput())

      const input = createInput("glob")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result")
    })

    it("#given non-orchestrator agent #when called with TARGET_TOOL #then does nothing and returns early", async () => {
      //#given
      mockSessionAgent = "explore"
      const hook = createAgentUsageReminderHook(createMockCtx())
      const input = createInput("grep")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result")
      expect(mockSaveState).not.toHaveBeenCalled()
    })

    it("#given no session agent set (undefined) #when called with TARGET_TOOL #then appends reminder treating as orchestrator", async () => {
      //#given
      mockSessionAgent = undefined
      const hook = createAgentUsageReminderHook(createMockCtx())
      const input = createInput("grep")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result" + REMINDER_MESSAGE)
    })

    it("#given a tool that is not in TARGET_TOOLS or AGENT_TOOLS #when called #then does nothing", async () => {
      //#given
      mockSessionAgent = "prometheus"
      const hook = createAgentUsageReminderHook(createMockCtx())
      const input = createInput("some_random_tool")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result")
      expect(mockSaveState).not.toHaveBeenCalled()
    })

    it("#given tool name with different casing #when called #then still matches via toLowerCase", async () => {
      //#given
      mockSessionAgent = "hephaestus"
      const hook = createAgentUsageReminderHook(createMockCtx())
      const input = createInput("Grep")
      const output = createOutput()

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(output.output).toBe("result" + REMINDER_MESSAGE)
    })

    it("#given multiple TARGET_TOOL calls without agent use #when called #then reminder appended each time and reminderCount increments", async () => {
      //#given
      mockSessionAgent = "sisyphus-junior"
      const hook = createAgentUsageReminderHook(createMockCtx())

      //#when
      const output1 = createOutput()
      await hook["tool.execute.after"](createInput("grep"), output1)

      const output2 = createOutput()
      await hook["tool.execute.after"](createInput("glob"), output2)

      const output3 = createOutput()
      await hook["tool.execute.after"](createInput("webfetch"), output3)

      //#then
      expect(output1.output).toBe("result" + REMINDER_MESSAGE)
      expect(output2.output).toBe("result" + REMINDER_MESSAGE)
      expect(output3.output).toBe("result" + REMINDER_MESSAGE)

      // saveState called 3 times (once per TARGET_TOOL call)
      expect(mockSaveState).toHaveBeenCalledTimes(3)

      // The state object is mutated in-place, so after all calls the final
      // reminderCount is 3. Verify via the last saved state reference.
      const lastSave = mockSaveState.mock.calls[2][0] as any
      expect(lastSave.reminderCount).toBe(3)
      expect(lastSave.agentUsed).toBe(false)
    })
  })

  describe("event", () => {
    it("#given session.deleted event #when called #then clears state for that session", async () => {
      //#given
      const hook = createAgentUsageReminderHook(createMockCtx())
      const eventInput = {
        event: {
          type: "session.deleted",
          properties: { info: { id: "session-42" } },
        },
      }

      //#when
      await hook.event(eventInput)

      //#then
      expect(mockClearState).toHaveBeenCalledWith("session-42")
    })

    it("#given session.compacted event with sessionID in properties #when called #then resets state", async () => {
      //#given
      const hook = createAgentUsageReminderHook(createMockCtx())
      const eventInput = {
        event: {
          type: "session.compacted",
          properties: { sessionID: "session-99" },
        },
      }

      //#when
      await hook.event(eventInput)

      //#then
      expect(mockClearState).toHaveBeenCalledWith("session-99")
    })

    it("#given unrelated event #when called #then does nothing", async () => {
      //#given
      const hook = createAgentUsageReminderHook(createMockCtx())
      const eventInput = {
        event: {
          type: "message.created",
          properties: { sessionID: "session-1" },
        },
      }

      //#when
      await hook.event(eventInput)

      //#then
      expect(mockClearState).not.toHaveBeenCalled()
      expect(mockSaveState).not.toHaveBeenCalled()
    })
  })
})
