// Epic 3 — la décision humaine. Le run s'arrête, montre sur quoi il demande
// de trancher, et la décision a des conséquences visibles.
import { describe, expect, it, vi } from 'vitest'
import { creerNoyau } from '../../runtime/noyau'
import type { Composant, IdComposant } from '../../runtime/contrat'
import { jusqua, runJusquALaPorte } from './aide'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

const jusquALaPorte = () => runJusquALaPorte()

describe("la porte s'arrête et attend", () => {
  it('arrête le run sans que rien ne la franchisse', async () => {
    const pilote = await jusquALaPorte()

    expect(pilote.phase()).toBe('Décision')
    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    // Rien n'est livré tant que personne n'a tranché.
    expect(pilote.produit()).toBeUndefined()
  })

  it('montre ce qui a réellement été produit, et ce qu on lui oppose', async () => {
    const pilote = await jusquALaPorte()
    const porte = pilote.store.etat.value.porte

    expect(porte?.objet.resume).toContain('agents ont été créés')
    expect(porte?.objet.resume).toContain('Approuver')
    // Une décision qui ne porterait sur rien ne vaudrait rien.
    expect((porte?.objet.objection ?? '').trim().length).toBeGreaterThan(20)
  })
})

describe('aucun délai ne franchit la porte', () => {
  it('tient dix minutes de temps simulé', async () => {
    const pilote = await jusquALaPorte()
    expect(pilote.phase()).toBe('Décision')

    // Des ticks à zéro milliseconde ne prouvent rien : un `setTimeout` de
    // cinq secondes passerait au travers. On avance vraiment le temps.
    vi.useFakeTimers()
    try {
      await vi.advanceTimersByTimeAsync(600_000)
    } finally {
      vi.useRealTimers()
    }
    await tick()

    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    expect(pilote.phase()).toBe('Décision')
    expect(pilote.produit()).toBeUndefined()
  })
})

describe('approuver', () => {
  it('poursuit le run jusqu à la livraison', async () => {
    const pilote = await jusquALaPorte()
    expect(pilote.approuver()).toBe(true)
    await tick()

    await jusqua(() => pilote.produit() !== undefined)
    expect(pilote.store.etat.value.porte?.decision).toBe('approuve')
    // La livraison, c'est le produit devenu manipulable : la fonction que le
    // run a écrite, exécutable depuis la page.
    expect(typeof pilote.produit()?.executer).toBe('function')
  })

  it('trace la décision dans le journal', async () => {
    const pilote = await jusquALaPorte()
    pilote.approuver()
    await jusqua(() => pilote.store.etat.value.journal.some((m) => m.message.includes('approuvé')))

    expect(pilote.store.etat.value.journal.some((m) => m.message.includes('approuvé'))).toBe(true)
    expect(pilote.store.etat.value.porte?.decision).toBe('approuve')
  })

  it('ne se prend pas deux fois', async () => {
    const pilote = await jusquALaPorte()
    expect(pilote.approuver()).toBe(true)
    await tick()
    expect(pilote.approuver()).toBe(false)
  })
})

describe('écarter', () => {
  it('empêche la livraison', async () => {
    const pilote = await jusquALaPorte()
    expect(await pilote.ecarter()).toBe(true)
    await tick()

    expect(pilote.store.etat.value.porte?.decision).toBe('ecarte')
    expect(pilote.phase()).toBe('Écarté')
    expect(pilote.fini()).toBe(true)
    expect(pilote.produit()).toBeUndefined()
  })

  it('montre la rétractation au lieu de figer le graphe', async () => {
    const pilote = await jusquALaPorte()
    const piece = () => pilote.store.etat.value.noeuds.find((n) => n.fabrication !== undefined)
    expect(piece()?.etat).toBe('termine')

    await pilote.ecarter()
    await tick()

    // La pièce fabriquée est libérée, et ça se voit.
    expect(piece()?.etat).toBe('libere')
    // La porte, elle, reste visible : c'est la trace de ce qui a été tranché.
    expect(pilote.store.etat.value.porte?.decision).toBe('ecarte')
  })

  it('consigne le refus dans le journal', async () => {
    const pilote = await jusquALaPorte()
    await pilote.ecarter()
    await jusqua(() => pilote.store.etat.value.journal.some((m) => m.message.includes('écarté')))

    expect(pilote.store.etat.value.journal.some((m) => m.message.includes('écarté'))).toBe(true)
  })

  it('ne se prend pas après une approbation', async () => {
    const pilote = await jusquALaPorte()
    pilote.approuver()
    await tick()
    expect(await pilote.ecarter()).toBe(false)
  })
})

describe("l'objection", () => {
  it('porte sur ce qui a réellement été produit', async () => {
    const pilote = await jusquALaPorte()
    const objection = pilote.store.etat.value.porte?.objet.objection ?? ''

    // Une objection générique ne satisferait pas l'exigence : elle doit
    // s'appuyer sur ce que ce run-là a produit.
    expect(objection).toContain('motifs')
  })
})

describe('le noyau, à la frontière', () => {
  const composantPorte = (surDecision?: () => void): Composant => ({
    nom: 'porte-test',
    presentation: { libelle: 'Porte', role: 'Attend' },
    applique(contexte) {
      contexte.attendreDecision({ resume: 'résumé', objection: 'objection' }, () => {
        surDecision?.()
      })
    },
  })

  it('inscrit puis retire la porte', async () => {
    const noyau = creerNoyau()
    const id = await noyau.charger(composantPorte())
    await tick()
    expect(noyau.portesEnAttente()).toEqual([id])

    expect(noyau.decider(id as IdComposant, 'approuve')).toBe(true)
    expect(noyau.portesEnAttente()).toEqual([])
  })

  it("rend faux et n'appelle rien quand aucune porte n'attend", async () => {
    const noyau = creerNoyau()
    let appels = 0
    const id = await noyau.charger(composantPorte(() => (appels += 1)))
    await tick()
    noyau.decider(id as IdComposant, 'approuve')
    expect(noyau.decider(id as IdComposant, 'ecarte')).toBe(false)
    expect(appels).toBe(1)
  })

  it('retire la porte quand son composant est libéré', async () => {
    const noyau = creerNoyau()
    const id = await noyau.charger(composantPorte())
    await tick()
    await noyau.liberer(id as IdComposant)
    await tick()
    expect(noyau.portesEnAttente()).toEqual([])
    expect(noyau.decider(id as IdComposant, 'approuve')).toBe(false)
  })

  it("n'expose pas l'exception d'un composant qui lève en apprenant la décision", async () => {
    const noyau = creerNoyau()
    const evenements: string[] = []
    noyau.abonner((e) => evenements.push(e.type))
    const id = await noyau.charger({
      nom: 'porte-fautive',
      presentation: { libelle: 'Porte', role: 'Lève à la décision' },
      applique(contexte) {
        contexte.attendreDecision({ resume: 'r', objection: 'o' }, () => {
          throw new Error('boum')
        })
      },
    })
    await tick()

    expect(() => noyau.decider(id as IdComposant, 'approuve')).not.toThrow()
    expect(evenements).toContain('composant-en-erreur')
  })
})
