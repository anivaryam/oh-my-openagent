import { EventType } from '../types/event-taxonomy';

interface EventEnvelope<T = unknown> {
  metadata: EventMetadata;
  data: T;
  ack?: () => void;
}

interface EventMetadata {
  eventId: string;
  eventType: string;
  timestamp: number;
  version: string;
  correlationId?: string;
  causationId?: string;
  hopCount: number;
}

class CircuitBreaker {
  private maxHops: number;
  private resetTimeoutMs: number;
  private brokenCircuits: Map<string, number>;

  constructor(maxHops: number = 10, resetTimeoutMs: number = 30000) {
    this.maxHops = maxHops;
    this.resetTimeoutMs = resetTimeoutMs;
    this.brokenCircuits = new Map();
  }

  check(envelope: EventMetadata): { allowed: boolean; reason?: string } {
    if (this.isOpen(envelope.eventId)) {
      return { allowed: false, reason: 'circuit broken' };
    }

    if (envelope.hopCount >= this.maxHops) {
      return { allowed: false, reason: 'hop limit exceeded' };
    }

    return { allowed: true };
  }

  break(eventId: string): void {
    this.brokenCircuits.set(eventId, Date.now());
  }

  isOpen(eventId: string): boolean {
    const breakTimestamp = this.brokenCircuits.get(eventId);
    if (breakTimestamp === undefined) {
      return false;
    }

    if (Date.now() - breakTimestamp >= this.resetTimeoutMs) {
      this.brokenCircuits.delete(eventId);
      return false;
    }

    return true;
  }

  reset(): void {
    this.brokenCircuits.clear();
  }
}

export { EventEnvelope, EventMetadata, CircuitBreaker };