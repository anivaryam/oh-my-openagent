/**
 * Event Taxonomy Types for oh-my-openagent Orchestration Infrastructure
 * Phase 1: In-memory event types only (no persistence/distributed)
 */

// ============================================================================
// Event Type Strings
// ============================================================================

export type AgentEventTypeString =
  | 'agent.spawn'
  | 'agent.message'
  | 'agent.complete'
  | 'agent.error'
  | 'agent.terminate';

export type TaskEventTypeString =
  | 'task.assigned'
  | 'task.progress'
  | 'task.complete'
  | 'task.error';

export type SessionEventTypeString =
  | 'session.started'
  | 'session.ended';

export type SystemEventTypeString =
  | 'system.shutdown'
  | 'system.error';

export type EventType = AgentEventTypeString | TaskEventTypeString | SessionEventTypeString | SystemEventTypeString;

// ============================================================================
// Agent Events (Discriminated Unions)
// ============================================================================

export interface AgentSpawnEvent {
  type: 'agent.spawn';
  agentId: string;
  sessionId: string;
  parentAgentId?: string;
}

export interface AgentMessageEvent {
  type: 'agent.message';
  agentId: string;
  content: string;
  messageType: 'text' | 'tool_call' | 'tool_result';
}

export interface AgentCompleteEvent {
  type: 'agent.complete';
  agentId: string;
  sessionId: string;
  exitCode: number;
  durationMs: number;
  result?: unknown;
}

export interface AgentErrorEvent {
  type: 'agent.error';
  agentId: string;
  error: string;
  recoverable: boolean;
}

export interface AgentTerminateEvent {
  type: 'agent.terminate';
  agentId: string;
  reason: 'user_request' | 'timeout' | 'error' | 'completion';
}

export type AgentEvent =
  | AgentSpawnEvent
  | AgentMessageEvent
  | AgentCompleteEvent
  | AgentErrorEvent
  | AgentTerminateEvent;

// ============================================================================
// Task Events (Discriminated Unions)
// ============================================================================

export interface TaskAssignedEvent {
  type: 'task.assigned';
  taskId: string;
  agentId: string;
}

export interface TaskProgressEvent {
  type: 'task.progress';
  taskId: string;
  progress: number;
}

export interface TaskCompleteEvent {
  type: 'task.complete';
  taskId: string;
  result: unknown;
}

export interface TaskErrorEvent {
  type: 'task.error';
  taskId: string;
  error: string;
  retryable: boolean;
}

export type TaskEvent =
  | TaskAssignedEvent
  | TaskProgressEvent
  | TaskCompleteEvent
  | TaskErrorEvent;

// ============================================================================
// Session Events (Discriminated Unions)
// ============================================================================

export interface SessionStartedEvent {
  type: 'session.started';
  sessionId: string;
}

export interface SessionEndedEvent {
  type: 'session.ended';
  sessionId: string;
  reason: string;
}

export type SessionEvent =
  | SessionStartedEvent
  | SessionEndedEvent;

// ============================================================================
// System Events (Discriminated Unions)
// ============================================================================

export interface SystemShutdownEvent {
  type: 'system.shutdown';
}

export interface SystemErrorEvent {
  type: 'system.error';
  error: string;
}

export type SystemEvent =
  | SystemShutdownEvent
  | SystemErrorEvent;

// ============================================================================
// Unified Event Type
// ============================================================================

export type EventData = AgentEvent | TaskEvent | SessionEvent | SystemEvent;