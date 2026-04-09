import { AgentManager } from './agent-manager';
import { AgentState } from './state-machine';
import { EventBus } from '../event-bus/event-bus';

interface Session {
  id: string;
  parentID?: string;
  children(): string[];
  fork(messageID?: string): Session;
  abort(): void;
}

interface SessionAPI {
  children(sessionID: string): string[];
  fork(sessionID: string, messageID?: string): Session;
  abort(sessionID: string): void;
}

export class GlobalAgentRegistry {
  private managers = new Map<string, AgentManager>();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  getOrCreate(sessionID: string): AgentManager {
    if (!this.managers.has(sessionID)) {
      const manager = new AgentManager(sessionID, this.eventBus);
      this.managers.set(sessionID, manager);
    }
    return this.managers.get(sessionID)!;
  }

  get(sessionID: string): AgentManager | undefined {
    return this.managers.get(sessionID);
  }

  dispose(sessionID: string): void {
    const manager = this.managers.get(sessionID);
    if (manager) {
      for (const agent of manager.listAgents()) {
        manager.kill(agent.id, 'Session disposed');
      }
      this.managers.delete(sessionID);
    }
  }

  listSessions(): string[] {
    return Array.from(this.managers.keys());
  }
}

export class SessionWrapper {
  private session: Session;
  private manager: AgentManager;

  constructor(session: Session, manager: AgentManager) {
    this.session = session;
    this.manager = manager;
  }

  fork(messageID?: string): SessionWrapper {
    const childSession = this.session.fork(messageID);
    return new SessionWrapper(childSession, this.manager);
  }

  abort(): void {
    this.session.abort();
  }

  syncChildren(): void {
    const childIDs = this.session.children();
    for (const childID of childIDs) {
      if (!this.manager.getAgent(childID)) {
        console.log(`[SessionWrapper] Syncing child session: ${childID}`);
      }
    }
  }

  getManager(): AgentManager {
    return this.manager;
  }

  getSessionId(): string {
    return this.session.id;
  }
}