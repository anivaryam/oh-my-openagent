import { EventEnvelope } from './circuit-breaker';

interface DeadLetterItem {
  event: EventEnvelope<unknown>;
  error: Error;
  timestamp: number;
}

type DeadLetterHandler = (item: DeadLetterItem) => void | Promise<void>;

class DeadLetterQueue {
  private items: DeadLetterItem[] = [];
  private maxSize: number;
  private handlers: DeadLetterHandler[];

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
    this.handlers = [];
  }

  add(envelope: EventEnvelope<unknown>, error: Error): void {
    const item: DeadLetterItem = {
      event: envelope,
      error,
      timestamp: Date.now(),
    };

    if (this.items.length >= this.maxSize) {
      this.items.shift();
    }

    this.items.push(item);

    console.warn('[DeadLetter]', item.event.metadata.eventType, error.message);
    for (const handler of this.handlers) {
      const result = handler(item);
      if (result instanceof Promise) {
        result.catch?.(console.error);
      }
    }
  }

  getAll(): DeadLetterItem[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  onDeadLetter(handler: DeadLetterHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  get size(): number {
    return this.items.length;
  }
}

export { DeadLetterItem, DeadLetterHandler, DeadLetterQueue };