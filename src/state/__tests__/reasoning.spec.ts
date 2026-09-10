// Ce que ce fichier protège : que l'écran sache dire qui attend un modèle, et
// surtout qu'il cesse de le dire.
//
// Le défaut d'origine : entre le départ d'un appel et son retour, le kernel
// n'émettait rien. Le nœud passait à « en cours » et y restait, identique à la
// première seconde et à la centième. Le pire mode de panne d'un suivi n'est pas
// l'absence de suivi, c'est un suivi qui reste allumé sur une attente terminée :
// il ment, et on ne le regarde plus.

import { describe, expect, it } from 'vitest'
import { initialState, reduce, type FullState } from '../reducer'
import type { RunEvent, WithoutSequence } from '../../runtime/events'
import type { ComponentId } from '../../runtime/contract'

const id = (name: string) => name as ComponentId

let sequence = 0
let clock = 0
const ev = (e: WithoutSequence, at = (clock += 100)): RunEvent =>
  ({ ...e, sequence: (sequence += 1), at }) as RunEvent

const created = (name: string): RunEvent =>
  ev({
    type: 'component-created',
    id: id(name),
    name,
    display: { role: `Rôle de ${name}` },
    needs: [],
    provides: [],
  })

const replay = (events: readonly RunEvent[]): FullState => events.reduce(reduce, initialState())

describe('le suivi de la réflexion', () => {
  it('ne montre personne tant que rien n’attend', () => {
    expect(replay([created('alice')]).view.thinking).toEqual([])
  })

  it('nomme qui attend, ce qu’on lui demande, et depuis quand', () => {
    const state = replay([
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'écrire le plan' }, 1500),
    ])
    expect(state.view.thinking).toEqual([
      { id: 'alice', author: 'alice', about: 'écrire le plan', since: 1500 },
    ])
  })

  it('efface l’attente quand l’appel revient', () => {
    const state = replay([
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'écrire le plan' }),
      ev({ type: 'reasoning-settled', id: id('alice'), ms: 4200 }),
    ])
    expect(state.view.thinking).toEqual([])
  })

  it('efface aussi quand l’appel est retombé sur la réponse écrite', () => {
    // Une retombée est une fin. Sans ça, l'écran annoncerait une réflexion
    // éternelle précisément le jour où le modèle n'a pas répondu.
    const state = replay([
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'écrire le plan' }),
      ev({ type: 'reasoning-settled', id: id('alice'), ms: 30_000, failure: 'relais injoignable' }),
    ])
    expect(state.view.thinking).toEqual([])
  })

  it('tient plusieurs agents qui réfléchissent en même temps', () => {
    const state = replay([
      created('alice'),
      created('bob'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'le plan' }),
      ev({ type: 'reasoning-started', id: id('bob'), about: 'les tests' }),
      ev({ type: 'reasoning-settled', id: id('alice'), ms: 900 }),
    ])
    expect(state.view.thinking.map((t) => t.author)).toEqual(['bob'])
  })

  it('ne montre pas deux fois le même agent si un départ en double arrive', () => {
    const state = replay([
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'premier' }),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'second' }),
    ])
    expect(state.view.thinking).toHaveLength(1)
    expect(state.view.thinking[0]?.about).toBe('second')
  })

  it('cesse de montrer un agent tombé pendant son appel', () => {
    // Le filet de sécurité : sans lui, un agent en faute resterait affiché « en
    // train de réfléchir » jusqu'à la fin du run.
    const state = replay([
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'le plan' }),
      ev({
        type: 'component-failed',
        error: { code: 'apply-failed', message: 'boum', component: id('alice'), name: 'alice' },
      }),
    ])
    expect(state.view.thinking).toEqual([])
  })

  it('cesse de montrer un agent relâché pendant son appel', () => {
    const state = replay([
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'le plan' }),
      ev({ type: 'component-released', id: id('alice') }),
    ])
    expect(state.view.thinking).toEqual([])
  })

  it('rend la même attente pour un run rejoué que pour un run vivant', () => {
    // `since` est un écoulé depuis le début du run, jamais une date absolue :
    // c'est ce qui fait qu'un rejeu affiche les mêmes chiffres.
    const events = [
      created('alice'),
      ev({ type: 'reasoning-started', id: id('alice'), about: 'le plan' }, 2500),
    ]
    expect(replay(events).view.thinking).toEqual(replay(events).view.thinking)
    expect(replay(events).view.thinking[0]?.since).toBe(2500)
  })
})
