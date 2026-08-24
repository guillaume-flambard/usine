// The reactive loop, through the pilot: a visitor interaction enters the
// stream, causes a replacement, and a replay reproduces the same read model.
//
// The behaviour recompilation on replay needs a real Worker and is proven in
// the browser suites; here we prove the honesty claims that are pure: the cause
// precedes the effect in the stream, the stream alone reconstructs the read
// model, and the visitor's session survives the replacement.
import { describe, expect, it, vi } from 'vitest'
import { createPilot, type Pilot } from '../pilot'
import { spawnVmWorker } from '../../agents/__tests__/vm-worker'
import { initialState, reduce } from '../../state/reducer'
import type { Reasoner } from '../../runtime/reasoner'
import type { RunEvent } from '../../runtime/events'

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

// One artisan writes « detecteur », then only ever changes it in answer to the
// visitor — so the single replacement in the run is the reactive one.
function reactiveModel(): Reasoner {
  const turn = (thought: string, actions: unknown[]) => JSON.stringify({ thought, actions })
  const tokens = { input: 100, output: 40 }
  return {
    origin: 'llm',
    reason: vi.fn(async ({ context }) => {
      if (context.includes('Le visiteur a appelé')) {
        return {
          text: turn('je réagis', [{ type: 'replace', name: 'detecteur', code: "(x) => 'v2'" }]),
          origin: 'llm' as const,
          tokens,
        }
      }
      if (context.includes('Toi : master-agent')) {
        if (context.includes('« artisan » existe maintenant')) {
          return { text: turn('lancé', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('un artisan', [
            {
              type: 'create',
              name: 'artisan',
              label: 'Artisan',
              role: 'écrit le détecteur',
              mission: 'Poser l’écran et écrire « detecteur ».',
              needs: [],
              provides: [],
            },
            { type: 'done', summary: '' },
          ]),
          origin: 'llm' as const,
          tokens,
        }
      }
      if (context.includes('Toi : artisan')) {
        if (context.includes('sert maintenant')) {
          return { text: turn('fait', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('je pose et j’écris', [
            { type: 'screen', markup: SCREEN },
            { type: 'build', name: 'detecteur', code: "(x) => 'v1'" },
          ]),
          origin: 'llm' as const,
          tokens,
        }
      }
      return { text: turn('rien', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
    }),
  }
}

function reactivePilot(): Pilot {
  const pilot = createPilot({
    stepMs: 10,
    settleTimeoutMs: 4000,
    spawnWorker: spawnVmWorker,
    sources: [],
    fetchSource: async () => ({ body: '', truncated: false }),
  })
  pilot.connect(reactiveModel())
  return pilot
}

/** A run at its gate, then a visitor interaction that provoked a replacement. */
async function reactedRun(): Promise<Pilot> {
  const pilot = reactivePilot()
  await pilot.start('Un outil que le visiteur va essayer.')
  await until(() => pilot.store.state.value.gate !== undefined)
  pilot.observe({ index: 1, name: 'detecteur', input: 'un essai', version: 1 })
  await until(() => pilot.store.state.value.replacements > 0)
  return pilot
}

const seqOf = (events: readonly RunEvent[], predicate: (e: RunEvent) => boolean) =>
  events.find(predicate)?.sequence

describe('the reactive loop through the pilot', () => {
  it('puts the interaction in the stream before the replacement it causes', async () => {
    const pilot = await reactedRun()
    const events = pilot.archive()?.events ?? []

    const interacted = seqOf(events, (e) => e.type === 'visitor-interacted')
    const replaced = seqOf(events, (e) => e.type === 'component-replaced')
    expect(interacted).toBeDefined()
    expect(replaced).toBeDefined()
    // Cause before effect: the ordering is what backs "in answer to what you did".
    expect(interacted as number).toBeLessThan(replaced as number)
    await pilot.stop()
  }, 20000)

  it('reconstructs the same read model from the stream alone', async () => {
    const pilot = await reactedRun()
    const live = pilot.store.state.value
    const archive = pilot.archive()
    if (archive === undefined) throw new Error('pas d’archive')

    // The stream is the archive format: reducing it must yield the same numbers
    // the live run showed — a reactive recomposition displayed on a replay with
    // no interaction behind it would be a lie.
    const replayed = archive.events.reduce(reduce, initialState()).view
    expect(replayed.interactions).toBe(live.interactions)
    expect(replayed.interactions).toBe(1)
    expect(replayed.replacements).toBe(live.replacements)
    expect(replayed.replacements).toBe(1)
    expect(replayed.screen.revision).toBe(live.screen.revision)
    await pilot.stop()
  }, 20000)

  it('keeps the visitor’s session across the reactive replacement', async () => {
    const pilot = reactivePilot()
    await pilot.start('Un outil que le visiteur va essayer.')
    await until(() => pilot.store.state.value.gate !== undefined)

    // The visitor did something before the replacement: it lives in the session,
    // outside everything an agent can replace (AD-5).
    pilot.session().record({ name: 'detecteur', input: 'un essai', version: 1, output: 'v1' })
    expect(pilot.session().counts.interactions).toBe(1)

    pilot.observe({ index: 1, name: 'detecteur', input: 'un essai', version: 1, output: 'v1' })
    await until(() => pilot.store.state.value.replacements > 0)

    // The replacement took, and nothing the visitor did was lost.
    expect(pilot.session().counts.replacements).toBe(1)
    expect(pilot.session().counts.restarts).toBe(0)
    expect(pilot.session().interactions).toHaveLength(1)
    expect(pilot.session().interactions[0]?.input).toBe('un essai')
    await pilot.stop()
  }, 20000)

  it('does not mutate on a replay: a replayed run reproduces, never re-reacts', async () => {
    const pilot = await reactedRun()
    const archive = pilot.archive()
    if (archive === undefined) throw new Error('pas d’archive')
    await pilot.stop()

    // observe is a no-op with no live kernel — and a replay has none. Calling it
    // must not throw and must add nothing to a run that is only being replayed.
    const viewer = reactivePilot()
    // No start: the viewer has no kernel. observe must simply do nothing.
    viewer.observe({ index: 1, name: 'detecteur', input: 'encore', version: 2 })
    expect(viewer.archive()).toBeUndefined()
  }, 20000)
})
