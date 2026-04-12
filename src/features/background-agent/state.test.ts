declare const require: (name: string) => any
const { describe, expect, it, beforeEach, mock } = require("bun:test")

const mockSubagentSessions = new Set<string>()

mock.module("../../shared", () => ({
  log: () => {},
}))

mock.module("../claude-code-session-state", () => ({
  subagentSessions: mockSubagentSessions,
}))

import { TaskStateManager } from "./state"
import type { BackgroundTask } from "./types"
import type { QueueItem } from "./constants"

function createTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    parentSessionID: "parent-1",
    parentMessageID: "msg-1",
    description: "test task",
    prompt: "do something",
    agent: "prometheus",
    status: "running",
    ...overrides,
  } as BackgroundTask
}

describe("TaskStateManager", () => {
  let manager: TaskStateManager

  beforeEach(() => {
    manager = new TaskStateManager()
    mockSubagentSessions.clear()
  })

  describe("getTask / addTask / removeTask", () => {
    it("#given a task is added #when getTask is called with its id #then returns the task", () => {
      const task = createTask({ id: "t1" })
      manager.addTask(task)
      expect(manager.getTask("t1")).toBe(task)
    })

    it("#given no tasks exist #when getTask is called with an unknown id #then returns undefined", () => {
      expect(manager.getTask("nonexistent")).toBeUndefined()
    })

    it("#given a task is added #when removeTask is called #then the task is deleted", () => {
      const task = createTask({ id: "t2" })
      manager.addTask(task)
      manager.removeTask("t2")
      expect(manager.getTask("t2")).toBeUndefined()
    })

    it("#given a task with a sessionID #when removeTask is called #then the sessionID is removed from subagentSessions", () => {
      const task = createTask({ id: "t3", sessionID: "session-abc" })
      mockSubagentSessions.add("session-abc")
      manager.addTask(task)
      manager.removeTask("t3")
      expect(mockSubagentSessions.has("session-abc")).toBe(false)
    })

    it("#given a task without a sessionID #when removeTask is called #then subagentSessions is not modified", () => {
      mockSubagentSessions.add("other-session")
      const task = createTask({ id: "t4" })
      manager.addTask(task)
      manager.removeTask("t4")
      expect(mockSubagentSessions.has("other-session")).toBe(true)
    })
  })

  describe("findBySession", () => {
    it("#given a task with a matching sessionID exists #when findBySession is called #then returns the task", () => {
      const task = createTask({ id: "t1", sessionID: "sess-1" })
      manager.addTask(task)
      expect(manager.findBySession("sess-1")).toBe(task)
    })

    it("#given no task matches the sessionID #when findBySession is called #then returns undefined", () => {
      const task = createTask({ id: "t1", sessionID: "sess-1" })
      manager.addTask(task)
      expect(manager.findBySession("sess-other")).toBeUndefined()
    })
  })

  describe("getTasksByParentSession", () => {
    it("#given tasks with matching parentSessionID exist #when getTasksByParentSession is called #then returns matching tasks", () => {
      const task1 = createTask({ id: "t1", parentSessionID: "parent-a" })
      const task2 = createTask({ id: "t2", parentSessionID: "parent-a" })
      const task3 = createTask({ id: "t3", parentSessionID: "parent-b" })
      manager.addTask(task1)
      manager.addTask(task2)
      manager.addTask(task3)

      const result = manager.getTasksByParentSession("parent-a")
      expect(result).toHaveLength(2)
      expect(result).toContain(task1)
      expect(result).toContain(task2)
    })

    it("#given no tasks match the parentSessionID #when getTasksByParentSession is called #then returns empty array", () => {
      const task = createTask({ id: "t1", parentSessionID: "parent-a" })
      manager.addTask(task)
      expect(manager.getTasksByParentSession("parent-z")).toEqual([])
    })
  })

  describe("getAllDescendantTasks", () => {
    it("#given direct child tasks exist #when getAllDescendantTasks is called #then returns direct children", () => {
      const child1 = createTask({ id: "c1", parentSessionID: "root-session" })
      const child2 = createTask({ id: "c2", parentSessionID: "root-session" })
      manager.addTask(child1)
      manager.addTask(child2)

      const result = manager.getAllDescendantTasks("root-session")
      expect(result).toHaveLength(2)
      expect(result).toContain(child1)
      expect(result).toContain(child2)
    })

    it("#given nested descendants exist #when getAllDescendantTasks is called #then returns all descendants recursively", () => {
      const taskA = createTask({ id: "a", parentSessionID: "root", sessionID: "session-a" })
      const taskB = createTask({ id: "b", parentSessionID: "session-a", sessionID: "session-b" })
      const taskC = createTask({ id: "c", parentSessionID: "session-b" })
      manager.addTask(taskA)
      manager.addTask(taskB)
      manager.addTask(taskC)

      const result = manager.getAllDescendantTasks("root")
      expect(result).toHaveLength(3)
      expect(result[0]).toBe(taskA)
      expect(result[1]).toBe(taskB)
      expect(result[2]).toBe(taskC)
    })

    it("#given no descendants exist #when getAllDescendantTasks is called #then returns empty array", () => {
      expect(manager.getAllDescendantTasks("no-children")).toEqual([])
    })
  })

  describe("getRunningTasks / getNonRunningTasks / hasRunningTasks", () => {
    it("#given mixed-status tasks #when getRunningTasks is called #then returns only running tasks", () => {
      const running = createTask({ id: "r1", status: "running" })
      const completed = createTask({ id: "r2", status: "completed" })
      const pending = createTask({ id: "r3", status: "pending" })
      manager.addTask(running)
      manager.addTask(completed)
      manager.addTask(pending)

      const result = manager.getRunningTasks()
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(running)
    })

    it("#given mixed-status tasks #when getNonRunningTasks is called #then returns only non-running tasks", () => {
      const running = createTask({ id: "r1", status: "running" })
      const completed = createTask({ id: "r2", status: "completed" })
      const pending = createTask({ id: "r3", status: "pending" })
      manager.addTask(running)
      manager.addTask(completed)
      manager.addTask(pending)

      const result = manager.getNonRunningTasks()
      expect(result).toHaveLength(2)
      expect(result).toContain(completed)
      expect(result).toContain(pending)
    })

    it("#given running tasks exist #when hasRunningTasks is called #then returns true", () => {
      const running = createTask({ id: "r1", status: "running" })
      manager.addTask(running)
      expect(manager.hasRunningTasks()).toBe(true)
    })

    it("#given no tasks exist #when hasRunningTasks is called #then returns false", () => {
      expect(manager.hasRunningTasks()).toBe(false)
    })

    it("#given only non-running tasks exist #when hasRunningTasks is called #then returns false", () => {
      const completed = createTask({ id: "r1", status: "completed" })
      manager.addTask(completed)
      expect(manager.hasRunningTasks()).toBe(false)
    })
  })

  describe("getConcurrencyKeyFromInput / getConcurrencyKeyFromTask", () => {
    it("#given input has a model #when getConcurrencyKeyFromInput is called #then returns providerID/modelID", () => {
      const input = {
        description: "test",
        prompt: "do it",
        agent: "prometheus",
        parentSessionID: "p1",
        parentMessageID: "m1",
        model: { providerID: "anthropic", modelID: "claude-4" },
      }
      expect(manager.getConcurrencyKeyFromInput(input as any)).toBe("anthropic/claude-4")
    })

    it("#given input has no model #when getConcurrencyKeyFromInput is called #then returns agent name", () => {
      const input = {
        description: "test",
        prompt: "do it",
        agent: "prometheus",
        parentSessionID: "p1",
        parentMessageID: "m1",
      }
      expect(manager.getConcurrencyKeyFromInput(input as any)).toBe("prometheus")
    })

    it("#given task has a model #when getConcurrencyKeyFromTask is called #then returns providerID/modelID", () => {
      const task = createTask({
        model: { providerID: "openai", modelID: "gpt-5" } as any,
      })
      expect(manager.getConcurrencyKeyFromTask(task)).toBe("openai/gpt-5")
    })

    it("#given task has no model #when getConcurrencyKeyFromTask is called #then returns agent name", () => {
      const task = createTask({ agent: "athena" })
      expect(manager.getConcurrencyKeyFromTask(task)).toBe("athena")
    })
  })

  describe("trackPendingTask / cleanupPendingByParent", () => {
    it("#given a parent and task id #when trackPendingTask is called #then adds to the pending set", () => {
      manager.trackPendingTask("parent-1", "task-1")
      const pending = manager.pendingByParent.get("parent-1")
      expect(pending).toBeDefined()
      expect(pending!.has("task-1")).toBe(true)
    })

    it("#given multiple tasks for same parent #when trackPendingTask is called #then all are tracked", () => {
      manager.trackPendingTask("parent-1", "task-1")
      manager.trackPendingTask("parent-1", "task-2")
      const pending = manager.pendingByParent.get("parent-1")
      expect(pending!.size).toBe(2)
    })

    it("#given a tracked pending task #when cleanupPendingByParent is called #then removes the task from pending", () => {
      manager.trackPendingTask("parent-1", "task-1")
      manager.trackPendingTask("parent-1", "task-2")
      const task = createTask({ id: "task-1", parentSessionID: "parent-1" })
      manager.cleanupPendingByParent(task)

      const pending = manager.pendingByParent.get("parent-1")
      expect(pending).toBeDefined()
      expect(pending!.has("task-1")).toBe(false)
      expect(pending!.has("task-2")).toBe(true)
    })

    it("#given the last pending task for a parent #when cleanupPendingByParent is called #then deletes the parent key", () => {
      manager.trackPendingTask("parent-1", "task-1")
      const task = createTask({ id: "task-1", parentSessionID: "parent-1" })
      manager.cleanupPendingByParent(task)
      expect(manager.pendingByParent.has("parent-1")).toBe(false)
    })

    it("#given a task with no parentSessionID #when cleanupPendingByParent is called #then it is a no-op", () => {
      manager.trackPendingTask("parent-1", "task-x")
      const task = createTask({ id: "task-x", parentSessionID: "" })
      manager.cleanupPendingByParent(task)
      // parentSessionID is falsy (""), so cleanupPendingByParent returns early
      // The original tracking under "parent-1" remains untouched
      expect(manager.pendingByParent.has("parent-1")).toBe(true)
    })
  })

  describe("markForNotification / getPendingNotifications / clearNotifications / clearNotificationsForTask", () => {
    it("#given a task #when markForNotification is called #then adds the task to the notifications queue", () => {
      const task = createTask({ id: "t1", parentSessionID: "parent-1" })
      manager.markForNotification(task)
      expect(manager.notifications.get("parent-1")).toEqual([task])
    })

    it("#given notifications exist #when getPendingNotifications is called #then returns tasks for that session", () => {
      const task1 = createTask({ id: "t1", parentSessionID: "parent-1" })
      const task2 = createTask({ id: "t2", parentSessionID: "parent-1" })
      manager.markForNotification(task1)
      manager.markForNotification(task2)

      const result = manager.getPendingNotifications("parent-1")
      expect(result).toHaveLength(2)
      expect(result[0]).toBe(task1)
      expect(result[1]).toBe(task2)
    })

    it("#given no notifications #when getPendingNotifications is called for unknown session #then returns empty array", () => {
      expect(manager.getPendingNotifications("unknown")).toEqual([])
    })

    it("#given notifications exist #when clearNotifications is called #then removes all for that session", () => {
      const task = createTask({ id: "t1", parentSessionID: "parent-1" })
      manager.markForNotification(task)
      manager.clearNotifications("parent-1")
      expect(manager.notifications.has("parent-1")).toBe(false)
    })

    it("#given notifications across sessions #when clearNotificationsForTask is called #then removes that specific task from all sessions", () => {
      const task1 = createTask({ id: "t1", parentSessionID: "parent-1" })
      const task2 = createTask({ id: "t2", parentSessionID: "parent-1" })
      const task3 = createTask({ id: "t1", parentSessionID: "parent-2" })
      manager.markForNotification(task1)
      manager.markForNotification(task2)
      manager.markForNotification(task3)

      manager.clearNotificationsForTask("t1")

      // parent-1 should only have task2 left
      const parent1Notifs = manager.getPendingNotifications("parent-1")
      expect(parent1Notifs).toHaveLength(1)
      expect(parent1Notifs[0].id).toBe("t2")

      // parent-2 had only task3 (id: t1), which was removed, so key should be deleted
      expect(manager.notifications.has("parent-2")).toBe(false)
    })
  })

  describe("addToQueue / getQueue / removeFromQueue", () => {
    it("#given a queue key #when addToQueue is called #then creates the queue and adds the item", () => {
      const task = createTask({ id: "q1" })
      const item: QueueItem = { task, input: {} as any }
      manager.addToQueue("key-1", item)

      const queue = manager.getQueue("key-1")
      expect(queue).toBeDefined()
      expect(queue).toHaveLength(1)
      expect(queue![0]).toBe(item)
    })

    it("#given no queue exists for a key #when getQueue is called #then returns undefined", () => {
      expect(manager.getQueue("nonexistent")).toBeUndefined()
    })

    it("#given items in a queue #when removeFromQueue is called with matching task id #then removes the item and returns true", () => {
      const task1 = createTask({ id: "q1" })
      const task2 = createTask({ id: "q2" })
      manager.addToQueue("key-1", { task: task1, input: {} as any })
      manager.addToQueue("key-1", { task: task2, input: {} as any })

      const result = manager.removeFromQueue("key-1", "q1")
      expect(result).toBe(true)

      const queue = manager.getQueue("key-1")
      expect(queue).toHaveLength(1)
      expect(queue![0].task.id).toBe("q2")
    })

    it("#given items in a queue #when removeFromQueue is called with non-matching id #then returns false", () => {
      const task = createTask({ id: "q1" })
      manager.addToQueue("key-1", { task, input: {} as any })
      expect(manager.removeFromQueue("key-1", "nonexistent")).toBe(false)
    })

    it("#given no queue for that key #when removeFromQueue is called #then returns false", () => {
      expect(manager.removeFromQueue("no-key", "any-id")).toBe(false)
    })

    it("#given one item in a queue #when removeFromQueue removes it #then deletes the key entirely", () => {
      const task = createTask({ id: "q1" })
      manager.addToQueue("key-1", { task, input: {} as any })
      manager.removeFromQueue("key-1", "q1")
      expect(manager.getQueue("key-1")).toBeUndefined()
    })
  })

  describe("completionTimers", () => {
    it("#given a timer is set #when clearCompletionTimer is called #then the timer is cleared and removed", () => {
      const timer = setTimeout(() => {}, 100000)
      manager.setCompletionTimer("t1", timer)
      expect(manager.completionTimers.has("t1")).toBe(true)

      manager.clearCompletionTimer("t1")
      expect(manager.completionTimers.has("t1")).toBe(false)
    })

    it("#given no timer exists #when clearCompletionTimer is called #then it is a no-op", () => {
      manager.clearCompletionTimer("nonexistent")
      expect(manager.completionTimers.size).toBe(0)
    })

    it("#given multiple timers are set #when clearAllCompletionTimers is called #then all timers are cleared", () => {
      const timer1 = setTimeout(() => {}, 100000)
      const timer2 = setTimeout(() => {}, 100000)
      manager.setCompletionTimer("t1", timer1)
      manager.setCompletionTimer("t2", timer2)
      expect(manager.completionTimers.size).toBe(2)

      manager.clearAllCompletionTimers()
      expect(manager.completionTimers.size).toBe(0)
    })
  })

  describe("cancelPendingTask", () => {
    it("#given an unknown task id #when cancelPendingTask is called #then returns false", () => {
      expect(manager.cancelPendingTask("unknown")).toBe(false)
    })

    it("#given a non-pending task #when cancelPendingTask is called #then returns false", () => {
      const task = createTask({ id: "t1", status: "running" })
      manager.addTask(task)
      expect(manager.cancelPendingTask("t1")).toBe(false)
    })

    it("#given a pending task in a queue #when cancelPendingTask is called #then returns true and cancels the task", () => {
      const task = createTask({
        id: "t1",
        status: "pending",
        agent: "prometheus",
        parentSessionID: "parent-1",
      })
      manager.addTask(task)
      manager.trackPendingTask("parent-1", "t1")
      manager.addToQueue("prometheus", { task, input: {} as any })

      const result = manager.cancelPendingTask("t1")

      expect(result).toBe(true)
      expect(task.status).toBe("cancelled")
      expect(task.completedAt).toBeInstanceOf(Date)
      // Queue should be cleaned up (the only item was removed, so key deleted)
      expect(manager.getQueue("prometheus")).toBeUndefined()
      // Pending by parent should be cleaned up
      expect(manager.pendingByParent.has("parent-1")).toBe(false)
    })

    it("#given a pending task with a model #when cancelPendingTask is called #then uses model-based concurrency key", () => {
      const task = createTask({
        id: "t1",
        status: "pending",
        agent: "prometheus",
        model: { providerID: "anthropic", modelID: "claude-4" } as any,
      })
      manager.addTask(task)
      manager.addToQueue("anthropic/claude-4", { task, input: {} as any })

      const result = manager.cancelPendingTask("t1")

      expect(result).toBe(true)
      expect(task.status).toBe("cancelled")
      expect(manager.getQueue("anthropic/claude-4")).toBeUndefined()
    })
  })

  describe("clear", () => {
    it("#given populated state #when clear is called #then all maps and sets are emptied", () => {
      const task = createTask({ id: "t1", status: "running" })
      manager.addTask(task)
      manager.markForNotification(task)
      manager.trackPendingTask("parent-1", "t1")
      manager.addToQueue("key-1", { task, input: {} as any })
      manager.processingKeys.add("key-1")
      manager.setCompletionTimer("t1", setTimeout(() => {}, 100000))

      manager.clear()

      expect(manager.tasks.size).toBe(0)
      expect(manager.notifications.size).toBe(0)
      expect(manager.pendingByParent.size).toBe(0)
      expect(manager.queuesByKey.size).toBe(0)
      expect(manager.processingKeys.size).toBe(0)
      expect(manager.completionTimers.size).toBe(0)
    })
  })
})
