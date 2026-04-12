import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test"
import { DeadLetterQueue } from "./dead-letter"
import type { EventEnvelope, EventMetadata } from "./circuit-breaker"

function createEnvelope(eventType: string = "agent.spawn"): EventEnvelope {
  return {
    metadata: {
      eventId: `evt-${Math.random().toString(36).substring(2, 8)}`,
      eventType,
      timestamp: Date.now(),
      version: "1.0",
      hopCount: 0,
    },
    data: { test: true },
  }
}

describe("DeadLetterQueue", () => {
  describe("#given an empty dead letter queue", () => {
    test("#when add is called #then size increases", () => {
      const dlq = new DeadLetterQueue()

      expect(dlq.size).toBe(0)

      dlq.add(createEnvelope(), new Error("fail"))
      expect(dlq.size).toBe(1)

      dlq.add(createEnvelope(), new Error("fail again"))
      expect(dlq.size).toBe(2)
    })

    test("#when getAll is called #then returns empty array", () => {
      const dlq = new DeadLetterQueue()

      expect(dlq.getAll()).toEqual([])
    })
  })

  describe("#given a dead letter queue with items", () => {
    test("#when getAll is called #then returns items in insertion order", () => {
      const dlq = new DeadLetterQueue()
      const env1 = createEnvelope("agent.spawn")
      const env2 = createEnvelope("agent.error")
      const env3 = createEnvelope("task.complete")

      dlq.add(env1, new Error("err1"))
      dlq.add(env2, new Error("err2"))
      dlq.add(env3, new Error("err3"))

      const items = dlq.getAll()
      expect(items).toHaveLength(3)
      expect(items[0].event).toBe(env1)
      expect(items[0].error.message).toBe("err1")
      expect(items[1].event).toBe(env2)
      expect(items[2].event).toBe(env3)
    })

    test("#when getAll is called #then returns a copy not the original array", () => {
      const dlq = new DeadLetterQueue()
      dlq.add(createEnvelope(), new Error("err"))

      const items1 = dlq.getAll()
      const items2 = dlq.getAll()

      expect(items1).not.toBe(items2)
      expect(items1).toEqual(items2)
    })

    test("#when clear is called #then empties the queue", () => {
      const dlq = new DeadLetterQueue()
      dlq.add(createEnvelope(), new Error("err1"))
      dlq.add(createEnvelope(), new Error("err2"))

      expect(dlq.size).toBe(2)

      dlq.clear()

      expect(dlq.size).toBe(0)
      expect(dlq.getAll()).toEqual([])
    })
  })

  describe("#given a dead letter queue with maxSize of 3", () => {
    test("#when adding a 4th item #then evicts the oldest item", () => {
      const dlq = new DeadLetterQueue(3)
      const env1 = createEnvelope("first")
      const env2 = createEnvelope("second")
      const env3 = createEnvelope("third")
      const env4 = createEnvelope("fourth")

      dlq.add(env1, new Error("e1"))
      dlq.add(env2, new Error("e2"))
      dlq.add(env3, new Error("e3"))
      expect(dlq.size).toBe(3)

      dlq.add(env4, new Error("e4"))
      expect(dlq.size).toBe(3)

      const items = dlq.getAll()
      expect(items[0].event).toBe(env2)
      expect(items[1].event).toBe(env3)
      expect(items[2].event).toBe(env4)
    })

    test("#when adding multiple items beyond maxSize #then maintains FIFO eviction", () => {
      const dlq = new DeadLetterQueue(2)

      dlq.add(createEnvelope("a"), new Error("e1"))
      dlq.add(createEnvelope("b"), new Error("e2"))
      dlq.add(createEnvelope("c"), new Error("e3"))
      dlq.add(createEnvelope("d"), new Error("e4"))

      expect(dlq.size).toBe(2)
      const items = dlq.getAll()
      expect(items[0].event.metadata.eventType).toBe("c")
      expect(items[1].event.metadata.eventType).toBe("d")
    })
  })

  describe("#given an onDeadLetter handler is registered", () => {
    test("#when an item is added #then the handler is called with the item", () => {
      const dlq = new DeadLetterQueue()
      const handler = mock(() => {})
      dlq.onDeadLetter(handler)

      const envelope = createEnvelope()
      const error = new Error("test error")
      dlq.add(envelope, error)

      expect(handler).toHaveBeenCalledTimes(1)
      const calledWith = handler.mock.calls[0][0]
      expect(calledWith.event).toBe(envelope)
      expect(calledWith.error).toBe(error)
    })

    test("#when the handler is unsubscribed #then it stops being called", () => {
      const dlq = new DeadLetterQueue()
      const handler = mock(() => {})
      const unsub = dlq.onDeadLetter(handler)

      dlq.add(createEnvelope(), new Error("first"))
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()

      dlq.add(createEnvelope(), new Error("second"))
      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("#when multiple handlers are registered #then all are called", () => {
      const dlq = new DeadLetterQueue()
      const handler1 = mock(() => {})
      const handler2 = mock(() => {})
      dlq.onDeadLetter(handler1)
      dlq.onDeadLetter(handler2)

      dlq.add(createEnvelope(), new Error("err"))

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })
  })

  describe("#given an async onDeadLetter handler that rejects", () => {
    test("#when an item is added #then the error is caught and does not throw", () => {
      const dlq = new DeadLetterQueue()
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})

      dlq.onDeadLetter(async () => {
        throw new Error("async handler failure")
      })

      expect(() => {
        dlq.add(createEnvelope(), new Error("trigger"))
      }).not.toThrow()

      consoleErrorSpy.mockRestore()
    })
  })

  describe("#given console.warn is observed", () => {
    test("#when an item is added #then console.warn is called with dead letter info", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      const dlq = new DeadLetterQueue()

      const envelope = createEnvelope("agent.error")
      dlq.add(envelope, new Error("something went wrong"))

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toBe("[DeadLetter]")
      expect(warnSpy.mock.calls[0][1]).toBe("agent.error")
      expect(warnSpy.mock.calls[0][2]).toBe("something went wrong")

      warnSpy.mockRestore()
    })
  })
})
