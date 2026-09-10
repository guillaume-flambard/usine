// Ce que ce fichier protège : la paire départ/arrivée d'un appel de modèle.
//
// Un départ sans arrivée laisse l'écran annoncer une réflexion qui ne se termine
// jamais, et c'est pire que pas de suivi du tout : un indicateur qui ment une
// fois n'est plus jamais regardé. L'API rend donc la clôture au lieu de la
// laisser retrouver, et la clôture est idempotente.

import { describe, expect, it } from 'vitest'
import { createKernel } from '../kernel'
import type { Component, ComponentContext } from '../contract'
import type { RunEvent } from '../events'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function recorded() {
  const kernel = createKernel()
  const events: RunEvent[] = []
  kernel.subscribe((event) => events.push(event))
  return { kernel, events }
}

/** Un composant qui donne son contexte, pour l'éprouver directement. */
function handing(onContext: (context: ComponentContext) => void): Component {
  return {
    name: 'penseur',
    display: { role: 'Réfléchit' },
    apply: onContext,
  }
}

const only = (events: readonly RunEvent[], type: string) => events.filter((e) => e.type === type)

describe('les événements de réflexion', () => {
  it('émet le départ tout de suite, et l’arrivée à la clôture', async () => {
    const { kernel, events } = recorded()
    let settle: ((failure?: string) => void) | undefined
    await kernel.load(handing((context) => (settle = context.beginReasoning('écrire le plan'))))
    await tick()

    const started = only(events, 'reasoning-started')
    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({ about: 'écrire le plan' })
    expect(only(events, 'reasoning-settled')).toHaveLength(0)

    settle?.()
    expect(only(events, 'reasoning-settled')).toHaveLength(1)
  })

  it('mesure la durée au lieu de la faire dire à l’appelant', async () => {
    const { kernel, events } = recorded()
    let settle: ((failure?: string) => void) | undefined
    await kernel.load(handing((context) => (settle = context.beginReasoning('penser'))))
    await tick()
    settle?.()

    const settled = only(events, 'reasoning-settled')[0]
    // Le champ existe, il est un nombre, et personne d'autre que le kernel ne
    // l'a fourni : c'est tout ce qu'on peut affirmer sans horloge figée.
    expect(typeof (settled as { ms: number }).ms).toBe('number')
  })

  it('porte la raison de la retombée quand il y en a une', async () => {
    const { kernel, events } = recorded()
    let settle: ((failure?: string) => void) | undefined
    await kernel.load(handing((context) => (settle = context.beginReasoning('penser'))))
    await tick()
    settle?.('relais injoignable')

    expect(only(events, 'reasoning-settled')[0]).toMatchObject({ failure: 'relais injoignable' })
  })

  it('ne produit pas deux arrivées pour un même départ', async () => {
    // L'appelant pose une ceinture en plus de sa bretelle : ça ne doit pas
    // compter deux fois, sinon le réducteur verrait une attente de trop.
    const { kernel, events } = recorded()
    let settle: ((failure?: string) => void) | undefined
    await kernel.load(handing((context) => (settle = context.beginReasoning('penser'))))
    await tick()
    settle?.()
    settle?.()
    settle?.('trop tard')

    expect(only(events, 'reasoning-settled')).toHaveLength(1)
  })

  it('n’annonce rien pour un composant déjà relâché, et sa clôture reste sûre', async () => {
    // Un mort ne réfléchit pas. Et la clôture rendue doit rester appelable :
    // l'appelant ne doit pas avoir à se demander ce qui s'est passé.
    const { kernel, events } = recorded()
    let context: ComponentContext | undefined
    const id = await kernel.load(handing((c) => (context = c)))
    await tick()
    if (id !== undefined) await kernel.release(id)

    const settle = context?.beginReasoning('penser')
    expect(only(events, 'reasoning-started')).toHaveLength(0)
    expect(() => settle?.()).not.toThrow()
    expect(only(events, 'reasoning-settled')).toHaveLength(0)
  })
})
