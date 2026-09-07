import { describe, expect, it } from 'vitest'
import { initialState, reduce, type FullState } from '../reducer'
import type { RunEvent, WithoutSequence } from '../../runtime/events'
import type { ComponentId } from '../../runtime/contract'

const id = (name: string) => name as ComponentId

let sequence = 0
const next = () => (sequence += 1)

function created(name: string, needs: string[] = [], provides: string[] = []): RunEvent {
  return {
    type: 'component-created',
    sequence: next(),
    at: 0,
    id: id(name),
    name,
    display: { role: `Rôle de ${name}` },
    needs,
    provides,
  }
}

// `WithoutSequence` is distributive: without it, `Omit` on the union would keep
// only the common keys and the variants would stop being checked.
const ev = (e: WithoutSequence): RunEvent => ({ ...e, sequence: next(), at: 0 }) as RunEvent

function replay(events: readonly RunEvent[]): FullState {
  return events.reduce(reduce, initialState())
}

const node = (state: FullState, name: string) => state.view.nodes.find((n) => n.name === name)

describe('reducer', () => {
  it('creates an idle node when it declares no dependency', () => {
    const state = replay([created('solo')])
    expect(node(state, 'solo')?.state).toBe('idle')
    expect(state.view.liveAgents).toBe(1)
  })

  it('does not count what an agent wrote as an agent', () => {
    // Un composant portant un `build` est un comportement écrit par un modèle.
    // Le compter gonfle le seul chiffre qu'on demande au visiteur de croire :
    // l'écran disait « 3 agents » là où un seul avait été créé.
    const state = replay([
      created('poseur-ecran'),
      ev({
        type: 'component-built',
        id: id('poseur-ecran'),
        parent: id('master-agent'),
        build: { specification: 'pose l’écran', source: 'x', route: 'composition' },
      }),
    ])
    expect(state.view.liveAgents).toBe(0)
  })

  it('creates a waiting node when it needs something', () => {
    const state = replay([created('checker', ['registry'])])
    expect(node(state, 'checker')?.state).toBe('waiting-for-dependency')
  })

  it('moves to working on activation', () => {
    const state = replay([created('solo'), ev({ type: 'component-activated', id: id('solo') })])
    expect(node(state, 'solo')?.state).toBe('working')
  })

  it('moves to finished when the work is signalled', () => {
    const state = replay([
      created('solo'),
      ev({ type: 'component-activated', id: id('solo') }),
      ev({ type: 'work-finished', id: id('solo') }),
    ])
    expect(node(state, 'solo')?.state).toBe('finished')
  })

  it('goes back to waiting on deactivation and keeps the cause', () => {
    const state = replay([
      created('checker', ['registry']),
      ev({ type: 'component-activated', id: id('checker') }),
      ev({
        type: 'component-deactivated',
        id: id('checker'),
        cause: { kind: 'dependency-gone', names: ['registry'] },
      }),
    ])
    const seen = node(state, 'checker')
    expect(seen?.state).toBe('waiting-for-dependency')
    expect(seen?.cause).toEqual({ kind: 'dependency-gone', names: ['registry'] })
  })

  it('fails and stays failed, even after a deactivation', () => {
    const state = replay([
      created('faulty', ['registry']),
      ev({
        type: 'component-failed',
        error: {
          code: 'activation-failed',
          message: 'boum',
          component: id('faulty'),
          name: 'faulty',
        },
      }),
      ev({
        type: 'component-deactivated',
        id: id('faulty'),
        cause: { kind: 'release' },
      }),
    ])
    // Failure is terminal: a later deactivation must not put the node back to
    // waiting, otherwise the graph shows it healthy.
    expect(node(state, 'faulty')?.state).toBe('failed')
    expect(node(state, 'faulty')?.error?.code).toBe('activation-failed')
    expect(state.view.incidents).toHaveLength(1)
  })

  it('records an incident with no identifier without touching the nodes', () => {
    const state = replay([
      created('solo'),
      ev({
        type: 'component-failed',
        error: { code: 'name-already-provided', message: 'déjà pris', name: 'refused' },
      }),
    ])
    expect(node(state, 'solo')?.state).toBe('idle')
    expect(state.view.incidents).toHaveLength(1)
    expect(state.view.incidents[0]?.error.name).toBe('refused')
  })

  it('marks the node released and keeps it visible', () => {
    const state = replay([
      created('solo'),
      ev({ type: 'component-activated', id: id('solo') }),
      ev({ type: 'component-released', id: id('solo') }),
    ])
    expect(node(state, 'solo')?.state).toBe('released')
    expect(state.view.nodes).toHaveLength(1)
    expect(state.view.liveAgents).toBe(0)
  })

  it('keeps as narration only the highest-sequence message', () => {
    const state = replay([
      created('planner'),
      ev({ type: 'message-emitted', id: id('planner'), message: 'premier' }),
      ev({ type: 'message-emitted', id: id('planner'), message: 'second' }),
    ])
    expect(state.view.narration?.message).toBe('second')
    expect(state.view.log).toHaveLength(2)
    expect(state.view.log[0]?.author).toBe('planner')
  })

  it('derives edges from the declared names and marks the transit', () => {
    const state = replay([
      created('tool', [], ['registry']),
      created('agent', ['registry']),
      ev({
        type: 'value-passed',
        from: id('tool'),
        to: id('agent'),
        name: 'registry',
      }),
    ])
    expect(state.view.edges).toHaveLength(1)
    expect(state.view.edges[0]?.hasTransited).toBe(true)
  })

  it('does not link a node to itself', () => {
    const state = replay([created('loop', ['memory'], ['memory'])])
    expect(state.view.edges).toHaveLength(0)
  })

  it('ignores an event carrying an unknown identifier', () => {
    const state = replay([created('solo'), ev({ type: 'component-activated', id: id('ghost') })])
    expect(node(state, 'solo')?.state).toBe('idle')
    expect(state.view.nodes).toHaveLength(1)
  })

  it('puts the work back to do when a component reactivates', () => {
    const state = replay([
      created('builder', ['registry']),
      ev({ type: 'component-activated', id: id('builder') }),
      ev({ type: 'work-finished', id: id('builder') }),
      ev({
        type: 'component-deactivated',
        id: id('builder'),
        cause: { kind: 'dependency-gone', names: ['registry'] },
      }),
      ev({ type: 'component-activated', id: id('builder') }),
    ])
    // Reactivated but not re-finished: showing it "finished" would be a lie
    // about past work.
    expect(node(state, 'builder')?.state).toBe('working')
  })

  it('removes the node when its load failed: the engine no longer holds it', () => {
    const state = replay([
      created('stillborn'),
      ev({
        type: 'component-failed',
        error: {
          code: 'load-failed',
          message: 'rejet du moteur',
          component: id('stillborn'),
          name: 'stillborn',
        },
      }),
    ])
    expect(state.view.nodes).toHaveLength(0)
    expect(state.view.incidents).toHaveLength(1)
  })

  it('classifies a subscriber incident under its own code', () => {
    const state = replay([ev({ type: 'subscriber-failed', message: 'abonné fautif' })])
    expect(state.view.incidents[0]?.error.code).toBe('subscriber-incident')
  })

  it('is pure: the same sequence reduced twice gives the same state', () => {
    const stream: RunEvent[] = [
      created('tool', [], ['registry']),
      created('agent', ['registry']),
      ev({ type: 'component-activated', id: id('tool') }),
      ev({ type: 'component-activated', id: id('agent') }),
      ev({ type: 'message-emitted', id: id('agent'), message: 'travaille' }),
      ev({ type: 'work-finished', id: id('agent') }),
    ]
    expect(replay(stream).view).toEqual(replay(stream).view)
  })

  it('never mutates the state it received', () => {
    const start = replay([created('solo')])
    const before = JSON.stringify(start.view)
    reduce(start, ev({ type: 'component-activated', id: id('solo') }))
    expect(JSON.stringify(start.view)).toBe(before)
  })
})

describe('artifacts and builds', () => {
  it('keeps only the latest version of an artifact', () => {
    const state = replay([
      created('planner'),
      ev({
        type: 'artifact-published',
        id: id('planner'),
        artifact: { title: 'Brouillon', body: 'premier jet' },
      }),
      ev({
        type: 'artifact-published',
        id: id('planner'),
        artifact: { title: 'Découpage', body: 'version finale', derivedFrom: 'du besoin' },
      }),
    ])
    expect(node(state, 'planner')?.artifact?.title).toBe('Découpage')
    expect(node(state, 'planner')?.artifact?.derivedFrom).toBe('du besoin')
  })

  it('keeps the artifact of a component that later fails', () => {
    const state = replay([
      created('talkative'),
      ev({
        type: 'artifact-published',
        id: id('talkative'),
        artifact: { title: "Ce que j'ai écrit", body: 'avant de tomber' },
      }),
      ev({
        type: 'component-failed',
        error: {
          code: 'activation-failed',
          message: 'boum',
          component: id('talkative'),
          name: 'talkative',
        },
      }),
      ev({
        type: 'artifact-published',
        id: id('talkative'),
        artifact: { title: 'Rattrapage', body: 'publié malgré la chute' },
      }),
    ])
    // What an agent wrote stays what it wrote, even if it falls afterwards.
    expect(node(state, 'talkative')?.artifact?.title).toBe('Rattrapage')
    expect(node(state, 'talkative')?.state).toBe('failed')
  })

  it('keeps the build origin and its builder', () => {
    const state = replay([
      created('builder'),
      created('part'),
      ev({
        type: 'component-built',
        id: id('part'),
        parent: id('builder'),
        build: { specification: 'spéc', source: 'code', route: 'composition' },
      }),
    ])
    expect(node(state, 'part')?.build?.route).toBe('composition')
    expect(node(state, 'part')?.builtBy).toBe('builder')
    expect(node(state, 'builder')?.build).toBeUndefined()
  })

  it('counts each visitor interaction, so a replayed run is not shown mutating over nothing', () => {
    expect(initialState().view.interactions).toBe(0)
    const state = replay([
      ev({ type: 'visitor-interacted', name: 'detecteur', input: 'a', version: 1, output: 'ok' }),
      ev({ type: 'visitor-interacted', name: 'detecteur', input: 'b', version: 1, output: 'ok' }),
    ])
    expect(state.view.interactions).toBe(2)
  })
})
