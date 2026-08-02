import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * The single seam between MeetingFlow and any language model.
 *
 * No feature code calls a vendor SDK directly. Everything goes through
 * AIProvider, so a second provider can be added later by implementing this
 * interface — nothing else in the product changes.
 *
 * The provider is deliberately dumb: it takes a prompt and a schema, and
 * returns text or a validated object plus token usage. It knows nothing about
 * meetings, permissions or tenants. Those live in the services above it.
 */

export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
};

export type AiResult<T> = {
  ok: true;
  value: T;
  usage: AiUsage;
};

export type AiFailure = {
  ok: false;
  errorType: "unavailable" | "rate_limited" | "invalid_output" | "api_error";
  message: string;
  usage: AiUsage | null;
};

export type AiOutcome<T> = AiResult<T> | AiFailure;

export type TextRequest = {
  /** Stable instructions. Kept first so the prompt cache can hold it. */
  system: string;
  /** The volatile part of the prompt. */
  prompt: string;
  maxTokens?: number;
  effort?: AiEffort;
  /** Cache the system block. Worth it when the same system text repeats. */
  cacheSystem?: boolean;
};

export type StructuredRequest<S extends z.ZodType> = TextRequest & {
  schema: S;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  /** False when no credentials are configured. Callers must degrade, not throw. */
  isAvailable(): boolean;

  generateText(input: TextRequest): Promise<AiOutcome<string>>;

  generateStructuredOutput<S extends z.ZodType>(
    input: StructuredRequest<S>,
  ): Promise<AiOutcome<z.infer<S>>>;

  summarize(input: {
    text: string;
    instructions: string;
    maxTokens?: number;
  }): Promise<AiOutcome<string>>;

  extract<S extends z.ZodType>(input: {
    text: string;
    instructions: string;
    schema: S;
  }): Promise<AiOutcome<z.infer<S>>>;

  classify<const L extends readonly string[]>(input: {
    text: string;
    instructions: string;
    labels: L;
  }): Promise<AiOutcome<L[number]>>;
}

// ---------------------------------------------------------------- anthropic

const DEFAULT_MODEL = process.env.AI_MODEL ?? "claude-opus-5";

/**
 * max_tokens on Claude Opus 5 covers thinking plus the visible answer, so the
 * ceiling has to leave room for both even on short structured replies.
 */
const DEFAULT_MAX_TOKENS = 8000;

function emptyUsage(model: string, latencyMs: number): AiUsage {
  return {
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    latencyMs,
  };
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model: string;

  private client: Anthropic | null;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
    this.client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  private systemBlocks(system: string, cache: boolean | undefined) {
    if (!cache) return system;
    return [
      {
        type: "text" as const,
        text: system,
        cache_control: { type: "ephemeral" as const },
      },
    ];
  }

  private failure(error: unknown, latencyMs: number): AiFailure {
    const usage = emptyUsage(this.model, latencyMs);

    if (error instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        errorType: "rate_limited",
        message: "The model is rate limited. Try again shortly.",
        usage,
      };
    }

    if (error instanceof Anthropic.APIError) {
      return {
        ok: false,
        errorType: "api_error",
        message: `Model API error ${error.status ?? ""}: ${error.message}`,
        usage,
      };
    }

    return {
      ok: false,
      errorType: "api_error",
      message: error instanceof Error ? error.message : "Unknown model error",
      usage,
    };
  }

  private usageFrom(
    raw:
      | {
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        }
      | undefined,
    latencyMs: number,
  ): AiUsage {
    return {
      model: this.model,
      inputTokens: raw?.input_tokens ?? 0,
      outputTokens: raw?.output_tokens ?? 0,
      cacheReadTokens: raw?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: raw?.cache_creation_input_tokens ?? 0,
      latencyMs,
    };
  }

  async generateText(input: TextRequest): Promise<AiOutcome<string>> {
    if (!this.client) {
      return {
        ok: false,
        errorType: "unavailable",
        message: "ANTHROPIC_API_KEY is not configured",
        usage: null,
      };
    }

    const startedAt = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: this.systemBlocks(input.system, input.cacheSystem),
        output_config: { effort: input.effort ?? "low" },
        messages: [{ role: "user", content: input.prompt }],
      });

      const latencyMs = Date.now() - startedAt;
      const usage = this.usageFrom(response.usage, latencyMs);

      if (response.stop_reason === "refusal") {
        return {
          ok: false,
          errorType: "invalid_output",
          message: "The model declined this request.",
          usage,
        };
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!text) {
        return {
          ok: false,
          errorType: "invalid_output",
          message: "The model returned no text.",
          usage,
        };
      }

      return { ok: true, value: text, usage };
    } catch (error) {
      return this.failure(error, Date.now() - startedAt);
    }
  }

  async generateStructuredOutput<S extends z.ZodType>(
    input: StructuredRequest<S>,
  ): Promise<AiOutcome<z.infer<S>>> {
    if (!this.client) {
      return {
        ok: false,
        errorType: "unavailable",
        message: "ANTHROPIC_API_KEY is not configured",
        usage: null,
      };
    }

    const startedAt = Date.now();

    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: this.systemBlocks(input.system, input.cacheSystem),
        output_config: {
          format: zodOutputFormat(input.schema),
          effort: input.effort ?? "low",
        },
        messages: [{ role: "user", content: input.prompt }],
      });

      const latencyMs = Date.now() - startedAt;
      const usage = this.usageFrom(response.usage, latencyMs);

      if (response.stop_reason === "refusal") {
        return {
          ok: false,
          errorType: "invalid_output",
          message: "The model declined this request.",
          usage,
        };
      }

      if (response.parsed_output == null) {
        return {
          ok: false,
          errorType: "invalid_output",
          message: "The model output did not match the required schema.",
          usage,
        };
      }

      return { ok: true, value: response.parsed_output, usage };
    } catch (error) {
      return this.failure(error, Date.now() - startedAt);
    }
  }

  summarize(input: {
    text: string;
    instructions: string;
    maxTokens?: number;
  }): Promise<AiOutcome<string>> {
    return this.generateText({
      system: input.instructions,
      prompt: input.text,
      maxTokens: input.maxTokens,
      effort: "low",
    });
  }

  extract<S extends z.ZodType>(input: {
    text: string;
    instructions: string;
    schema: S;
  }): Promise<AiOutcome<z.infer<S>>> {
    return this.generateStructuredOutput({
      system: input.instructions,
      prompt: input.text,
      schema: input.schema,
      effort: "low",
    });
  }

  async classify<const L extends readonly string[]>(input: {
    text: string;
    instructions: string;
    labels: L;
  }): Promise<AiOutcome<L[number]>> {
    const result = await this.generateText({
      system: `${input.instructions}\n\nAnswer with exactly one of these labels and nothing else: ${input.labels.join(", ")}`,
      prompt: input.text,
      maxTokens: 2000,
      effort: "low",
    });

    if (!result.ok) return result;

    const label = input.labels.find(
      (candidate) => candidate.toLowerCase() === result.value.trim().toLowerCase(),
    );

    if (!label) {
      return {
        ok: false,
        errorType: "invalid_output",
        message: `The model answered "${result.value}", which is not one of the allowed labels.`,
        usage: result.usage,
      };
    }

    return { ok: true, value: label, usage: result.usage };
  }
}

// ---------------------------------------------------------------- fallback

/**
 * Used when no credentials are configured. Every call fails cleanly so the
 * product keeps working with the AI panels showing "unavailable" rather than
 * the whole page erroring.
 */
export class UnavailableProvider implements AIProvider {
  readonly name = "unavailable";
  readonly model = "none";

  isAvailable(): boolean {
    return false;
  }

  private fail(): AiFailure {
    return {
      ok: false,
      errorType: "unavailable",
      message: "No AI provider is configured",
      usage: null,
    };
  }

  async generateText(): Promise<AiOutcome<string>> {
    return this.fail();
  }

  async generateStructuredOutput<S extends z.ZodType>(): Promise<
    AiOutcome<z.infer<S>>
  > {
    return this.fail();
  }

  async summarize(): Promise<AiOutcome<string>> {
    return this.fail();
  }

  async extract<S extends z.ZodType>(): Promise<AiOutcome<z.infer<S>>> {
    return this.fail();
  }

  async classify<const L extends readonly string[]>(): Promise<
    AiOutcome<L[number]>
  > {
    return this.fail();
  }
}

let cached: AIProvider | null = null;

/** The provider the whole application shares. */
export function aiProvider(): AIProvider {
  if (!cached) {
    cached = process.env.ANTHROPIC_API_KEY
      ? new AnthropicProvider()
      : new UnavailableProvider();
  }
  return cached;
}
