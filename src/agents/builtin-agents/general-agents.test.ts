import { describe, expect, it, beforeEach, mock } from "bun:test"

// Mock shared imports
const mockIsModelAvailable = mock((model: string, available: Set<string>) => available.has(model))
mock.module("../../shared", () => ({
  AGENT_MODEL_REQUIREMENTS: {
    oracle: {
      fallbackChain: [{ providers: ["anthropic"], model: "claude-sonnet-4-6" }],
    },
    explore: {
      fallbackChain: [{ providers: ["anthropic"], model: "claude-sonnet-4-6" }],
    },
    librarian: {
      fallbackChain: [{ providers: ["anthropic"], model: "claude-sonnet-4-6" }],
    },
    "restricted-agent": {
      fallbackChain: [{ providers: ["anthropic"], model: "claude-opus-4-6" }],
      requiresModel: "claude-opus-4-6",
    },
  },
  isModelAvailable: mockIsModelAvailable,
}))

mock.module("../../shared/logger", () => ({
  log: mock(() => {}),
}))

// Mock agent-builder
const mockBuildAgent = mock((source: any, model: string) => ({
  model,
  prompt: `prompt for ${model}`,
  description: "test agent",
}))
const mockIsFactory = mock((source: any) => typeof source === "function")
mock.module("../agent-builder", () => ({
  buildAgent: mockBuildAgent,
  isFactory: mockIsFactory,
}))

// Mock agent-overrides
const mockApplyOverrides = mock((config: any) => config)
mock.module("./agent-overrides", () => ({
  applyOverrides: mockApplyOverrides,
}))

// Mock environment-context
const mockApplyEnvironmentContext = mock((config: any) => ({ ...config, prompt: config.prompt + " [env]" }))
mock.module("./environment-context", () => ({
  applyEnvironmentContext: mockApplyEnvironmentContext,
}))

// Mock model-resolution
const mockApplyModelResolution = mock((input: any) => {
  if (input.userModel) return { model: input.userModel, provenance: "override" }
  return { model: "anthropic/claude-sonnet-4-6", provenance: "fallback" }
})
const mockGetFirstFallbackModel = mock(() => ({ model: "anthropic/claude-sonnet-4-6", provenance: "provider-fallback" }))
mock.module("./model-resolution", () => ({
  applyModelResolution: mockApplyModelResolution,
  getFirstFallbackModel: mockGetFirstFallbackModel,
}))

import { collectPendingBuiltinAgents } from "./general-agents"

function createAgentFactory(mode: "primary" | "subagent" = "subagent") {
  const factory = Object.assign(
    (model: string) => ({ model, prompt: `generated for ${model}`, description: "test" }),
    { mode }
  )
  return factory
}

function createDefaultInput(overrides: any = {}) {
  return {
    agentSources: {
      oracle: createAgentFactory("subagent"),
      explore: createAgentFactory("subagent"),
      librarian: createAgentFactory("subagent"),
    } as any,
    agentMetadata: {
      oracle: { category: "advisor", description: "Oracle agent" },
      explore: { category: "exploration", description: "Explore agent" },
    } as any,
    disabledAgents: [],
    agentOverrides: {},
    mergedCategories: {},
    availableModels: new Set(["claude-sonnet-4-6", "claude-opus-4-6"]),
    isFirstRunNoCache: false,
    ...overrides,
  }
}

describe("collectPendingBuiltinAgents", () => {
  beforeEach(() => {
    mockIsModelAvailable.mockClear()
    mockBuildAgent.mockClear()
    mockIsFactory.mockClear()
    mockApplyOverrides.mockClear()
    mockApplyEnvironmentContext.mockClear()
    mockApplyModelResolution.mockClear()
    mockGetFirstFallbackModel.mockClear()
  })

  it("#given valid agent sources #when collectPendingBuiltinAgents called #then returns pendingAgentConfigs map with all non-skipped agents", () => {
    const input = createDefaultInput()

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.size).toBe(3)
    expect(pendingAgentConfigs.has("oracle")).toBe(true)
    expect(pendingAgentConfigs.has("explore")).toBe(true)
    expect(pendingAgentConfigs.has("librarian")).toBe(true)
  })

  it("#given agents named sisyphus, hephaestus, atlas, sisyphus-junior in sources #when called #then these are skipped", () => {
    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("subagent"),
        sisyphus: createAgentFactory("subagent"),
        hephaestus: createAgentFactory("subagent"),
        atlas: createAgentFactory("subagent"),
        "sisyphus-junior": createAgentFactory("subagent"),
      },
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.size).toBe(1)
    expect(pendingAgentConfigs.has("oracle")).toBe(true)
    expect(pendingAgentConfigs.has("sisyphus")).toBe(false)
    expect(pendingAgentConfigs.has("hephaestus")).toBe(false)
    expect(pendingAgentConfigs.has("atlas")).toBe(false)
    expect(pendingAgentConfigs.has("sisyphus-junior")).toBe(false)
  })

  it("#given agent in disabledAgents list #when called #then that agent is excluded from results", () => {
    const input = createDefaultInput({
      disabledAgents: ["oracle"],
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.has("oracle")).toBe(false)
    expect(pendingAgentConfigs.has("explore")).toBe(true)
    expect(pendingAgentConfigs.has("librarian")).toBe(true)
  })

  it("#given agent in disabledAgents with different casing #when called #then still excluded (case-insensitive)", () => {
    const input = createDefaultInput({
      disabledAgents: ["ORACLE", "Explore"],
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.has("oracle")).toBe(false)
    expect(pendingAgentConfigs.has("explore")).toBe(false)
    expect(pendingAgentConfigs.has("librarian")).toBe(true)
  })

  it("#given agent with requiresModel that is NOT in availableModels #when called #then agent is excluded", () => {
    const input = createDefaultInput({
      agentSources: {
        "restricted-agent": createAgentFactory("subagent"),
      },
      availableModels: new Set(["claude-sonnet-4-6"]),
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.has("restricted-agent")).toBe(false)
    expect(mockIsModelAvailable).toHaveBeenCalledWith("claude-opus-4-6", input.availableModels)
  })

  it("#given agent with requiresModel that IS in availableModels #when called #then agent is included", () => {
    const input = createDefaultInput({
      agentSources: {
        "restricted-agent": createAgentFactory("subagent"),
      },
      availableModels: new Set(["claude-sonnet-4-6", "claude-opus-4-6"]),
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.has("restricted-agent")).toBe(true)
    expect(mockIsModelAvailable).toHaveBeenCalledWith("claude-opus-4-6", input.availableModels)
  })

  it("#given agent with agentMetadata #when called #then it appears in availableAgents array with name, description, and metadata", () => {
    const input = createDefaultInput()

    const { availableAgents } = collectPendingBuiltinAgents(input)

    const oracleEntry = availableAgents.find((a) => a.name === "oracle")
    expect(oracleEntry).toBeDefined()
    expect(oracleEntry!.description).toBe("test agent")
    expect(oracleEntry!.metadata).toEqual({ category: "advisor", description: "Oracle agent" })

    const exploreEntry = availableAgents.find((a) => a.name === "explore")
    expect(exploreEntry).toBeDefined()
    expect(exploreEntry!.metadata).toEqual({ category: "exploration", description: "Explore agent" })
  })

  it("#given agent WITHOUT agentMetadata #when called #then it is in pendingAgentConfigs but NOT in availableAgents", () => {
    const input = createDefaultInput()

    const { pendingAgentConfigs, availableAgents } = collectPendingBuiltinAgents(input)

    // librarian has no metadata entry in the default input
    expect(pendingAgentConfigs.has("librarian")).toBe(true)
    const librarianEntry = availableAgents.find((a) => a.name === "librarian")
    expect(librarianEntry).toBeUndefined()
  })

  it("#given librarian agent #when called #then applyEnvironmentContext is called for it", () => {
    const input = createDefaultInput()

    collectPendingBuiltinAgents(input)

    expect(mockApplyEnvironmentContext).toHaveBeenCalled()
    const calls = mockApplyEnvironmentContext.mock.calls
    const librarianCall = calls.find((call: any[]) => {
      const config = call[0]
      return config && config.prompt && config.prompt.includes("prompt for")
    })
    expect(librarianCall).toBeDefined()
  })

  it("#given non-librarian agent (e.g., oracle) #when called #then applyEnvironmentContext is NOT called for it", () => {
    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("subagent"),
      },
    })

    collectPendingBuiltinAgents(input)

    expect(mockApplyEnvironmentContext).not.toHaveBeenCalled()
  })

  it("#given agent override with model #when model resolution fails #then uses override model as-is (the fallback path)", () => {
    mockApplyModelResolution.mockImplementation(() => null)

    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("subagent"),
      },
      agentOverrides: {
        oracle: { model: "custom/my-model" },
      },
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.has("oracle")).toBe(true)
    expect(mockBuildAgent).toHaveBeenCalled()
    const buildCall = mockBuildAgent.mock.calls[0]
    expect(buildCall[1]).toBe("custom/my-model")
    // getFirstFallbackModel should NOT have been called since override.model was present
    expect(mockGetFirstFallbackModel).not.toHaveBeenCalled()
  })

  it("#given model resolution returns null and no override #when called #then getFirstFallbackModel is used", () => {
    mockApplyModelResolution.mockImplementation(() => null)

    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("subagent"),
      },
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(mockGetFirstFallbackModel).toHaveBeenCalled()
    expect(pendingAgentConfigs.has("oracle")).toBe(true)
  })

  it("#given model resolution returns null and getFirstFallbackModel returns null #when called #then agent is skipped", () => {
    mockApplyModelResolution.mockImplementation(() => null)
    mockGetFirstFallbackModel.mockImplementation(() => null)

    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("subagent"),
      },
    })

    const { pendingAgentConfigs } = collectPendingBuiltinAgents(input)

    expect(pendingAgentConfigs.has("oracle")).toBe(false)
    expect(pendingAgentConfigs.size).toBe(0)
  })

  it("#given primary agent factory with uiSelectedModel #when called #then uiSelectedModel is passed to model resolution", () => {
    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("primary"),
      },
      uiSelectedModel: "anthropic/claude-opus-4-6",
    })

    collectPendingBuiltinAgents(input)

    expect(mockApplyModelResolution).toHaveBeenCalled()
    const call = mockApplyModelResolution.mock.calls[0]
    expect(call[0].uiSelectedModel).toBe("anthropic/claude-opus-4-6")
  })

  it("#given subagent factory #when called #then uiSelectedModel is NOT passed to model resolution", () => {
    const input = createDefaultInput({
      agentSources: {
        oracle: createAgentFactory("subagent"),
      },
      uiSelectedModel: "anthropic/claude-opus-4-6",
    })

    collectPendingBuiltinAgents(input)

    expect(mockApplyModelResolution).toHaveBeenCalled()
    const call = mockApplyModelResolution.mock.calls[0]
    expect(call[0].uiSelectedModel).toBeUndefined()
  })
})
