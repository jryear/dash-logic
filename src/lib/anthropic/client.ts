// Traces to: ARCHITECTURE-dash.md §5.1, §7.2

import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

function extractTextContent(content: Anthropic.Messages.Message["content"]) {
  type TextContentBlock = Extract<Anthropic.Messages.Message["content"][number], { type: "text" }>;

  return content
    .filter((block): block is TextContentBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function stripJsonFence(input: string) {
  return input.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function requestModelText({
  model,
  system,
  prompt,
  maxTokens = 1200,
}: {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = extractTextContent(response.content);

  if (!rawText) {
    throw new Error("Anthropic returned no text content.");
  }

  return rawText;
}

export async function requestStructuredObject<T>({
  model,
  system,
  prompt,
  maxTokens = 1200,
}: {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const rawText = await requestModelText({
    model,
    system,
    prompt,
    maxTokens,
  });

  return JSON.parse(stripJsonFence(rawText)) as T;
}

export async function requestStructuredObjectWithRaw<T>(options: {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}) {
  const rawText = await requestModelText(options);
  const sanitized = stripJsonFence(rawText);

  try {
    return {
      rawText,
      parsed: JSON.parse(sanitized) as T,
      parseError: null,
    };
  } catch (error) {
    return {
      rawText,
      parsed: null as T | null,
      parseError: error instanceof Error ? error.message : "Failed to parse structured model response.",
    };
  }
}

export { anthropic };
