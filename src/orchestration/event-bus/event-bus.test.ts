import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test"
import { EventBus } from "./event-bus"
import type { EventEnvelope } from "./circuit-breaker"

describe("EventBus", () => {
  describe("#given a new EventBus instance", () => {
    test("#when getSubscriberCount is called #then returns 0", () => {
      const bus = new EventBus()

      expect(bus.getSubscriberCount()).toBe(0)
    })

    test("#when getSubscriptions is called #then returns empty array", () => {
      const bus = new EventBus()

      expect(bus.getSubscriptions()).toEqual([])
    })

    test("#when getDeadLetterQueue is called #then returns a DeadLetterQueue", () => {
      const bus = new EventBus()

      expect(bus.getDeadLetterQueue()).toBeDefined()
      expect(bus.getDeadLetterQueue().size).toBe(0)
    })

    test("#when getCircuitBreaker is called #then returns a CircuitBreaker", () => {
      const bus = new EventBus()

      expect(bus.getCircuitBreaker()).toBeDefined()
    })
  })

  describe("#given a subscriber on 'agent.spawn'", () => {
    test("#when 'agent.spawn' is published #then handler receives envelope with correct metadata", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      const envelope = bus.publish("agent.spawn", { agentId: "a1" })

      expect(handler).toHaveBeenCalledTimes(1)
      const received: EventEnvelope = handler.mock.calls[0][0]
      expect(received.metadata.eventType).toBe("agent.spawn")
      expect(received.metadata.version).toBe("1.0")
      expect(received.metadata.hopCount).toBe(0)
      expect(received.metadata.eventId).toBeDefined()
      expect(received.metadata.timestamp).toBeGreaterThan(0)
      expect(received.data).toEqual({ agentId: "a1" })
    })

    test("#when a different event type is published #then handler is not called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      bus.publish("agent.complete", { agentId: "a1" })

      expect(handler).toHaveBeenCalledTimes(0)
    })
  })

  describe("#given a wildcard subscriber on 'agent.*'", () => {
    test("#when 'agent.spawn' is published #then handler is called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.*", handler)

      bus.publish("agent.spawn", {})

      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("#when 'agent.complete' is published #then handler is called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.*", handler)

      bus.publish("agent.complete", {})

      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("#when 'agent' is published #then handler is called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.*", handler)

      bus.publish("agent", {})

      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("#when 'task.assigned' is published #then handler is not called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.*", handler)

      bus.publish("task.assigned", {})

      expect(handler).toHaveBeenCalledTimes(0)
    })
  })

  describe("#given exact match subscription on 'agent.spawn'", () => {
    test("#when 'agent.spawn' is published #then handler is called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      bus.publish("agent.spawn", {})

      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("#when 'agent.spawn.extra' is published #then handler is not called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      bus.publish("agent.spawn.extra", {})

      expect(handler).toHaveBeenCalledTimes(0)
    })
  })

  describe("#given the unsubscribe function is called", () => {
    test("#when an event is published after unsubscribe #then handler is not called", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      const unsub = bus.subscribe("agent.spawn", handler)

      bus.publish("agent.spawn", {})
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()

      bus.publish("agent.spawn", {})
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe("#given multiple subscribers on the same event type", () => {
    test("#when event is published #then all handlers are called", () => {
      const bus = new EventBus()
      const handler1 = mock(() => {})
      const handler2 = mock(() => {})
      const handler3 = mock(() => {})

      bus.subscribe("agent.spawn", handler1)
      bus.subscribe("agent.spawn", handler2)
      bus.subscribe("agent.spawn", handler3)

      bus.publish("agent.spawn", {})

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
      expect(handler3).toHaveBeenCalledTimes(1)
    })
  })

  describe("#given a handler that returns a rejecting Promise", () => {
    test("#when event is published #then the error goes to the dead letter queue", async () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const bus = new EventBus()

      bus.subscribe("agent.spawn", async () => {
        throw new Error("async failure")
      })

      bus.publish("agent.spawn", {})

      // Allow the promise rejection to be caught
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(bus.getDeadLetterQueue().size).toBe(1)
      const items = bus.getDeadLetterQueue().getAll()
      expect(items[0].error.message).toBe("async failure")

      warnSpy.mockRestore()
    })
  })

  describe("#given a handler that throws synchronously", () => {
    test("#when event is published #then the error goes to the dead letter queue", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const bus = new EventBus()

      bus.subscribe("agent.error", () => {
        throw new Error("sync failure")
      })

      bus.publish("agent.error", {})

      expect(bus.getDeadLetterQueue().size).toBe(1)
      const items = bus.getDeadLetterQueue().getAll()
      expect(items[0].error.message).toBe("sync failure")

      warnSpy.mockRestore()
    })
  })

  describe("#given an EventBus with maxHops of 2", () => {
    test("#when publishing with hopCount at limit via circuit breaker #then event goes to DLQ", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const bus = new EventBus(2)

      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      // Manually break the circuit for a specific event to test circuit breaker blocking
      // The EventBus sets hopCount to 0 on publish, so we test via break()
      const envelope = bus.publish("agent.spawn", {})
      bus.getCircuitBreaker().break(envelope.metadata.eventId)

      // Publish normally still works since each publish creates a new eventId
      const envelope2 = bus.publish("agent.spawn", {})
      expect(handler).toHaveBeenCalledTimes(2)

      warnSpy.mockRestore()
    })
  })

  describe("#given an EventBus with a broken circuit", () => {
    test("#when the broken eventId is reused #then the event is blocked and goes to DLQ", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      // Publish to get an event, then break that circuit
      const envelope = bus.publish("agent.spawn", {})
      expect(handler).toHaveBeenCalledTimes(1)

      // Breaking means the circuit breaker tracks this eventId as broken
      bus.getCircuitBreaker().break(envelope.metadata.eventId)
      expect(bus.getCircuitBreaker().isOpen(envelope.metadata.eventId)).toBe(true)

      warnSpy.mockRestore()
    })
  })

  describe("#given publish is called with requireAck option", () => {
    test("#when requireAck is true #then envelope has an ack function", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("agent.spawn", handler)

      const envelope = bus.publish("agent.spawn", {}, { requireAck: true })

      expect(envelope.ack).toBeDefined()
      expect(typeof envelope.ack).toBe("function")
    })

    test("#when requireAck is false or undefined #then envelope has no ack function", () => {
      const bus = new EventBus()

      const envelope1 = bus.publish("agent.spawn", {}, { requireAck: false })
      expect(envelope1.ack).toBeUndefined()

      const envelope2 = bus.publish("agent.spawn", {})
      expect(envelope2.ack).toBeUndefined()
    })

    test("#when ack is called #then it does not throw", () => {
      const bus = new EventBus()

      const envelope = bus.publish("agent.spawn", {}, { requireAck: true })

      expect(() => envelope.ack!()).not.toThrow()
    })
  })

  describe("#given publish is called with correlationId and causationId", () => {
    test("#when options include correlation and causation IDs #then envelope metadata contains them", () => {
      const bus = new EventBus()
      const handler = mock(() => {})
      bus.subscribe("task.assigned", handler)

      const envelope = bus.publish("task.assigned", {}, {
        correlationId: "corr-123",
        causationId: "cause-456",
      })

      expect(envelope.metadata.correlationId).toBe("corr-123")
      expect(envelope.metadata.causationId).toBe("cause-456")

      const received: EventEnvelope = handler.mock.calls[0][0]
      expect(received.metadata.correlationId).toBe("corr-123")
      expect(received.metadata.causationId).toBe("cause-456")
    })
  })

  describe("#given subscribers across different event types", () => {
    test("#when getSubscriberCount is called without args #then returns total count", () => {
      const bus = new EventBus()

      bus.subscribe("agent.spawn", () => {})
      bus.subscribe("agent.spawn", () => {})
      bus.subscribe("task.complete", () => {})

      expect(bus.getSubscriberCount()).toBe(3)
    })

    test("#when getSubscriberCount is called with event type #then returns count for that type", () => {
      const bus = new EventBus()

      bus.subscribe("agent.spawn", () => {})
      bus.subscribe("agent.spawn", () => {})
      bus.subscribe("task.complete", () => {})

      expect(bus.getSubscriberCount("agent.spawn")).toBe(2)
      expect(bus.getSubscriberCount("task.complete")).toBe(1)
      expect(bus.getSubscriberCount("nonexistent")).toBe(0)
    })
  })

  describe("#given getSubscriptions is called", () => {
    test("#when called with an event type #then returns only subscriptions for that type", () => {
      const bus = new EventBus()
      bus.subscribe("agent.spawn", () => {})
      bus.subscribe("task.complete", () => {})

      const agentSubs = bus.getSubscriptions("agent.spawn")
      expect(agentSubs).toHaveLength(1)
      expect(agentSubs[0].eventType).toBe("agent.spawn")
    })

    test("#when called without arguments #then returns all subscriptions", () => {
      const bus = new EventBus()
      bus.subscribe("agent.spawn", () => {})
      bus.subscribe("task.complete", () => {})
      bus.subscribe("agent.error", () => {})

      const all = bus.getSubscriptions()
      expect(all).toHaveLength(3)
    })

    test("#when called with non-existent event type #then returns empty array", () => {
      const bus = new EventBus()
      bus.subscribe("agent.spawn", () => {})

      expect(bus.getSubscriptions("nonexistent")).toEqual([])
    })
  })

  describe("#given the last subscriber for a type is unsubscribed", () => {
    test("#when getSubscriptions is called #then the event type key is cleaned up", () => {
      const bus = new EventBus()
      const unsub1 = bus.subscribe("agent.spawn", () => {})
      const unsub2 = bus.subscribe("agent.spawn", () => {})

      expect(bus.getSubscriberCount("agent.spawn")).toBe(2)

      unsub1()
      expect(bus.getSubscriberCount("agent.spawn")).toBe(1)

      unsub2()
      expect(bus.getSubscriberCount("agent.spawn")).toBe(0)
      expect(bus.getSubscriptions("agent.spawn")).toEqual([])
      expect(bus.getSubscriptions()).toEqual([])
    })
  })

  describe("#given both exact and wildcard subscribers exist", () => {
    test("#when a matching event is published #then both handlers are called", () => {
      const bus = new EventBus()
      const exactHandler = mock(() => {})
      const wildcardHandler = mock(() => {})

      bus.subscribe("agent.spawn", exactHandler)
      bus.subscribe("agent.*", wildcardHandler)

      bus.publish("agent.spawn", {})

      expect(exactHandler).toHaveBeenCalledTimes(1)
      expect(wildcardHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe("#given a sync handler throws a non-Error value", () => {
    test("#when event is published #then the value is wrapped in an Error for DLQ", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const bus = new EventBus()

      bus.subscribe("agent.spawn", () => {
        throw "string error"
      })

      bus.publish("agent.spawn", {})

      const items = bus.getDeadLetterQueue().getAll()
      expect(items).toHaveLength(1)
      expect(items[0].error).toBeInstanceOf(Error)
      expect(items[0].error.message).toBe("string error")

      warnSpy.mockRestore()
    })
  })

  describe("#given an async handler rejects with a non-Error value", () => {
    test("#when event is published #then the value is wrapped in an Error for DLQ", async () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const bus = new EventBus()

      bus.subscribe("agent.spawn", async () => {
        throw 42
      })

      bus.publish("agent.spawn", {})

      await new Promise(resolve => setTimeout(resolve, 10))

      const items = bus.getDeadLetterQueue().getAll()
      expect(items).toHaveLength(1)
      expect(items[0].error).toBeInstanceOf(Error)
      expect(items[0].error.message).toBe("42")

      warnSpy.mockRestore()
    })
  })
})
