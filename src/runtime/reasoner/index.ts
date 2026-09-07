// The reasoning port. An agent never talks to a provider: it consumes this
// port. The deterministic implementation is the default, and the fallback on
// failure is written exactly once, here.

export interface ReasoningRequest {
  /** Who is asking, for traceability. */
  role: string
  /** What is expected, in one sentence. */
  instruction: string
  /** What it has to work with. */
  context: string
  /**
   * The hand-written answer. It is what the deterministic mode returns, and
   * what the LLM mode falls back to on failure: the run never stops for want
   * of a model.
   */
  fallback: string
  /**
   * Les outils que l'appelant met à disposition, quand il en a.
   *
   * Transmis tels quels au fournisseur. Celui qui ne sait pas les honorer rend
   * du texte, et la relecture fait tout le travail comme avant — c'est un gain
   * de fiabilité, pas une dépendance.
   */
  tools?: unknown
}

/**
 * Where a piece of reasoning comes from. `demo` is the keyless site's mode:
 * the answers are prepared in advance and the screen says so — a prepared run
 * passing itself off as a live one would be exactly the lie this product
 * refuses.
 */
export type ReasoningOrigin = 'deterministic' | 'llm' | 'demo'

/** Un appel d'outil, tel que le fournisseur l'a émis. */
export interface ToolCall {
  name: string
  /** Les arguments, encore en texte : ils sont relus comme donnée hostile. */
  arguments: string
}

export interface Reasoning {
  text: string
  /**
   * Les actions, quand le fournisseur les a émises comme appels d'outils.
   *
   * C'est la voie fiable : le nom de l'action y voyage hors du corps JSON, là
   * où l'ordre des clés ne peut pas le brouiller.
   */
  calls?: readonly ToolCall[]
  origin: ReasoningOrigin
  /** Set only when a model was actually called. */
  tokens?: { input: number; output: number }
  /** What made the call fail, when we fell back. */
  failure?: string
  /**
   * True when the provider cut the output at its budget. The text then ends
   * mid-sentence, and nothing in the text itself says so: a caller that shows
   * it verbatim publishes an unfinished sentence.
   */
  truncated?: boolean
}

export interface Reasoner {
  readonly origin: ReasoningOrigin
  reason(request: ReasoningRequest): Promise<Reasoning>
}

/**
 * The default. No network, no key, no tokens: the hand-written answer is
 * returned as is. What is deterministic is the judgement — not the agent's
 * existence, nor its work.
 */
export function deterministicReasoner(): Reasoner {
  return {
    origin: 'deterministic',
    reason: (request) =>
      Promise.resolve({ text: request.fallback, origin: 'deterministic' as const }),
  }
}
