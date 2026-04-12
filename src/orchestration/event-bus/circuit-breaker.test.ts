import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test"
import { CircuitBreaker, EventMetadata } from "./circuit-breaker"

function createMetadata(overrides?: Partial<EventMetadata>): EventMetadata {
  return {
    eventId: "evt-1",
    eventType: "agent.spawn",
    timestamp: Date.now(),
    version: "1.0",
    hopCount: 0,
    ...overrides,
  }
}

describe("CircuitBreaker", () => {
  describe("#given a circuit breaker with default maxHops", () => {
    test("#when checking metadata with hopCount 0 #then allows the event", () => {
      const cb = new CircuitBreaker()
      const result = cb.check(createMetadata({ hopCount: 0 }))

      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    test("#when checking metadata with hopCount below limit #then allows the event", () => {
      const cb = new CircuitBreaker()
      const result = cb.check(createMetadata({ hopCount: 9 }))

      expect(result.allowed).toBe(true)
    })

    test("#when checking metadata with hopCount equal to maxHops #then blocks the event", () => {
      const cb = new CircuitBreaker()
      const result = cb.check(createMetadata({ hopCount: 10 }))

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("hop limit exceeded")
    })

    test("#when checking metadata with hopCount over maxHops #then blocks the event", () => {
      const cb = new CircuitBreaker()
      const result = cb.check(createMetadata({ hopCount: 15 }))

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("hop limit exceeded")
    })
  })

  describe("#given a circuit breaker with custom maxHops of 3", () => {
    test("#when checking metadata with hopCount 2 #then allows the event", () => {
      const cb = new CircuitBreaker(3)
      const result = cb.check(createMetadata({ hopCount: 2 }))

      expect(result.allowed).toBe(true)
    })

    test("#when checking metadata with hopCount 3 #then blocks the event", () => {
      const cb = new CircuitBreaker(3)
      const result = cb.check(createMetadata({ hopCount: 3 }))

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("hop limit exceeded")
    })
  })

  describe("#given a circuit that has been broken for an eventId", () => {
    test("#when checking that eventId #then blocks the event", () => {
      const cb = new CircuitBreaker()
      cb.break("evt-broken")

      const result = cb.check(createMetadata({ eventId: "evt-broken", hopCount: 0 }))

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("circuit broken")
    })

    test("#when checking a different eventId #then allows the event", () => {
      const cb = new CircuitBreaker()
      cb.break("evt-broken")

      const result = cb.check(createMetadata({ eventId: "evt-other", hopCount: 0 }))

      expect(result.allowed).toBe(true)
    })
  })

  describe("#given isOpen is called", () => {
    test("#when eventId has not been broken #then returns false", () => {
      const cb = new CircuitBreaker()

      expect(cb.isOpen("unknown-id")).toBe(false)
    })

    test("#when eventId has been broken #then returns true", () => {
      const cb = new CircuitBreaker()
      cb.break("evt-1")

      expect(cb.isOpen("evt-1")).toBe(true)
    })
  })

  describe("#given reset is called", () => {
    test("#when multiple circuits are broken #then clears all breaks", () => {
      const cb = new CircuitBreaker()
      cb.break("evt-1")
      cb.break("evt-2")
      cb.break("evt-3")

      cb.reset()

      expect(cb.isOpen("evt-1")).toBe(false)
      expect(cb.isOpen("evt-2")).toBe(false)
      expect(cb.isOpen("evt-3")).toBe(false)
    })
  })

  describe("#given a circuit breaker with a short resetTimeoutMs", () => {
    test("#when enough time passes after break #then circuit auto-resets", () => {
      const resetTimeoutMs = 100
      const cb = new CircuitBreaker(10, resetTimeoutMs)

      const originalDateNow = Date.now
      let currentTime = 1000000

      Date.now = () => currentTime

      cb.break("evt-timeout")
      expect(cb.isOpen("evt-timeout")).toBe(true)

      currentTime += resetTimeoutMs - 1
      expect(cb.isOpen("evt-timeout")).toBe(true)

      currentTime += 1
      expect(cb.isOpen("evt-timeout")).toBe(false)

      const result = cb.check(createMetadata({ eventId: "evt-timeout", hopCount: 0 }))
      expect(result.allowed).toBe(true)

      Date.now = originalDateNow
    })
  })
})
