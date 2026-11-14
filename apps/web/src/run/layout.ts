/**
 * Node positions for the scene, computed by dagre (@dagrejs/dagre 3.1.3), left
 * to right. Nodes are inserted in start order, so the same run always gets the
 * same layout (the v1 rule, src/state/layout.ts on main).
 */
import dagre from '@dagrejs/dagre'
import type { RunEdge, RunNode } from './readModel'

export const NODE_WIDTH = 148
export const NODE_HEIGHT = 70

export interface Box {
  id: string
  x: number
  y: number
}

export interface Placed {
  boxes: Map<string, Box>
  links: { from: string; to: string; points: { x: number; y: number }[] }[]
  width: number
  height: number
}

export function layoutRun(nodes: readonly RunNode[], edges: readonly RunEdge[]): Placed {
  const graph = new dagre.graphlib.Graph({ directed: true })
  graph.setGraph({ rankdir: 'LR', ranksep: 48, nodesep: 16, marginx: 8, marginy: 8 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const edge of edges) graph.setEdge(edge.from, edge.to)
  dagre.layout(graph)

  const boxes = new Map<string, Box>()
  for (const node of nodes) {
    const { x, y } = graph.node(node.id)
    boxes.set(node.id, { id: node.id, x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 })
  }
  const links = edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    points: graph.edge(edge.from, edge.to)?.points ?? [],
  }))
  const size = graph.graph()
  return { boxes, links, width: size.width ?? 0, height: size.height ?? 0 }
}

/** An SVG path through dagre's points. */
export function linkPath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}
