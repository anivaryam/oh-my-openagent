import type { PluginInput } from "@opencode-ai/plugin";
import {
	resolveActualContextLimit,
	type ContextLimitModelCacheState,
} from "./context-limit-resolver"
import { normalizeSDKResponse } from "./normalize-sdk-response"

const CHARS_PER_TOKEN_ESTIMATE = 4;
const DEFAULT_TARGET_MAX_TOKENS = 50_000;

/**
 * Models that benefit from directive-style truncation footers
 * instead of passive warnings. These models may ignore or misinterpret
 * simple "[truncated]" messages.
 */
function isSmallParameterModel(modelID: string): boolean {
	const name = modelID.toLowerCase()
	return (
		name.includes("minimax") ||
		name.includes("grok") ||
		name.includes("nano") ||
		name.includes("haiku") ||
		name.includes("flash") ||
		name.includes("glm")
	)
}

function buildTruncationFooter(removedCount: number, modelID?: string): string {
	if (modelID && isSmallParameterModel(modelID)) {
		return `\n\n<TRUNCATION_PROTOCOL>\nNOTICE: ${removedCount} lines were omitted from these results.\nREASON: Context window preservation.\nREQUIRED_ACTION: You MUST refine your search to be more specific. Add a path filter, use a tighter regex, or specify a file type.\nDO NOT assume the target is absent from the codebase.\n</TRUNCATION_PROTOCOL>`
	}
	return `\n\n[${removedCount} more lines truncated due to context window limit]`
}

function buildExhaustedFooter(modelID?: string): string {
	if (modelID && isSmallParameterModel(modelID)) {
		return "<TRUNCATION_PROTOCOL>\nNOTICE: Output suppressed - context window exhausted.\nREQUIRED_ACTION: You MUST use more targeted tool calls with narrower scope.\n</TRUNCATION_PROTOCOL>"
	}
	return "[Output suppressed - context window exhausted]"
}

interface AssistantMessageInfo {
	role: "assistant";
	providerID?: string;
	modelID?: string;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
}

interface MessageWrapper {
	info: { role: string } & Partial<AssistantMessageInfo>;
}

export interface TruncationResult {
	result: string;
	truncated: boolean;
	removedCount?: number;
}

export interface TruncationOptions {
	targetMaxTokens?: number;
	preserveHeaderLines?: number;
	contextWindowLimit?: number;
	/** Model ID for generating model-aware truncation footers */
	modelID?: string;
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function truncateToTokenLimit(
	output: string,
	maxTokens: number,
	preserveHeaderLines = 3,
	modelID?: string,
): TruncationResult {
	if (typeof output !== 'string') {
		return { result: String(output ?? ''), truncated: false };
	}

	const currentTokens = estimateTokens(output);

	if (currentTokens <= maxTokens) {
		return { result: output, truncated: false };
	}

	const lines = output.split("\n");

	if (lines.length <= preserveHeaderLines) {
		const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE;
		return {
			result:
				output.slice(0, maxChars) +
				"\n\n[Output truncated due to context window limit]",
			truncated: true,
		};
	}

	const headerLines = lines.slice(0, preserveHeaderLines);
	const contentLines = lines.slice(preserveHeaderLines);

	const headerText = headerLines.join("\n");
	const headerTokens = estimateTokens(headerText);
	const truncationMessageTokens = 50;
	const availableTokens = maxTokens - headerTokens - truncationMessageTokens;

	if (availableTokens <= 0) {
		return {
			result:
				headerText + "\n\n[Content truncated due to context window limit]",
			truncated: true,
			removedCount: contentLines.length,
		};
	}

	const resultLines: string[] = [];
	let currentTokenCount = 0;

	for (const line of contentLines) {
		const lineTokens = estimateTokens(line + "\n");
		if (currentTokenCount + lineTokens > availableTokens) {
			break;
		}
		resultLines.push(line);
		currentTokenCount += lineTokens;
	}

	const truncatedContent = [...headerLines, ...resultLines].join("\n");
	const removedCount = contentLines.length - resultLines.length;

	return {
		result:
			truncatedContent +
			buildTruncationFooter(removedCount, modelID),
		truncated: true,
		removedCount,
	};
}

export async function getContextWindowUsage(
	ctx: PluginInput,
	sessionID: string,
	modelCacheState?: ContextLimitModelCacheState,
): Promise<{
	usedTokens: number;
	remainingTokens: number;
	usagePercentage: number;
} | null> {
	try {
		const response = await ctx.client.session.messages({
			path: { id: sessionID },
		});

		const messages = normalizeSDKResponse(response, [] as MessageWrapper[], { preferResponseOnMissingData: true })

		const assistantMessages = messages
			.filter((m) => m.info.role === "assistant")
			.map((m) => m.info as AssistantMessageInfo);

		if (assistantMessages.length === 0) return null;
		
		const lastAssistant = assistantMessages[assistantMessages.length - 1];
		const lastTokens = lastAssistant?.tokens;
		if (!lastAssistant || !lastTokens) return null;

		const actualLimit =
			lastAssistant.providerID !== undefined
				? resolveActualContextLimit(
					lastAssistant.providerID,
					lastAssistant.modelID ?? "",
					modelCacheState,
				)
				: null;

		if (!actualLimit) return null;

		const usedTokens =
			(lastTokens?.input ?? 0) +
			(lastTokens?.cache?.read ?? 0) +
			(lastTokens?.output ?? 0);
		const remainingTokens = actualLimit - usedTokens;

		return {
			usedTokens,
			remainingTokens,
			usagePercentage: usedTokens / actualLimit,
		};
	} catch {
		return null;
	}
}

export async function dynamicTruncate(
	ctx: PluginInput,
	sessionID: string,
	output: string,
	options: TruncationOptions = {},
	modelCacheState?: ContextLimitModelCacheState,
): Promise<TruncationResult> {
	if (typeof output !== 'string') {
		return { result: String(output ?? ''), truncated: false };
	}

	const {
		targetMaxTokens = DEFAULT_TARGET_MAX_TOKENS,
		preserveHeaderLines = 3,
		modelID,
	} = options;

	const usage = await getContextWindowUsage(ctx, sessionID, modelCacheState);

	if (!usage) {
		// Fallback: apply conservative truncation when context usage unavailable
		return truncateToTokenLimit(output, targetMaxTokens, preserveHeaderLines, modelID);
	}

	const maxOutputTokens = Math.min(
		usage.remainingTokens * 0.5,
		targetMaxTokens,
	);

	if (maxOutputTokens <= 0) {
		return {
			result: buildExhaustedFooter(modelID),
			truncated: true,
		};
	}

	return truncateToTokenLimit(output, maxOutputTokens, preserveHeaderLines, modelID);
}

export function createDynamicTruncator(
	ctx: PluginInput,
	modelCacheState?: ContextLimitModelCacheState,
) {
	return {
		truncate: (
			sessionID: string,
			output: string,
			options?: TruncationOptions,
		) => dynamicTruncate(ctx, sessionID, output, options, modelCacheState),

		getUsage: (sessionID: string) =>
			getContextWindowUsage(ctx, sessionID, modelCacheState),

		truncateSync: (
			output: string,
			maxTokens: number,
			preserveHeaderLines?: number,
			modelID?: string,
		) => truncateToTokenLimit(output, maxTokens, preserveHeaderLines, modelID),
	};
}
