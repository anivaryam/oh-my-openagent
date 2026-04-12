/// <reference types="bun-types" />

import { describe, it, expect, beforeEach, spyOn } from "bun:test"
import { AgentManager } from "./agent-manager"
import { AgentState, InvalidTransitionError } from "./state-machine"
import { EventBus } from "../event-bus/event-bus"

describe("AgentManager", () => {
  let manager: AgentManager
  let eventBus: EventBus
  let publishSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    eventBus = new EventBus()
    manager = new AgentManager('session-1', eventBus)
    publishSpy = spyOn(eventBus, 'publish')
  })

  describe("spawn", () => {
    describe("#given a valid agent config", () => {
      describe("#when spawning an agent", () => {
        it("#then creates an instance with correct defaults", () => {
          const instance = manager.spawn({ name: 'worker' })

          expect(instance.name).toBe('worker')
          expect(instance.state).toBe(AgentState.Created)
          expect(instance.sessionID).toBe('session-1')
          expect(instance.maxSteps).toBe(100)
          expect(instance.currentSteps).toBe(0)
          expect(instance.timeoutMs).toBe(300_000)
          expect(instance.retryCount).toBe(0)
          expect(instance.maxRetries).toBe(3)
          expect(instance.children).toEqual([])
          expect(instance.metadata).toEqual({})
          expect(instance.id).toMatch(/^agent_/)
          expect(instance.createdAt).toBeInstanceOf(Date)
          expect(instance.lastActiveAt).toBeInstanceOf(Date)
          expect(instance.abortController).toBeInstanceOf(AbortController)
        })
      })
    })

    describe("#given a config with custom maxSteps", () => {
      describe("#when spawning an agent", () => {
        it("#then uses the config maxSteps", () => {
          const instance = manager.spawn({ name: 'worker', options: { maxSteps: 50 } })

          expect(instance.maxSteps).toBe(50)
        })
      })
    })

    describe("#given a parentID in spawn options", () => {
      describe("#when spawning a child agent", () => {
        it("#then links the child to the parent's children array", () => {
          const parent = manager.spawn({ name: 'parent' })
          const child = manager.spawn({ name: 'child' }, { parentID: parent.id })

          expect(child.parentID).toBe(parent.id)
          expect(parent.children).toContain(child.id)
        })
      })
    })

    describe("#given a valid agent config", () => {
      describe("#when spawning an agent", () => {
        it("#then publishes an 'agent.spawn' event", () => {
          const instance = manager.spawn({ name: 'worker' })

          expect(publishSpy).toHaveBeenCalledWith('agent.spawn', {
            agentId: instance.id,
            sessionId: 'session-1',
            parentAgentId: undefined,
          })
        })
      })
    })
  })

  describe("start", () => {
    describe("#given a spawned agent", () => {
      describe("#when starting it", () => {
        it("#then transitions the agent to Running state", () => {
          const instance = manager.spawn({ name: 'worker' })

          manager.start(instance.id)

          const agent = manager.getAgent(instance.id)!
          expect(agent.state).toBe(AgentState.Running)
        })
      })
    })

    describe("#given a spawned agent", () => {
      describe("#when starting it", () => {
        it("#then publishes an 'agent.started' event", () => {
          const instance = manager.spawn({ name: 'worker' })

          manager.start(instance.id)

          expect(publishSpy).toHaveBeenCalledWith('agent.started', {
            agentId: instance.id,
            sessionId: 'session-1',
          })
        })
      })
    })
  })

  describe("pause", () => {
    describe("#given a running agent", () => {
      describe("#when pausing it", () => {
        it("#then transitions the agent to Paused state", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)

          manager.pause(instance.id)

          const agent = manager.getAgent(instance.id)!
          expect(agent.state).toBe(AgentState.Paused)
        })
      })
    })
  })

  describe("resume", () => {
    describe("#given a paused agent", () => {
      describe("#when resuming it", () => {
        it("#then transitions the agent to Idle state", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)
          manager.pause(instance.id)

          manager.resume(instance.id)

          const agent = manager.getAgent(instance.id)!
          expect(agent.state).toBe(AgentState.Idle)
        })
      })
    })
  })

  describe("kill", () => {
    describe("#given a parent agent with children", () => {
      describe("#when killing the parent", () => {
        it("#then recursively kills children first", () => {
          const parent = manager.spawn({ name: 'parent' })
          manager.start(parent.id)
          const child1 = manager.spawn({ name: 'child1' }, { parentID: parent.id })
          manager.start(child1.id)
          const child2 = manager.spawn({ name: 'child2' }, { parentID: parent.id })
          manager.start(child2.id)

          manager.kill(parent.id, 'test')

          expect(manager.getAgent(parent.id)).toBeUndefined()
          expect(manager.getAgent(child1.id)).toBeUndefined()
          expect(manager.getAgent(child2.id)).toBeUndefined()
        })
      })
    })

    describe("#given a running agent", () => {
      describe("#when killing it", () => {
        it("#then aborts the agent's AbortController", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)
          const abortSpy = spyOn(instance.abortController, 'abort')

          manager.kill(instance.id)

          expect(abortSpy).toHaveBeenCalled()
        })
      })
    })

    describe("#given a running agent", () => {
      describe("#when killing it", () => {
        it("#then removes the agent from the registry", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)

          manager.kill(instance.id)

          expect(manager.getAgent(instance.id)).toBeUndefined()
        })
      })
    })

    describe("#given a running agent", () => {
      describe("#when killing it", () => {
        it("#then publishes an 'agent.terminate' event", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)

          manager.kill(instance.id)

          expect(publishSpy).toHaveBeenCalledWith('agent.terminate', {
            agentId: instance.id,
            reason: 'user_request',
          })
        })
      })
    })
  })

  describe("transitionTo", () => {
    describe("#given a newly created agent", () => {
      describe("#when transitioning to Running for the first time", () => {
        it("#then sets startedAt on the instance", () => {
          const instance = manager.spawn({ name: 'worker' })

          expect(instance.startedAt).toBeUndefined()

          manager.transitionTo(instance.id, AgentState.Running)

          const agent = manager.getAgent(instance.id)!
          expect(agent.startedAt).toBeInstanceOf(Date)
        })
      })
    })

    describe("#given a running agent", () => {
      describe("#when transitioning to a terminal state (Completed)", () => {
        it("#then sets completedAt on the instance", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)

          expect(instance.completedAt).toBeUndefined()

          manager.transitionTo(instance.id, AgentState.Completed)

          const agent = manager.getAgent(instance.id)!
          expect(agent.completedAt).toBeInstanceOf(Date)
        })
      })
    })

    describe("#given a created agent", () => {
      describe("#when attempting an invalid transition (Created -> Completed)", () => {
        it("#then throws an InvalidTransitionError", () => {
          const instance = manager.spawn({ name: 'worker' })

          expect(() => {
            manager.transitionTo(instance.id, AgentState.Completed)
          }).toThrow(InvalidTransitionError)
        })
      })
    })

    describe("#given a nonexistent agent id", () => {
      describe("#when calling transitionTo", () => {
        it("#then silently no-ops without throwing", () => {
          expect(() => {
            manager.transitionTo('nonexistent', AgentState.Running)
          }).not.toThrow()
        })
      })
    })

    describe("#given a running agent", () => {
      describe("#when transitioning to Idle", () => {
        it("#then publishes an 'agent.state_change' event", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)

          publishSpy.mockClear()

          manager.transitionTo(instance.id, AgentState.Idle)

          expect(publishSpy).toHaveBeenCalledWith('agent.state_change', {
            agentId: instance.id,
            from: AgentState.Running,
            to: AgentState.Idle,
          })
        })
      })
    })
  })

  describe("incrementSteps", () => {
    describe("#given a running agent", () => {
      describe("#when incrementing steps", () => {
        it("#then increases the currentSteps counter", () => {
          const instance = manager.spawn({ name: 'worker' })
          manager.start(instance.id)

          expect(instance.currentSteps).toBe(0)

          const result = manager.incrementSteps(instance.id)

          expect(result).toBe(1)
          expect(manager.getAgent(instance.id)!.currentSteps).toBe(1)
        })
      })
    })

    describe("#given an agent that has reached maxSteps", () => {
      describe("#when incrementing steps", () => {
        it("#then transitions to Timeout and publishes terminate event", () => {
          const instance = manager.spawn({
            name: 'worker',
            options: { maxSteps: 2 },
          })
          manager.start(instance.id)

          manager.incrementSteps(instance.id)
          manager.incrementSteps(instance.id)

          const agent = manager.getAgent(instance.id)!
          expect(agent.state).toBe(AgentState.Timeout)
          expect(publishSpy).toHaveBeenCalledWith('agent.terminate', {
            agentId: instance.id,
            reason: 'timeout',
          })
        })
      })
    })

    describe("#given a nonexistent agent id", () => {
      describe("#when incrementing steps", () => {
        it("#then returns 0", () => {
          const result = manager.incrementSteps('nonexistent')

          expect(result).toBe(0)
        })
      })
    })
  })

  describe("getAgent", () => {
    describe("#given a spawned agent", () => {
      describe("#when calling getAgent with its id", () => {
        it("#then returns the agent instance", () => {
          const instance = manager.spawn({ name: 'worker' })

          const retrieved = manager.getAgent(instance.id)

          expect(retrieved).toBe(instance)
        })
      })
    })
  })

  describe("listAgents", () => {
    describe("#given multiple spawned agents", () => {
      describe("#when listing all agents", () => {
        it("#then returns all instances", () => {
          const a = manager.spawn({ name: 'a' })
          const b = manager.spawn({ name: 'b' })

          const list = manager.listAgents()

          expect(list).toHaveLength(2)
          expect(list).toContain(a)
          expect(list).toContain(b)
        })
      })
    })
  })

  describe("getChildren", () => {
    describe("#given a parent with children", () => {
      describe("#when calling getChildren", () => {
        it("#then returns child instances", () => {
          const parent = manager.spawn({ name: 'parent' })
          const child = manager.spawn({ name: 'child' }, { parentID: parent.id })

          const children = manager.getChildren(parent.id)

          expect(children).toHaveLength(1)
          expect(children[0].id).toBe(child.id)
        })
      })
    })
  })
})
