/**
 * Which thread a node carries (MEM-86, the identity "Le fil"): one colour per
 * agent, the same everywhere it appears (graph, steps, inspector).
 *
 * Deterministic, from the read model only: the supervisor is the neutral grey,
 * the specialists take sky, magenta and green in the order they started, the
 * synthesis is amber, and the gate and what follows it are the ink, the person.
 */
import type { RunNode } from './readModel'

export type Thread = 'sup' | 'sky' | 'mag' | 'grn' | 'amb' | 'ink'

export const SPECIALIST_THREADS: readonly Thread[] = ['sky', 'mag', 'grn']

const BY_NAME: Record<string, Thread> = {
  supervisor: 'sup',
  synthesize: 'amb',
  human_gate: 'ink',
  act: 'ink',
}

/** The thread of a graph node name, for a specialist its rank among specialists. */
export function threadOfName(name: string, specialistIndex = 0): Thread {
  if (name === 'specialist') {
    return SPECIALIST_THREADS[specialistIndex % SPECIALIST_THREADS.length]!
  }
  return BY_NAME[name] ?? 'sup'
}

/** Every node's thread, by node id, specialists ranked in start order. */
export function threadsOf(nodes: readonly RunNode[]): Map<string, Thread> {
  const threads = new Map<string, Thread>()
  let specialists = 0
  for (const node of nodes) {
    const index = node.name === 'specialist' ? specialists++ : 0
    threads.set(node.id, threadOfName(node.name, index))
  }
  return threads
}
