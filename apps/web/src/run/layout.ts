/**
 * Node positions for the scene, computed by dagre (@dagrejs/dagre 3.1.3), top
 * to bottom as in the identity "Le fil" (MEM-86): the supervisor above, its
 * specialists side by side, the synthesis, then the gate. Nodes are inserted
 * in start order, so the same run always gets the same layout.
 */
import dagre from '@dagrejs/dagre'
import type { RunEdge, RunNode } from './readModel'

export const NODE_WIDTH = 206
export const NODE_HEIGHT = 168
export const GATE_WIDTH = 232
export const GATE_HEIGHT = 72

export interface Box {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface Placed {
  boxes: Map<string, Box>
  links: { from: string; to: string; d: string }[]
  width: number
  height: number
}

function sizeOf(node: RunNode): { width: number; height: number } {
  return node.name === 'human_gate'
    ? { width: GATE_WIDTH, height: GATE_HEIGHT }
    : { width: NODE_WIDTH, height: NODE_HEIGHT }
}

/** A thread from the bottom of one box to the top of the next, as a soft S. */
export function threadPath(from: Box, to: Box, offset = 0): string {
  const sx = from.x + from.width / 2 + offset
  const sy = from.y + from.height
  const tx = to.x + to.width / 2
  const ty = to.y
  const m = (ty - sy) / 2
  const f = (n: number) => n.toFixed(1)
  return `M${f(sx)} ${f(sy)} C${f(sx)} ${f(sy + m)} ${f(tx)} ${f(ty - m)} ${f(tx)} ${f(ty)}`
}

export function layoutRun(nodes: readonly RunNode[], edges: readonly RunEdge[]): Placed {
  const graph = new dagre.graphlib.Graph({ directed: true })
  graph.setGraph({ rankdir: 'TB', ranksep: 56, nodesep: 24, marginx: 24, marginy: 32 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, sizeOf(node))
  for (const edge of edges) graph.setEdge(edge.from, edge.to)
  dagre.layout(graph)

  const boxes = new Map<string, Box>()
  for (const node of nodes) {
    const { x, y } = graph.node(node.id)
    const { width, height } = sizeOf(node)
    boxes.set(node.id, { id: node.id, x: x - width / 2, y: y - height / 2, width, height })
  }

  // Threads leaving the same node fan out a little, so they read as separate.
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  const links = edges.flatMap((edge) => {
    const from = boxes.get(edge.from)
    const to = boxes.get(edge.to)
    if (!from || !to) return []
    const siblings = outgoing.get(edge.from) ?? []
    const offset = (siblings.indexOf(edge.to) - (siblings.length - 1) / 2) * 18
    return [{ from: edge.from, to: edge.to, d: threadPath(from, to, offset) }]
  })
  const size = graph.graph()
  return { boxes, links, width: size.width ?? 0, height: size.height ?? 0 }
}
