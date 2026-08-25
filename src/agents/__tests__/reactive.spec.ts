// The reactive turn: the application answers what the visitor does with it.
//
// After construction settles, an authoring agent stays reachable and takes one
// bounded turn when a visitor interaction names a behaviour it wrote. Nothing
// here is scripted in src/ — a fake model decides, as always, what to do with
// the interaction it is shown.
import { describe, expect, it, vi } from 'vitest'
import { createKernel, type Kernel } from '../../runtime/kernel'
import { startFactory, liveBehaviours } from '../../orchestration/factory'
import { BUDGET, type Budget, type Worksite } from '../free-agent'
import { spawnVmWorker } from './vm-worker'
import type { RunEvent } from '../../runtime/events'
import type { Reasoner } from '../../runtime/reasoner'
import type { Interaction } from '../../app/session'

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 5))

async function until(condition: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return true
    await breathe()
  }
  return condition()
}

const SCREEN =
  '<h1>Outil</h1>' +
  '<textarea data-field="texte"></textarea>' +
  '<button data-invoke="detecteur">Analyser</button>' +
  '<div data-output="detecteur"></div>'

// Two behaviours by two authors, so ownership can be told apart: « detecteur »
// belongs to the artisan, « autre » to the garde.
const CODE = (mark: string) => `(x) => '${mark}'`
const BROKEN = '(x) => ('

/** What the reactive turn should return, given its context. */
type ReactiveActions = (context: string) => unknown[] | undefined

function reactiveModel(reactive: ReactiveActions): Reasoner {
  const turn = (thought: string, actions: unknown[]) => JSON.stringify({ thought, actions })
  const tokens = { input: 100, output: 40 }
  return {
    origin: 'llm',
    reason: vi.fn(async ({ context }) => {
      // The reactive turn: the visitor just used a behaviour.
      if (context.includes('Le visiteur a appelé')) {
        const actions = reactive(context) ?? [{ type: 'done', summary: '' }]
        return { text: turn('je réagis à l’usage', actions), origin: 'llm' as const, tokens }
      }
      // The master brings the two authors into existence, once.
      if (context.includes('Toi : master-agent')) {
        if (context.includes('« artisan » existe maintenant')) {
          return { text: turn('lancé', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('deux artisans', [
            {
              type: 'create',
              name: 'artisan',
              label: 'Artisan',
              role: 'écrit le détecteur',
              mission: 'Poser l’écran et écrire le comportement « detecteur ».',
              needs: [],
              provides: [],
            },
            {
              type: 'create',
              name: 'garde',
              label: 'Garde',
              role: 'écrit un autre comportement',
              mission: 'Écrire le comportement « autre ».',
              needs: [],
              provides: [],
            },
            { type: 'done', summary: '' },
          ]),
          origin: 'llm' as const,
          tokens,
        }
      }
      // The artisan posts the screen and writes « detecteur ».
      if (context.includes('Toi : artisan')) {
        if (context.includes('sert maintenant')) {
          return { text: turn('fait', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('je pose et j’écris', [
            { type: 'screen', markup: SCREEN },
            { type: 'build', name: 'detecteur', code: CODE('v1') },
          ]),
          origin: 'llm' as const,
          tokens,
        }
      }
      // The garde writes « autre ».
      if (context.includes('Toi : garde')) {
        if (context.includes('sert maintenant')) {
          return { text: turn('fait', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('j’écris', [{ type: 'build', name: 'autre', code: CODE('a1') }]),
          origin: 'llm' as const,
          tokens,
        }
      }
      return { text: turn('rien', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
    }),
  }
}

interface Started {
  kernel: Kernel
  worksite: Worksite
  events: RunEvent[]
}

async function startReactiveRun(
  reactive: ReactiveActions,
  budget: Budget = BUDGET,
): Promise<Started> {
  const kernel = createKernel()
  const events: RunEvent[] = []
  kernel.subscribe((event) => events.push(event))
  const { worksite } = await startFactory(kernel, {
    brief: 'Un outil que le visiteur va essayer.',
    reasoner: reactiveModel(reactive),
    spawnWorker: spawnVmWorker,
    sources: [],
    budget,
    stepMs: 10,
    settleTimeoutMs: 4000,
  })
  await until(() => kernel.pendingGates().length > 0)
  return { kernel, worksite, events }
}

const interaction = (name: string, input = 'un essai'): Interaction => ({
  index: 1,
  name,
  input,
  version: 1,
})

// The component-replaced event names the component (« detecteur-v2 »), not the
// behaviour; a versioned replacement of « detecteur » is any whose name carries
// it.
const replacementsOf = (events: RunEvent[], name: string) =>
  events.filter((e) => e.type === 'component-replaced' && e.name.includes(name))

describe('the application answers what the visitor does', () => {
  it('registers a responder for every behaviour its author wrote', async () => {
    const { kernel, worksite } = await startReactiveRun(() => [{ type: 'done', summary: '' }])

    // Each behaviour has a responder — and only its author's turn can be woken
    // through it, because only the author registered one.
    expect(worksite.responders.has('detecteur')).toBe(true)
    expect(worksite.responders.has('autre')).toBe(true)
    await kernel.releaseAll()
  }, 20000)

  it('drives the authoring agent to replace, in answer to the interaction', async () => {
    const { kernel, worksite, events } = await startReactiveRun((context) =>
      // The visitor used « detecteur »; the artisan improves it.
      context.includes('detecteur') ? [{ type: 'replace', name: 'detecteur', code: CODE('v2') }] : undefined,
    )

    worksite.observe(interaction('detecteur'))
    await until(() => replacementsOf(events, 'detecteur').length > 0)

    // A real replacement took, and the new version is what answers now.
    expect(replacementsOf(events, 'detecteur')).toHaveLength(1)
    const behaviour = liveBehaviours(kernel).find((b) => b.name === 'detecteur')
    expect(behaviour?.version).toBe(2)
    expect((await behaviour?.call('x'))?.output).toBe('v2')
    await kernel.releaseAll()
  }, 20000)

  it('refuses to let an agent replace a behaviour it did not author', async () => {
    const { kernel, worksite, events } = await startReactiveRun(() =>
      // Woken for « detecteur », the artisan reaches for « autre » — the garde's.
      [{ type: 'replace', name: 'autre', code: CODE('a2') }],
    )

    worksite.observe(interaction('detecteur'))
    await breathe()
    await until(() => false, 200)

    // The guard holds on the reactive path too: nothing replaced « autre ».
    expect(replacementsOf(events, 'autre')).toHaveLength(0)
    const other = liveBehaviours(kernel).find((b) => b.name === 'autre')
    expect((await other?.call('x'))?.output).toBe('a1')
    await kernel.releaseAll()
  }, 20000)

  it('is bounded: past the reaction budget, the app stops mutating', async () => {
    const { kernel, worksite, events } = await startReactiveRun(
      () => [{ type: 'replace', name: 'detecteur', code: CODE('v2') }],
      { ...BUDGET, maxReactions: 1 },
    )

    worksite.observe(interaction('detecteur'))
    await until(() => replacementsOf(events, 'detecteur').length > 0)
    // The budget is spent; a second interaction wakes nothing.
    worksite.observe(interaction('detecteur'))
    await until(() => false, 200)

    expect(replacementsOf(events, 'detecteur')).toHaveLength(1)
    expect(worksite.reactionsLeft).toBe(0)
    await kernel.releaseAll()
  }, 20000)

  it('leaves the previous version serving when a reactive replace fails', async () => {
    const { kernel, worksite, events } = await startReactiveRun(() =>
      [{ type: 'replace', name: 'detecteur', code: BROKEN }],
    )

    worksite.observe(interaction('detecteur'))
    await breathe()
    await until(() => false, 200)

    // A replacement that does not compile leaves no replacement event, and the
    // version the visitor was using keeps answering.
    expect(replacementsOf(events, 'detecteur')).toHaveLength(0)
    const behaviour = liveBehaviours(kernel).find((b) => b.name === 'detecteur')
    expect(behaviour?.version).toBe(1)
    expect((await behaviour?.call('x'))?.output).toBe('v1')
    await kernel.releaseAll()
  }, 20000)
})
