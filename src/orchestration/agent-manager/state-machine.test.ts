import { describe, expect, it } from "bun:test";
import {
  AgentState,
  InvalidTransitionError,
  validateTransition,
  isTerminalState,
  getValidNextStates,
} from "./state-machine";

describe("validateTransition", () => {
  describe("valid transitions from Created", () => {
    it("#given Created state #when transitioning to Running #then does not throw", () => {
      expect(() => validateTransition(AgentState.Created, AgentState.Running)).not.toThrow();
    });

    it("#given Created state #when transitioning to Crashed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Created, AgentState.Crashed)).not.toThrow();
    });
  });

  describe("valid transitions from Running", () => {
    it("#given Running state #when transitioning to Idle #then does not throw", () => {
      expect(() => validateTransition(AgentState.Running, AgentState.Idle)).not.toThrow();
    });

    it("#given Running state #when transitioning to Waiting #then does not throw", () => {
      expect(() => validateTransition(AgentState.Running, AgentState.Waiting)).not.toThrow();
    });

    it("#given Running state #when transitioning to Paused #then does not throw", () => {
      expect(() => validateTransition(AgentState.Running, AgentState.Paused)).not.toThrow();
    });

    it("#given Running state #when transitioning to Completed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Running, AgentState.Completed)).not.toThrow();
    });

    it("#given Running state #when transitioning to Crashed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Running, AgentState.Crashed)).not.toThrow();
    });

    it("#given Running state #when transitioning to Timeout #then does not throw", () => {
      expect(() => validateTransition(AgentState.Running, AgentState.Timeout)).not.toThrow();
    });
  });

  describe("valid transitions from Idle", () => {
    it("#given Idle state #when transitioning to Running #then does not throw", () => {
      expect(() => validateTransition(AgentState.Idle, AgentState.Running)).not.toThrow();
    });

    it("#given Idle state #when transitioning to Paused #then does not throw", () => {
      expect(() => validateTransition(AgentState.Idle, AgentState.Paused)).not.toThrow();
    });

    it("#given Idle state #when transitioning to Completed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Idle, AgentState.Completed)).not.toThrow();
    });
  });

  describe("valid transitions from Waiting", () => {
    it("#given Waiting state #when transitioning to Idle #then does not throw", () => {
      expect(() => validateTransition(AgentState.Waiting, AgentState.Idle)).not.toThrow();
    });

    it("#given Waiting state #when transitioning to Running #then does not throw", () => {
      expect(() => validateTransition(AgentState.Waiting, AgentState.Running)).not.toThrow();
    });

    it("#given Waiting state #when transitioning to Crashed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Waiting, AgentState.Crashed)).not.toThrow();
    });
  });

  describe("valid transitions from Paused", () => {
    it("#given Paused state #when transitioning to Idle #then does not throw", () => {
      expect(() => validateTransition(AgentState.Paused, AgentState.Idle)).not.toThrow();
    });

    it("#given Paused state #when transitioning to Crashed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Paused, AgentState.Crashed)).not.toThrow();
    });
  });

  describe("valid self-loop transitions for terminal states", () => {
    it("#given Completed state #when transitioning to Completed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Completed, AgentState.Completed)).not.toThrow();
    });

    it("#given Crashed state #when transitioning to Crashed #then does not throw", () => {
      expect(() => validateTransition(AgentState.Crashed, AgentState.Crashed)).not.toThrow();
    });

    it("#given Timeout state #when transitioning to Timeout #then does not throw", () => {
      expect(() => validateTransition(AgentState.Timeout, AgentState.Timeout)).not.toThrow();
    });
  });

  describe("invalid transitions", () => {
    it("#given Created state #when transitioning to Completed #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Created, AgentState.Completed)).toThrow(InvalidTransitionError);
    });

    it("#given Created state #when transitioning to Idle #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Created, AgentState.Idle)).toThrow(InvalidTransitionError);
    });

    it("#given Idle state #when transitioning to Timeout #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Idle, AgentState.Timeout)).toThrow(InvalidTransitionError);
    });

    it("#given Idle state #when transitioning to Waiting #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Idle, AgentState.Waiting)).toThrow(InvalidTransitionError);
    });

    it("#given Paused state #when transitioning to Running #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Paused, AgentState.Running)).toThrow(InvalidTransitionError);
    });

    it("#given Paused state #when transitioning to Completed #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Paused, AgentState.Completed)).toThrow(InvalidTransitionError);
    });

    it("#given Completed state #when transitioning to Running #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Completed, AgentState.Running)).toThrow(InvalidTransitionError);
    });

    it("#given Completed state #when transitioning to Idle #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Completed, AgentState.Idle)).toThrow(InvalidTransitionError);
    });

    it("#given Crashed state #when transitioning to Running #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Crashed, AgentState.Running)).toThrow(InvalidTransitionError);
    });

    it("#given Crashed state #when transitioning to Idle #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Crashed, AgentState.Idle)).toThrow(InvalidTransitionError);
    });

    it("#given Timeout state #when transitioning to Running #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Timeout, AgentState.Running)).toThrow(InvalidTransitionError);
    });

    it("#given Timeout state #when transitioning to Idle #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Timeout, AgentState.Idle)).toThrow(InvalidTransitionError);
    });

    it("#given Waiting state #when transitioning to Completed #then throws InvalidTransitionError", () => {
      expect(() => validateTransition(AgentState.Waiting, AgentState.Completed)).toThrow(InvalidTransitionError);
    });
  });
});

describe("InvalidTransitionError", () => {
  it("#given an invalid transition #when the error is thrown #then it has the correct message format", () => {
    const error = new InvalidTransitionError(AgentState.Created, AgentState.Completed);
    expect(error.message).toBe("Invalid state transition: created -> completed");
  });

  it("#given an invalid transition #when the error is thrown #then it has the name InvalidTransitionError", () => {
    const error = new InvalidTransitionError(AgentState.Paused, AgentState.Running);
    expect(error.name).toBe("InvalidTransitionError");
  });

  it("#given an invalid transition #when the error is thrown #then it is an instance of Error", () => {
    const error = new InvalidTransitionError(AgentState.Idle, AgentState.Timeout);
    expect(error).toBeInstanceOf(Error);
  });

  it("#given an invalid transition #when the error is thrown #then it is an instance of InvalidTransitionError", () => {
    const error = new InvalidTransitionError(AgentState.Idle, AgentState.Timeout);
    expect(error).toBeInstanceOf(InvalidTransitionError);
  });

  it("#given validateTransition throws #when catching the error #then it contains the from and to states in the message", () => {
    try {
      validateTransition(AgentState.Timeout, AgentState.Running);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as InvalidTransitionError).message).toBe("Invalid state transition: timeout -> running");
      expect((e as InvalidTransitionError).name).toBe("InvalidTransitionError");
    }
  });
});

describe("isTerminalState", () => {
  it("#given Completed state #when checking if terminal #then returns true", () => {
    expect(isTerminalState(AgentState.Completed)).toBe(true);
  });

  it("#given Crashed state #when checking if terminal #then returns true", () => {
    expect(isTerminalState(AgentState.Crashed)).toBe(true);
  });

  it("#given Timeout state #when checking if terminal #then returns true", () => {
    expect(isTerminalState(AgentState.Timeout)).toBe(true);
  });

  it("#given Created state #when checking if terminal #then returns false", () => {
    expect(isTerminalState(AgentState.Created)).toBe(false);
  });

  it("#given Running state #when checking if terminal #then returns false", () => {
    expect(isTerminalState(AgentState.Running)).toBe(false);
  });

  it("#given Idle state #when checking if terminal #then returns false", () => {
    expect(isTerminalState(AgentState.Idle)).toBe(false);
  });

  it("#given Waiting state #when checking if terminal #then returns false", () => {
    expect(isTerminalState(AgentState.Waiting)).toBe(false);
  });

  it("#given Paused state #when checking if terminal #then returns false", () => {
    expect(isTerminalState(AgentState.Paused)).toBe(false);
  });
});

describe("getValidNextStates", () => {
  it("#given Created state #when getting valid next states #then returns Running and Crashed", () => {
    const result = getValidNextStates(AgentState.Created);
    expect(result).toContain(AgentState.Running);
    expect(result).toContain(AgentState.Crashed);
    expect(result).toHaveLength(2);
  });

  it("#given Running state #when getting valid next states #then returns Idle, Waiting, Paused, Completed, Crashed, Timeout", () => {
    const result = getValidNextStates(AgentState.Running);
    expect(result).toContain(AgentState.Idle);
    expect(result).toContain(AgentState.Waiting);
    expect(result).toContain(AgentState.Paused);
    expect(result).toContain(AgentState.Completed);
    expect(result).toContain(AgentState.Crashed);
    expect(result).toContain(AgentState.Timeout);
    expect(result).toHaveLength(6);
  });

  it("#given Idle state #when getting valid next states #then returns Running, Paused, Completed", () => {
    const result = getValidNextStates(AgentState.Idle);
    expect(result).toContain(AgentState.Running);
    expect(result).toContain(AgentState.Paused);
    expect(result).toContain(AgentState.Completed);
    expect(result).toHaveLength(3);
  });

  it("#given Waiting state #when getting valid next states #then returns Idle, Running, Crashed", () => {
    const result = getValidNextStates(AgentState.Waiting);
    expect(result).toContain(AgentState.Idle);
    expect(result).toContain(AgentState.Running);
    expect(result).toContain(AgentState.Crashed);
    expect(result).toHaveLength(3);
  });

  it("#given Paused state #when getting valid next states #then returns Idle and Crashed", () => {
    const result = getValidNextStates(AgentState.Paused);
    expect(result).toContain(AgentState.Idle);
    expect(result).toContain(AgentState.Crashed);
    expect(result).toHaveLength(2);
  });

  it("#given Completed state #when getting valid next states #then returns only Completed", () => {
    const result = getValidNextStates(AgentState.Completed);
    expect(result).toEqual([AgentState.Completed]);
  });

  it("#given Crashed state #when getting valid next states #then returns only Crashed", () => {
    const result = getValidNextStates(AgentState.Crashed);
    expect(result).toEqual([AgentState.Crashed]);
  });

  it("#given Timeout state #when getting valid next states #then returns only Timeout", () => {
    const result = getValidNextStates(AgentState.Timeout);
    expect(result).toEqual([AgentState.Timeout]);
  });
});
