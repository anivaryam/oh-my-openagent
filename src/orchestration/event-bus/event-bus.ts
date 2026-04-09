import { CircuitBreaker, EventEnvelope, EventMetadata } from './circuit-breaker';
import { DeadLetterQueue } from './dead-letter';

interface Subscription {
  id: string;
  eventType: string;
  handler: (envelope: EventEnvelope) => void | Promise<void>;
}

interface SubscribeOptions {
  subscriber?: string;
  filter?: (envelope: EventEnvelope) => boolean;
}

interface PublishOptions {
  correlationId?: string;
  causationId?: string;
  requireAck?: boolean;
}

class EventBus {
  private subscriptions: Map<string, Set<Subscription>>;
  private circuitBreaker: CircuitBreaker;
  private deadLetterQueue: DeadLetterQueue;
  private subscriptionIdCounter: number;

  constructor(maxHops: number = 10, deadLetterMaxSize: number = 100) {
    this.subscriptions = new Map();
    this.circuitBreaker = new CircuitBreaker(maxHops);
    this.deadLetterQueue = new DeadLetterQueue(deadLetterMaxSize);
    this.subscriptionIdCounter = 0;
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${++this.subscriptionIdCounter}`;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + '.') || eventType === prefix;
    }
    return eventType === pattern;
  }

  subscribe<T = unknown>(
    eventType: string,
    handler: (envelope: EventEnvelope<T>) => void | Promise<void>,
    options?: SubscribeOptions
  ): () => void {
    const id = this.generateSubscriptionId();
    
    const subscription: Subscription = {
      id,
      eventType,
      handler: handler as (envelope: EventEnvelope) => void | Promise<void>,
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }

    const subs = this.subscriptions.get(eventType)!;
    subs.add(subscription);

    return () => {
      this.unsubscribe(id);
    };
  }

  publish<T>(
    eventType: string,
    data: T,
    options?: PublishOptions
  ): EventEnvelope<T> {
    const eventId = this.generateEventId();
    const timestamp = Date.now();

    const metadata: EventMetadata = {
      eventId,
      eventType,
      timestamp,
      version: '1.0',
      correlationId: options?.correlationId,
      causationId: options?.causationId,
      hopCount: 0,
    };

    let acked = false;
    const envelope: EventEnvelope<T> = {
      metadata,
      data,
      ack: options?.requireAck ? () => {
        acked = true;
      } : undefined,
    };

    const check = this.circuitBreaker.check(metadata);
    if (!check.allowed) {
      this.deadLetterQueue.add(envelope, new Error(check.reason || 'circuit breaker blocked'));
      return envelope;
    }

    const matchingSubs = this.getMatchingSubscriptions(eventType);

    for (const sub of matchingSubs) {
      try {
        const result = sub.handler(envelope);
        if (result instanceof Promise) {
          result.catch((error) => {
            this.deadLetterQueue.add(envelope, error instanceof Error ? error : new Error(String(error)));
          });
        }
      } catch (error) {
        this.deadLetterQueue.add(envelope, error instanceof Error ? error : new Error(String(error)));
      }
    }

    return envelope;
  }

  private getMatchingSubscriptions(eventType: string): Subscription[] {
    const results: Subscription[] = [];

    const directSubs = this.subscriptions.get(eventType);
    if (directSubs) {
      results.push(...directSubs);
    }

    for (const [pattern, subs] of this.subscriptions.entries()) {
      if (pattern !== eventType && this.matchesPattern(eventType, pattern)) {
        results.push(...subs);
      }
    }

    return results;
  }

  unsubscribe(subscriptionId: string): void {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (sub.id === subscriptionId) {
          subs.delete(sub);
          if (subs.size === 0) {
            this.subscriptions.delete(eventType);
          }
          return;
        }
      }
    }
  }

  getSubscriptions(eventType?: string): Subscription[] {
    if (eventType) {
      const subs = this.subscriptions.get(eventType);
      return subs ? [...subs] : [];
    }

    const all: Subscription[] = [];
    for (const subs of this.subscriptions.values()) {
      all.push(...subs);
    }
    return all;
  }

  getSubscriberCount(eventType?: string): number {
    if (eventType) {
      const subs = this.subscriptions.get(eventType);
      return subs ? subs.size : 0;
    }

    let total = 0;
    for (const subs of this.subscriptions.values()) {
      total += subs.size;
    }
    return total;
  }

  getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue;
  }

  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }
}

export { EventBus, Subscription, SubscribeOptions, PublishOptions };