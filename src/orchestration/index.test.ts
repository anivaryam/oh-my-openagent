import { describe, expect, it } from "bun:test"

import {
  createOrchestration,
  getEventBus,
  getAgentManager,
  isOrchestrationInitialized,
  EventBus,
  GlobalAgentRegistry,
  AgentManager,
} from "./index"

describe("orchestration index", () => {
  // Note: Module state persists across tests since there's no reset function.
  // Tests are ordered to verify the full lifecycle.

  it("#given createOrchestration called #when result inspected #then returns eventBus and agentManager", () => {
    const result = createOrchestration()
    expect(result.eventBus).toBeInstanceOf(EventBus)
    expect(result.agentManager).toBeInstanceOf(GlobalAgentRegistry)
  })

  it("#given createOrchestration called twice #when results compared #then returns same instances (singleton)", () => {
    const first = createOrchestration()
    const second = createOrchestration()
    expect(first.eventBus).toBe(second.eventBus)
    expect(first.agentManager).toBe(second.agentManager)
  })

  it("#given orchestration initialized #when isOrchestrationInitialized called #then returns true", () => {
    createOrchestration()
    expect(isOrchestrationInitialized()).toBe(true)
  })

  it("#given orchestration initialized #when getEventBus called #then returns the EventBus instance", () => {
    const { eventBus } = createOrchestration()
    expect(getEventBus()).toBe(eventBus)
  })

  it("#given orchestration initialized #when getAgentManager called with sessionID #then returns AgentManager", () => {
    createOrchestration()
    const manager = getAgentManager("test-session-1")
    expect(manager).toBeInstanceOf(AgentManager)
  })

  it("#given orchestration initialized #when getAgentManager called with same sessionID twice #then returns same instance", () => {
    createOrchestration()
    const first = getAgentManager("test-session-2")
    const second = getAgentManager("test-session-2")
    expect(first).toBe(second)
  })

  it("#given orchestration initialized #when getAgentManager called with different sessionIDs #then returns different instances", () => {
    createOrchestration()
    const first = getAgentManager("test-session-3")
    const second = getAgentManager("test-session-4")
    expect(first).not.toBe(second)
  })
})

describe("re-exports", () => {
  it("#given orchestration module #when imported #then exports EventBus class", () => {
    expect(EventBus).toBeDefined()
    expect(typeof EventBus).toBe("function")
  })

  it("#given orchestration module #when imported #then exports GlobalAgentRegistry class", () => {
    expect(GlobalAgentRegistry).toBeDefined()
    expect(typeof GlobalAgentRegistry).toBe("function")
  })

  it("#given orchestration module #when imported #then exports AgentManager class", () => {
    expect(AgentManager).toBeDefined()
    expect(typeof AgentManager).toBe("function")
  })
})
