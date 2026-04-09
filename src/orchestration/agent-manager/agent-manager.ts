import { AgentState, validateTransition, isTerminalState } from './state-machine';
import { AgentInstance, AgentRegistry, AgentConfig } from './registry';
import { EventBus } from '../event-bus/event-bus';

interface SpawnOptions {
  parentID?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class AgentManager {
  private registry: AgentRegistry;
  private eventBus: EventBus;
  private sessionID: string;

  constructor(sessionID: string, eventBus: EventBus) {
    this.sessionID = sessionID;
    this.eventBus = eventBus;
    this.registry = new AgentRegistry();
  }

  spawn(config: AgentConfig, options: SpawnOptions = {}): AgentInstance {
    const instance: AgentInstance = {
      id: this.generateId(),
      name: config.name,
      config,
      state: AgentState.Created,
      sessionID: this.sessionID,
      parentID: options.parentID,
      children: [],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      maxSteps: config.options?.maxSteps ?? 100,
      currentSteps: 0,
      timeoutMs: options.timeoutMs ?? config.options?.timeoutMs ?? 300_000,
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      abortController: new AbortController(),
      metadata: {},
    };

    this.registry.register(instance);

    if (instance.parentID) {
      const parent = this.registry.get(instance.parentID);
      if (parent) {
        parent.children.push(instance.id);
      }
    }

    this.eventBus.publish('agent.spawn', {
      agentId: instance.id,
      sessionId: this.sessionID,
      parentAgentId: instance.parentID,
    });

    return instance;
  }

  start(id: string): void {
    this.transitionTo(id, AgentState.Running);
    this.eventBus.publish('agent.started', { agentId: id, sessionId: this.sessionID });
  }

  pause(id: string): void {
    this.transitionTo(id, AgentState.Paused);
  }

  resume(id: string): void {
    this.transitionTo(id, AgentState.Idle);
  }

  kill(id: string, reason: string = 'manual'): void {
    const instance = this.registry.get(id);
    if (!instance) return;

    for (const childID of instance.children) {
      this.kill(childID, `Parent killed: ${reason}`);
    }

    instance.abortController.abort();

    this.transitionTo(id, AgentState.Crashed);

    this.registry.remove(id);

    this.eventBus.publish('agent.terminate', {
      agentId: id,
      reason: 'user_request'
    });
  }

  transitionTo(id: string, newState: AgentState): void {
    const instance = this.registry.get(id);
    if (!instance) return;

    const prevState = instance.state;

    validateTransition(prevState, newState);

    instance.state = newState;
    instance.lastActiveAt = new Date();

    if (newState === AgentState.Running && !instance.startedAt) {
      instance.startedAt = new Date();
    }

    if (isTerminalState(newState)) {
      instance.completedAt = new Date();
    }

    this.eventBus.publish('agent.state_change' as any, {
      agentId: id,
      from: prevState,
      to: newState
    });
  }

  incrementSteps(id: string): number {
    const instance = this.registry.get(id);
    if (!instance) return 0;

    instance.currentSteps++;
    instance.lastActiveAt = new Date();

    if (instance.currentSteps >= instance.maxSteps) {
      this.transitionTo(id, AgentState.Timeout);
      this.eventBus.publish('agent.terminate', { agentId: id, reason: 'timeout' });
    }

    return instance.currentSteps;
  }

  getAgent(id: string): AgentInstance | undefined {
    return this.registry.get(id);
  }

  listAgents(): AgentInstance[] {
    return this.registry.list();
  }

  getChildren(parentID: string): AgentInstance[] {
    return this.registry.getChildren(parentID);
  }

  private generateId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}