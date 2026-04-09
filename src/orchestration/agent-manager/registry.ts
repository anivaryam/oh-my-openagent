import { AgentState } from './state-machine';

export interface AgentConfig {
  name: string;
  model?: string;
  prompt?: string;
  options?: {
    maxSteps?: number;
    timeoutMs?: number;
  };
}

export interface AgentInstance {
  id: string;
  name: string;
  config: AgentConfig;
  state: AgentState;

  sessionID: string;
  parentID?: string;
  children: string[];

  createdAt: Date;
  lastActiveAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  maxSteps: number;
  currentSteps: number;
  timeoutMs: number;

  retryCount: number;
  maxRetries: number;
  lastError?: Error;

  abortController: AbortController;

  metadata: Record<string, unknown>;
}

export class AgentRegistry {
  private instances = new Map<string, AgentInstance>();

  register(instance: AgentInstance): void {
    this.instances.set(instance.id, instance);
  }

  get(id: string): AgentInstance | undefined {
    return this.instances.get(id);
  }

  list(sessionID?: string): AgentInstance[] {
    const all = Array.from(this.instances.values());
    if (sessionID === undefined) return all;
    return all.filter(a => a.sessionID === sessionID);
  }

  getChildren(parentID: string): AgentInstance[] {
    return Array.from(this.instances.values()).filter(a => a.parentID === parentID);
  }

  getByState(state: AgentState): AgentInstance[] {
    return Array.from(this.instances.values()).filter(a => a.state === state);
  }

  getRunning(): AgentInstance[] {
    return this.getByState(AgentState.Running);
  }

  update(id: string, patch: Partial<AgentInstance>): void {
    const instance = this.instances.get(id);
    if (instance) {
      Object.assign(instance, patch);
      instance.lastActiveAt = new Date();
    }
  }

  remove(id: string): void {
    this.instances.delete(id);
  }

  get size(): number {
    return this.instances.size;
  }
}