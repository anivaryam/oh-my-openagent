import { EventBus } from './event-bus/event-bus';
import { GlobalAgentRegistry } from './agent-manager/session-wrapper';

let globalEventBus: EventBus | null = null;
let globalRegistry: GlobalAgentRegistry | null = null;

export function createOrchestration(): {
  eventBus: EventBus;
  agentManager: GlobalAgentRegistry;
} {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  if (!globalRegistry) {
    globalRegistry = new GlobalAgentRegistry(globalEventBus);
  }
  return {
    eventBus: globalEventBus,
    agentManager: globalRegistry,
  };
}

export function getEventBus(): EventBus {
  if (!globalEventBus) {
    throw new Error('Orchestration not initialized. Call createOrchestration() first.');
  }
  return globalEventBus;
}

export function getAgentManager(sessionID: string) {
  if (!globalRegistry) {
    throw new Error('Orchestration not initialized. Call createOrchestration() first.');
  }
  return globalRegistry.getOrCreate(sessionID);
}

export function isOrchestrationInitialized(): boolean {
  return globalEventBus !== null && globalRegistry !== null;
}

export { EventBus } from './event-bus/event-bus';
export { GlobalAgentRegistry } from './agent-manager/session-wrapper';
export { AgentManager } from './agent-manager/agent-manager';
export type { AgentSpawnEvent, AgentCompleteEvent, AgentErrorEvent, AgentEvent } from './types/event-taxonomy';