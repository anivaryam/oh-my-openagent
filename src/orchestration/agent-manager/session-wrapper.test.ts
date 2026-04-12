/// <reference types="bun-types" />

import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test"
import { GlobalAgentRegistry, SessionWrapper } from "./session-wrapper"
import { AgentManager } from "./agent-manager"
import { EventBus } from "../event-bus/event-bus"

function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    parentID: undefined as string | undefined,
    children: mock(() => [] as string[]),
    fork: mock((messageID?: string) => createMockSession({ id: `session-1-fork` })),
    abort: mock(() => {}),
    ...overrides,
  }
}

describe("GlobalAgentRegistry", () => {
  let eventBus: EventBus
  let registry: GlobalAgentRegistry

  beforeEach(() => {
    eventBus = new EventBus()
    registry = new GlobalAgentRegistry(eventBus)
  })

  describe("getOrCreate", () => {
    describe("#given an unknown session ID", () => {
      describe("#when calling getOrCreate", () => {
        it("#then creates a new AgentManager for that session", () => {
          const manager = registry.getOrCreate('new-session')

          expect(manager).toBeInstanceOf(AgentManager)
        })
      })
    })

    describe("#given a session ID that already has a manager", () => {
      describe("#when calling getOrCreate again", () => {
        it("#then returns the same manager instance", () => {
          const first = registry.getOrCreate('session-1')
          const second = registry.getOrCreate('session-1')

          expect(first).toBe(second)
        })
      })
    })
  })

  describe("get", () => {
    describe("#given an unknown session ID", () => {
      describe("#when calling get", () => {
        it("#then returns undefined", () => {
          const result = registry.get('nonexistent')

          expect(result).toBeUndefined()
        })
      })
    })

    describe("#given an existing session", () => {
      describe("#when calling get", () => {
        it("#then returns the manager", () => {
          const created = registry.getOrCreate('session-1')
          const retrieved = registry.get('session-1')

          expect(retrieved).toBe(created)
        })
      })
    })
  })

  describe("dispose", () => {
    describe("#given a session with spawned agents", () => {
      describe("#when disposing the session", () => {
        it("#then kills all agents and removes the manager", () => {
          const manager = registry.getOrCreate('session-1')
          const agent1 = manager.spawn({ name: 'a' })
          manager.start(agent1.id)
          const agent2 = manager.spawn({ name: 'b' })
          manager.start(agent2.id)

          registry.dispose('session-1')

          expect(registry.get('session-1')).toBeUndefined()
          expect(manager.listAgents()).toHaveLength(0)
        })
      })
    })

    describe("#given an unknown session ID", () => {
      describe("#when disposing", () => {
        it("#then does nothing and does not throw", () => {
          expect(() => {
            registry.dispose('nonexistent')
          }).not.toThrow()
        })
      })
    })
  })

  describe("listSessions", () => {
    describe("#given multiple sessions have been created", () => {
      describe("#when listing sessions", () => {
        it("#then returns all session IDs", () => {
          registry.getOrCreate('session-a')
          registry.getOrCreate('session-b')
          registry.getOrCreate('session-c')

          const sessions = registry.listSessions()

          expect(sessions).toHaveLength(3)
          expect(sessions).toContain('session-a')
          expect(sessions).toContain('session-b')
          expect(sessions).toContain('session-c')
        })
      })
    })

    describe("#given no sessions exist", () => {
      describe("#when listing sessions", () => {
        it("#then returns an empty array", () => {
          const sessions = registry.listSessions()

          expect(sessions).toHaveLength(0)
        })
      })
    })
  })
})

describe("SessionWrapper", () => {
  let eventBus: EventBus
  let manager: AgentManager

  beforeEach(() => {
    eventBus = new EventBus()
    manager = new AgentManager('session-1', eventBus)
  })

  describe("fork", () => {
    describe("#given a session wrapper", () => {
      describe("#when forking the session", () => {
        it("#then returns a new SessionWrapper with the forked session", () => {
          const session = createMockSession()
          const wrapper = new SessionWrapper(session, manager)

          const forked = wrapper.fork('msg-1')

          expect(forked).toBeInstanceOf(SessionWrapper)
          expect(session.fork).toHaveBeenCalledWith('msg-1')
          expect(forked.getSessionId()).toBe('session-1-fork')
        })
      })
    })
  })

  describe("abort", () => {
    describe("#given a session wrapper", () => {
      describe("#when calling abort", () => {
        it("#then delegates to the underlying session's abort method", () => {
          const session = createMockSession()
          const wrapper = new SessionWrapper(session, manager)

          wrapper.abort()

          expect(session.abort).toHaveBeenCalled()
        })
      })
    })
  })

  describe("getManager", () => {
    describe("#given a session wrapper", () => {
      describe("#when calling getManager", () => {
        it("#then returns the agent manager", () => {
          const session = createMockSession()
          const wrapper = new SessionWrapper(session, manager)

          expect(wrapper.getManager()).toBe(manager)
        })
      })
    })
  })

  describe("getSessionId", () => {
    describe("#given a session wrapper with a specific session", () => {
      describe("#when calling getSessionId", () => {
        it("#then returns the session's id", () => {
          const session = createMockSession({ id: 'my-session-42' })
          const wrapper = new SessionWrapper(session, manager)

          expect(wrapper.getSessionId()).toBe('my-session-42')
        })
      })
    })
  })

  describe("syncChildren", () => {
    describe("#given a session with children not tracked by the manager", () => {
      describe("#when calling syncChildren", () => {
        it("#then logs unsynced children via console.log", () => {
          const session = createMockSession({
            children: mock(() => ['child-1', 'child-2']),
          })
          const wrapper = new SessionWrapper(session, manager)
          const logSpy = spyOn(console, 'log')

          wrapper.syncChildren()

          expect(logSpy).toHaveBeenCalledWith('[SessionWrapper] Syncing child session: child-1')
          expect(logSpy).toHaveBeenCalledWith('[SessionWrapper] Syncing child session: child-2')

          logSpy.mockRestore()
        })
      })
    })

    describe("#given a session with children that are tracked by the manager", () => {
      describe("#when calling syncChildren", () => {
        it("#then does not log for tracked children", () => {
          const agent = manager.spawn({ name: 'child-agent' })
          const session = createMockSession({
            children: mock(() => [agent.id]),
          })
          const wrapper = new SessionWrapper(session, manager)
          const logSpy = spyOn(console, 'log')

          wrapper.syncChildren()

          expect(logSpy).not.toHaveBeenCalled()

          logSpy.mockRestore()
        })
      })
    })
  })
})
