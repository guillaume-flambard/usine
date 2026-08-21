// Un agent qui répète une action refusée.
//
// Vu en production : le maître a émis six fois « remove » pour un agent qu'il
// n'avait pas créé, chaque refus lui apprenant exactement rien. Trois tours
// brûlés, aucun produit.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import { startFactory } from '../../orchestration/factory'
import type { Reasoner } from '../../runtime/reasoner'
import type { RunEvent } from '../../runtime/events'

/** Un modèle qui s'obstine, comme le vrai s'est obstiné. */
function stubborn(): Reasoner {
  return {
    origin: 'llm',
    reason: async () => ({
      text: JSON.stringify({
        thought: 'je retire cet agent',
        actions: [
          { type: 'remove', name: 'screen-builder' },
          { type: 'remove', name: 'screen-builder' },
          { type: 'remove', name: 'screen-builder' },
          { type: 'remove', name: 'screen-builder' },
        ],
      }),
      origin: 'llm' as const,
      tokens: { input: 10, output: 10 },
    }),
  }
}

describe('un agent qui s’obstine', () => {
  it('apprend ce qu’il peut faire, puis s’arrête au lieu de brûler ses tours', async () => {
    const kernel = createKernel()
    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))

    await startFactory(kernel, {
      brief: 'peu importe',
      reasoner: stubborn(),
      sources: [],
      stepMs: 10,
      settleTimeoutMs: 1500,
    })
    const deadline = Date.now() + 6000
    while (Date.now() < deadline && kernel.pendingGates().length === 0) {
      await new Promise((next) => setTimeout(next, 10))
    }

    const said = events
      .filter((event) => event.type === 'message-emitted')
      .map((event) => (event as { message: string }).message)

    // Le refus apprend quelque chose : il nomme l'action à employer.
    expect(said.some((message) => message.includes('« create »'))).toBe(true)
    // Et l'agent s'arrête plutôt que de répéter jusqu'à épuisement.
    expect(said.some((message) => message.includes("il s'arrête"))).toBe(true)
    // La quatrième tentative n'a jamais eu lieu.
    expect(said.filter((message) => message.startsWith('refusé')).length).toBeLessThanOrEqual(3)

    await kernel.releaseAll()
  }, 15_000)
})
