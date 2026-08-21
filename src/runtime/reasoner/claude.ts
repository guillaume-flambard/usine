// The Claude adapter. Loaded on demand: the default mode must ship neither
// the SDK nor a single network route.
//
// The key is supplied by the user, lives in module memory, and only ever goes
// to Anthropic's API. It is neither persisted nor logged.

import type { Reasoner, Reasoning, ReasoningRequest } from './index'

/** The default model. Configurable, but never guessed. */
export const DEFAULT_MODEL = 'claude-opus-5'

export interface ClaudeOptions {
  key: string
  model?: string
  /** Reasoning depth. The API default is `high`. */
  effort?: 'low' | 'medium' | 'high'
  /** Past this, we fall back: a run must not hang. */
  timeoutMs?: number
  /** Substitute entry point, to test without a network. */
  fetchOverride?: typeof fetch
  baseURL?: string
}

/** What was actually billed on input, cache included. */
const inputTokens = (usage: {
  input_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}) =>
  usage.input_tokens +
  (usage.cache_read_input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0)

export function claudeReasoner(options: ClaudeOptions): Reasoner {
  return {
    origin: 'llm',
    async reason(request: ReasoningRequest): Promise<Reasoning> {
      try {
        // Dynamic import: with no key, the SDK never enters the executed
        // bundle, and no request is possible.
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        const client = new Anthropic({
          apiKey: options.key,
          // A call that never returns would hang the run indefinitely.
          timeout: options.timeoutMs ?? 60_000,
          maxRetries: 1,
          ...(options.fetchOverride !== undefined ? { fetch: options.fetchOverride } : {}),
          ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
          // The application is client-only and the key belongs to the user who
          // typed it: an explicit choice, not an oversight. It is stated on
          // screen before the first call.
          dangerouslyAllowBrowser: true,
        })

        const response = await client.messages.create({
          model: options.model ?? DEFAULT_MODEL,
          max_tokens: 2048,
          thinking: { type: 'adaptive' },
          output_config: { effort: options.effort ?? 'medium' },
          system:
            "Tu es un agent d'une chaîne de production logicielle. Réponds en français, " +
            'en texte brut, sans préambule ni formatage. Sois bref et concret.',
          messages: [
            {
              role: 'user',
              content: [
                `Rôle : ${request.role}`,
                `Tâche : ${request.instruction}`,
                '',
                'Contexte :',
                request.context,
              ].join('\n'),
            },
          ],
        })

        const text = response.content
          .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim()

        const tokens = {
          input: inputTokens(response.usage),
          output: response.usage.output_tokens,
        }

        if (text.length === 0) {
          return {
            text: request.fallback,
            origin: 'llm',
            failure: 'Le modèle a répondu sans texte.',
            tokens,
          }
        }

        // An answer cut off mid-sentence is not a decision: publishing it as
        // one would be worse than not calling the model at all.
        if (response.stop_reason === 'max_tokens') {
          return {
            text: request.fallback,
            origin: 'llm',
            failure: 'Réponse tronquée par la limite de tokens.',
            tokens,
          }
        }

        return { text, origin: 'llm', tokens }
      } catch (cause) {
        // Invalid key, quota, network: the run continues on the written
        // answer. A connected agent must not be able to break the demo.
        return {
          text: request.fallback,
          origin: 'llm',
          failure: cause instanceof Error ? cause.message : String(cause),
        }
      }
    },
  }
}
