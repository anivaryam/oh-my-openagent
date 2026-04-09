export enum AgentState {
  Created = "created",
  Running = "running",
  Idle = "idle",
  Waiting = "waiting",
  Paused = "paused",
  Completed = "completed",
  Crashed = "crashed",
  Timeout = "timeout"
}

const VALID_TRANSITIONS = new Map<AgentState, Set<AgentState>>();
VALID_TRANSITIONS.set(AgentState.Created, new Set([AgentState.Running, AgentState.Crashed]));
VALID_TRANSITIONS.set(AgentState.Running, new Set([AgentState.Idle, AgentState.Waiting, AgentState.Paused, AgentState.Completed, AgentState.Crashed, AgentState.Timeout]));
VALID_TRANSITIONS.set(AgentState.Idle, new Set([AgentState.Running, AgentState.Paused, AgentState.Completed]));
VALID_TRANSITIONS.set(AgentState.Waiting, new Set([AgentState.Idle, AgentState.Running, AgentState.Crashed]));
VALID_TRANSITIONS.set(AgentState.Paused, new Set([AgentState.Idle, AgentState.Crashed]));
VALID_TRANSITIONS.set(AgentState.Completed, new Set([AgentState.Completed]));
VALID_TRANSITIONS.set(AgentState.Crashed, new Set([AgentState.Crashed]));
VALID_TRANSITIONS.set(AgentState.Timeout, new Set([AgentState.Timeout]));

export class InvalidTransitionError extends Error {
  constructor(from: AgentState, to: AgentState) {
    super(`Invalid state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function validateTransition(from: AgentState, to: AgentState): void {
  const validTargets = VALID_TRANSITIONS.get(from);
  if (!validTargets || !validTargets.has(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminalState(state: AgentState): boolean {
  return state === AgentState.Completed ||
         state === AgentState.Crashed ||
         state === AgentState.Timeout;
}

export function getValidNextStates(state: AgentState): AgentState[] {
  const validTargets = VALID_TRANSITIONS.get(state);
  return validTargets ? Array.from(validTargets) : [];
}