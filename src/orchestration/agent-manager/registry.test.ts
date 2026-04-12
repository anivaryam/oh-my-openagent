/// <reference types="bun-types" />

import { describe, it, expect, beforeEach } from "bun:test"
import { AgentRegistry, AgentInstance, AgentConfig } from "./registry"
import { AgentState } from "./state-machine"

function createTestInstance(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 'test-id',
    name: 'test-agent',
    config: { name: 'test-agent' },
    state: AgentState.Created,
    sessionID: 'session-1',
    children: [],
    createdAt: new Date(),
    lastActiveAt: new Date(),
    maxSteps: 100,
    currentSteps: 0,
    timeoutMs: 300000,
    retryCount: 0,
    maxRetries: 3,
    abortController: new AbortController(),
    metadata: {},
    ...overrides,
  }
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  describe("#given an agent instance", () => {
    describe("#when registering and then retrieving it", () => {
      it("#then get returns the registered instance", () => {
        const instance = createTestInstance({ id: 'agent-1' })

        registry.register(instance)
        const retrieved = registry.get('agent-1')

        expect(retrieved).toBe(instance)
      })
    })
  })

  describe("#given no registered agents", () => {
    describe("#when getting an unknown id", () => {
      it("#then returns undefined", () => {
        const result = registry.get('nonexistent')

        expect(result).toBeUndefined()
      })
    })
  })

  describe("#given multiple registered agents", () => {
    describe("#when listing all agents", () => {
      it("#then returns all registered instances", () => {
        const a = createTestInstance({ id: 'a', sessionID: 'session-1' })
        const b = createTestInstance({ id: 'b', sessionID: 'session-2' })
        const c = createTestInstance({ id: 'c', sessionID: 'session-1' })

        registry.register(a)
        registry.register(b)
        registry.register(c)

        const all = registry.list()

        expect(all).toHaveLength(3)
        expect(all).toContain(a)
        expect(all).toContain(b)
        expect(all).toContain(c)
      })
    })

    describe("#when listing with a sessionID filter", () => {
      it("#then returns only instances matching that sessionID", () => {
        const a = createTestInstance({ id: 'a', sessionID: 'session-1' })
        const b = createTestInstance({ id: 'b', sessionID: 'session-2' })
        const c = createTestInstance({ id: 'c', sessionID: 'session-1' })

        registry.register(a)
        registry.register(b)
        registry.register(c)

        const filtered = registry.list('session-1')

        expect(filtered).toHaveLength(2)
        expect(filtered).toContain(a)
        expect(filtered).toContain(c)
        expect(filtered).not.toContain(b)
      })
    })
  })

  describe("#given agents with parent-child relationships", () => {
    describe("#when calling getChildren with a parentID", () => {
      it("#then returns instances whose parentID matches", () => {
        const parent = createTestInstance({ id: 'parent-1' })
        const child1 = createTestInstance({ id: 'child-1', parentID: 'parent-1' })
        const child2 = createTestInstance({ id: 'child-2', parentID: 'parent-1' })
        const unrelated = createTestInstance({ id: 'other', parentID: 'parent-2' })

        registry.register(parent)
        registry.register(child1)
        registry.register(child2)
        registry.register(unrelated)

        const children = registry.getChildren('parent-1')

        expect(children).toHaveLength(2)
        expect(children).toContain(child1)
        expect(children).toContain(child2)
        expect(children).not.toContain(unrelated)
      })
    })
  })

  describe("#given agents in different states", () => {
    describe("#when calling getByState", () => {
      it("#then returns only instances matching the given state", () => {
        const running1 = createTestInstance({ id: 'r1', state: AgentState.Running })
        const running2 = createTestInstance({ id: 'r2', state: AgentState.Running })
        const idle = createTestInstance({ id: 'i1', state: AgentState.Idle })
        const created = createTestInstance({ id: 'c1', state: AgentState.Created })

        registry.register(running1)
        registry.register(running2)
        registry.register(idle)
        registry.register(created)

        const result = registry.getByState(AgentState.Running)

        expect(result).toHaveLength(2)
        expect(result).toContain(running1)
        expect(result).toContain(running2)
      })
    })

    describe("#when calling getRunning", () => {
      it("#then returns only agents in Running state", () => {
        const running = createTestInstance({ id: 'r1', state: AgentState.Running })
        const idle = createTestInstance({ id: 'i1', state: AgentState.Idle })
        const paused = createTestInstance({ id: 'p1', state: AgentState.Paused })

        registry.register(running)
        registry.register(idle)
        registry.register(paused)

        const result = registry.getRunning()

        expect(result).toHaveLength(1)
        expect(result[0]).toBe(running)
      })
    })
  })

  describe("#given a registered agent", () => {
    describe("#when updating with a partial patch", () => {
      it("#then applies the patch and updates lastActiveAt", () => {
        const instance = createTestInstance({ id: 'agent-1', currentSteps: 0 })
        const originalLastActive = instance.lastActiveAt

        registry.register(instance)

        // Small delay to ensure timestamp difference
        const before = new Date()
        registry.update('agent-1', { currentSteps: 5, name: 'updated-name' })

        const updated = registry.get('agent-1')!

        expect(updated.currentSteps).toBe(5)
        expect(updated.name).toBe('updated-name')
        expect(updated.lastActiveAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      })
    })
  })

  describe("#given no agent with the specified id", () => {
    describe("#when calling update", () => {
      it("#then does nothing and does not throw", () => {
        expect(() => {
          registry.update('nonexistent', { currentSteps: 10 })
        }).not.toThrow()
      })
    })
  })

  describe("#given a registered agent", () => {
    describe("#when removing it", () => {
      it("#then the agent is no longer retrievable", () => {
        const instance = createTestInstance({ id: 'agent-1' })

        registry.register(instance)
        expect(registry.get('agent-1')).toBeDefined()

        registry.remove('agent-1')

        expect(registry.get('agent-1')).toBeUndefined()
      })
    })
  })

  describe("#given agents are registered and removed", () => {
    describe("#when checking size", () => {
      it("#then size tracks the current number of instances", () => {
        expect(registry.size).toBe(0)

        registry.register(createTestInstance({ id: 'a' }))
        expect(registry.size).toBe(1)

        registry.register(createTestInstance({ id: 'b' }))
        expect(registry.size).toBe(2)

        registry.remove('a')
        expect(registry.size).toBe(1)

        registry.remove('b')
        expect(registry.size).toBe(0)
      })
    })
  })
})
