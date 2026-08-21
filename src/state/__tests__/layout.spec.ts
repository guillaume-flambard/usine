// The layout follows the live graph: it is no longer a snapshot taken before
// the run. What must stay true is that it is readable and reproducible — and
// that it accepts a graph that grows.
import { describe, expect, it } from 'vitest'
import {
  layoutOf,
  linkPath,
  liveLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  topologySignature,
} from '../layout'
import type { EdgeView, NodeView } from '../model'
import type { ComponentId } from '../../runtime/contract'
import { runToGate } from '../../orchestration/__tests__/helpers'

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const id = (value: string) => value as ComponentId

const node = (name: string, appearedAt: number): NodeView => ({
  id: id(name),
  name,
  display: { role: name },
  needs: [],
  provides: [],
  state: 'finished',
  appearedAt,
})

const edge = (from: string, to: string, name: string): EdgeView => ({
  from: id(from),
  to: id(to),
  name,
  hasTransited: true,
})

const NODES = ['a', 'b', 'c', 'd'].map((name, index) => node(name, index))
const EDGES = [edge('a', 'b', 'x'), edge('a', 'c', 'y'), edge('b', 'd', 'z')]

describe('the live graph layout', () => {
  it('places exactly the live nodes, no more and no fewer', () => {
    const { boxes } = liveLayout(NODES, EDGES)
    expect([...boxes.keys()].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('accepts a graph that grows: one node more, one place more', () => {
    const before = liveLayout(NODES.slice(0, 2), [EDGES[0] as EdgeView])
    const after = liveLayout(NODES, EDGES)
    expect(before.boxes.size).toBe(2)
    expect(after.boxes.size).toBe(4)
    // The width follows: the graph takes more room as it grows.
    expect(after.width).toBeGreaterThan(before.width)
  })

  it('makes no two nodes overlap', () => {
    const boxes = [...liveLayout(NODES, EDGES).boxes.values()]
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (a === undefined || b === undefined) continue
        expect(overlaps(a, b), `${a.name} overlaps ${b.name}`).toBe(false)
      }
    }
  })

  it('flows left to right: a dependency is always to the left', () => {
    const { boxes, links } = liveLayout(NODES, EDGES)
    for (const link of links) {
      const from = boxes.get(link.from)
      const to = boxes.get(link.to)
      if (from === undefined || to === undefined) continue
      expect(from.x, `${link.from} → ${link.to}`).toBeLessThan(to.x)
    }
  })

  it('is deterministic: the arrival order of nodes moves nothing', () => {
    const a = liveLayout(NODES, EDGES)
    const b = liveLayout([...NODES].reverse(), [...EDGES].reverse())
    for (const [name, box] of a.boxes) {
      expect(b.boxes.get(name), name).toEqual(box)
    }
  })

  it('gives every node the design system size', () => {
    for (const box of liveLayout(NODES, EDGES).boxes.values()) {
      expect(box.width).toBe(NODE_WIDTH)
      expect(box.height).toBe(NODE_HEIGHT)
    }
  })

  it('traces a path for every link', () => {
    for (const link of liveLayout(NODES, EDGES).links) {
      expect(linkPath(link.points).startsWith('M ')).toBe(true)
    }
  })

  it('returns an empty path rather than throwing when there is no point', () => {
    expect(linkPath([])).toBe('')
  })

  it('does not move while the topology does not move', () => {
    const before = topologySignature(NODES, EDGES)
    // A state change or an artifact has no reason to move a node.
    const same = NODES.map((n) => ({ ...n, state: 'working' as const }))
    expect(topologySignature(same, EDGES)).toBe(before)
    expect(topologySignature([...NODES, node('e', 9)], EDGES)).not.toBe(before)
  })

  it('still accepts a plain list of declared components', () => {
    // `layoutOf` stays usable on its own: it is what `liveLayout` calls.
    const { boxes } = layoutOf([{ name: 'alone', needs: [], provides: [] }], { order: ['alone'] })
    expect(boxes.get('alone')).toBeDefined()
  })
})

describe('the layout as the application computes it', () => {
  it('has a place for every node of the run, built tool included', async () => {
    const pilot = await runToGate()
    const nodes = pilot.store.state.value.nodes

    expect(nodes.length).toBeGreaterThan(3)
    // A tool written during the run is a node like any other: it must have a
    // place although nobody expected it.
    expect(nodes.some((n) => n.build !== undefined)).toBe(true)
    for (const n of nodes) {
      expect(pilot.layout.value.boxes.has(n.name), n.name).toBe(true)
    }
  })
})
