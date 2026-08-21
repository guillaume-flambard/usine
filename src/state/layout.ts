// The layout follows the live graph. It can no longer be computed once and for
// all: the graph does not exist before the brief, and it grows during the run.
// So it is recomputed on every topology change — and only there, never on
// every event.
//
// Nodes slide to their new place instead of appearing already placed: the node
// component's CSS transition takes care of that.
//
// Only coordinate computation is delegated. Rendering stays ours.

import dagre from '@dagrejs/dagre'
import type { EdgeView, NodeView } from './model'

/** The minimum the layout needs from a component. */
export interface LayoutNode {
  name: string
  needs?: readonly string[]
  provides?: readonly string[]
}

export interface Box {
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface Link {
  from: string
  to: string
  name: string
  /** Points of the curve, from start to end. */
  points: readonly { x: number; y: number }[]
}

export interface Layout {
  boxes: ReadonlyMap<string, Box>
  links: readonly Link[]
  width: number
  height: number
}

export const NODE_WIDTH = 140
export const NODE_HEIGHT = 56

export interface LayoutOptions {
  /** The declaration order: it fixes the rank inside a layer. */
  order: readonly string[]
  layerGap?: number
  rankGap?: number
}

/**
 * Takes a topology and returns stable coordinates. Two runs with the same
 * topology give the same layout, whatever the activation order, because nodes
 * are inserted in the given order.
 */
export function layoutOf(components: readonly LayoutNode[], options: LayoutOptions): Layout {
  const rank = new Map(options.order.map((name, index) => [name, index]))
  const sorted = [...components].sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0))

  // Multigraph: two components can be linked by several dependency names, and
  // each edge must keep its identity.
  const graph = new dagre.graphlib.Graph({ directed: true, multigraph: true })
  graph.setGraph({
    rankdir: 'LR',
    ranksep: options.layerGap ?? 96,
    nodesep: options.rankGap ?? 40,
    marginx: 24,
    marginy: 24,
  })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const component of sorted) {
    graph.setNode(component.name, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Who publishes what, from the declaration alone: the layout depends on no
  // execution.
  const byName = new Map<string, string>()
  for (const component of sorted) {
    for (const name of component.provides ?? []) {
      if (!byName.has(name)) byName.set(name, component.name)
    }
  }

  const edges: { from: string; to: string; name: string }[] = []
  for (const component of sorted) {
    for (const name of component.needs ?? []) {
      const source = byName.get(name)
      if (source === undefined || source === component.name) continue
      edges.push({ from: source, to: component.name, name })
      graph.setEdge(source, component.name, {}, name)
    }
  }

  dagre.layout(graph)

  const boxes = new Map<string, Box>()
  for (const component of sorted) {
    const node = graph.node(component.name) as
      | { x: number; y: number; width: number; height: number }
      | undefined
    if (node === undefined) continue
    boxes.set(component.name, {
      name: component.name,
      // dagre centres its nodes; we return the top-left corner, handier in SVG.
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    })
  }

  const links: Link[] = edges.map((edge) => {
    const arc = graph.edge(edge.from, edge.to, edge.name) as
      | { points?: { x: number; y: number }[] }
      | undefined
    return { ...edge, points: arc?.points ?? [] }
  })

  const meta = graph.graph() as { width?: number; height?: number }
  return {
    boxes,
    links,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  }
}

/**
 * The live topology's signature. Two states sharing it give the same layout:
 * this is what avoids re-running dagre on every message or node state change.
 */
export const topologySignature = (
  nodes: readonly NodeView[],
  edges: readonly EdgeView[],
): string =>
  [
    nodes
      .map((node) => node.name)
      .sort()
      .join(','),
    edges
      .map((edge) => `${edge.from}>${edge.name}>${edge.to}`)
      .sort()
      .join(','),
  ].join('|')

/**
 * The layout of the graph as it stands right now. Edges come from what is
 * actually wired, not from a declaration: a link only appears once the kernel
 * has established the dependency.
 */
export function liveLayout(
  nodes: readonly NodeView[],
  edges: readonly EdgeView[],
  options: Partial<LayoutOptions> = {},
): Layout {
  const nameById = new Map(nodes.map((node) => [node.id, node.name]))
  // Appearance order fixes the rank inside a layer: it is the only order left,
  // now that the declared casting is gone.
  const order = [...nodes].sort((a, b) => a.appearedAt - b.appearedAt).map((node) => node.name)

  // The dependencies the layout sees are the ones the kernel wired; `needs`
  // alone would link nodes that are not talking to each other yet.
  const neededBy = new Map<string, string[]>()
  const providedBy = new Map<string, string[]>()
  for (const edge of edges) {
    const from = nameById.get(edge.from)
    const to = nameById.get(edge.to)
    if (from === undefined || to === undefined) continue
    neededBy.set(to, [...(neededBy.get(to) ?? []), edge.name])
    if (!(providedBy.get(from) ?? []).includes(edge.name)) {
      providedBy.set(from, [...(providedBy.get(from) ?? []), edge.name])
    }
  }

  return layoutOf(
    nodes.map((node) => ({
      name: node.name,
      needs: neededBy.get(node.name) ?? [],
      provides: providedBy.get(node.name) ?? [],
    })),
    { ...options, order },
  )
}

/** A smoothed curve through the points the layout returned. */
export function linkPath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const [start, ...rest] = points
  if (start === undefined) return ''
  if (rest.length === 0) return `M ${start.x} ${start.y}`
  let path = `M ${start.x} ${start.y}`
  for (let index = 0; index < rest.length; index += 1) {
    const point = rest[index]
    const previous = index === 0 ? start : rest[index - 1]
    if (point === undefined || previous === undefined) continue
    const middle = (previous.x + point.x) / 2
    path += ` C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }
  return path
}
