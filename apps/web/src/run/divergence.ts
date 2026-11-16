/**
 * Where a branch first differs from the run it was forked from (MEM-25).
 */
import type { RunReadModel } from './readModel'

export type Divergence = { kind: 'node' | 'state'; name: string; state?: string }

export function firstDivergence(left: RunReadModel, right: RunReadModel): Divergence | null {
  // A branch replays only what comes after its fork point: the nodes before it
  // are shared, not missing. Compare from the branch's first node, matched by
  // position in the original. Comparing ids from the start named the shared
  // supervisor as the divergence (audit, 16 November 2026).
  const first = right.nodes[0]
  if (!first) return null
  const start = left.nodes.findIndex((n) => n.name === first.name)
  if (start < 0) return { kind: 'node', name: first.name }
  const tail = left.nodes.slice(start)
  for (const [i, other] of right.nodes.entries()) {
    const node = tail[i]
    if (!node || node.name !== other.name) return { kind: 'node', name: other.name }
    if (node.state !== other.state) return { kind: 'state', name: node.name, state: other.state }
    if (node.task !== other.task) return { kind: 'node', name: node.name }
    // The hot swap itself: same step, another specialist.
    const who = (n: typeof node) => (n.specialists ?? []).map((s) => s.name).join()
    if (who(node) !== who(other)) return { kind: 'node', name: node.name }
  }
  if (tail.length > right.nodes.length)
    return { kind: 'node', name: tail[right.nodes.length]!.name }
  return null
}
