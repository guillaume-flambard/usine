// Epic 3 — la décision humaine. Le run s'arrête, montre sur quoi il demande
// de trancher, et la décision a des conséquences visibles.
import { describe, expect, it, vi } from 'vitest'
import { creerPilote } from '../pilote'
import { claimCheck } from '../../scenarios/claim-check'
import { creerNoyau } from '../../runtime/noyau'
import { porteHumaine } from '../../agents/deterministes'
import type { Composant, IdComposant } from '../../runtime/contrat'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

async function jusquALaPorte() {
  const pilote = creerPilote(claimCheck)
  await pilote.demarrer(claimCheck.brief)
  await tick()
  return pilote
}

describe("la porte s'arrête et attend", () => {
  it('arrête le run sans que rien ne la franchisse', async () => {
    const pilote = await jusquALaPorte()

    expect(pilote.phase()).toBe('Décision')
    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    expect(pilote.store.etat.value.porte?.decision).toBeUndefined()
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).toBe(
      'en-attente-de-dependance',
    )
  })

  it('montre ce qui a été produit et ce que le sceptique a relevé', async () => {
    const pilote = await jusquALaPorte()
    const porte = pilote.store.etat.value.porte

    expect(porte?.objet.resume).toContain('fabriquée pendant le run')
    expect(porte?.objet.resume).toContain('Approuver')
    // Une décision qui ne porterait sur rien ne vaudrait rien.
    expect(porte?.objet.objection).toContain('reformulée')
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
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).toBe(
      'en-attente-de-dependance',
    )
  })
})

describe('approuver', () => {
  it('poursuit le run jusqu à la livraison', async () => {
    const pilote = await jusquALaPorte()
    expect(pilote.approuver()).toBe(true)
    await tick()

    expect(pilote.store.etat.value.porte?.decision).toBe('approuve')
    expect(pilote.phase()).toBe('Terminé')
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).toBe('termine')
  })

  it('trace la décision dans le journal et dans un artefact', async () => {
    const pilote = await jusquALaPorte()
    pilote.approuver()
    await tick()

    const porteNoeud = pilote.store.etat.value.noeuds.find((n) => n.nom === 'porte-humaine')
    expect(porteNoeud?.artefact?.titre).toBe('Décision humaine')
    expect(porteNoeud?.artefact?.corps).toContain('Approuvée')
    // Approuver, c'est passer outre l'objection, pas en découler.
    expect(porteNoeud?.artefact?.decouleDe).toContain("l'examen de l'objection")
    expect(pilote.store.etat.value.journal.some((m) => m.message.includes('approuvée'))).toBe(true)
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
    expect(pilote.store.etat.value.noeuds.find((n) => n.nom === 'livraison')?.etat).not.toBe(
      'termine',
    )
  })

  it('montre la rétractation au lieu de figer le graphe', async () => {
    const pilote = await jusquALaPorte()
    const piece = () =>
      pilote.store.etat.value.noeuds.find((n) => n.nom === 'verificateur-allegations')
    expect(piece()?.etat).toBe('termine')

    await pilote.ecarter()
    await tick()

    // La pièce fabriquée est libérée, et ça se voit.
    expect(piece()?.etat).toBe('libere')
    // La porte, elle, reste visible : c'est la trace de ce qui a été tranché.
    expect(pilote.store.etat.value.porte?.decision).toBe('ecarte')
  })

  it('consigne le refus dans un artefact consultable', async () => {
    const pilote = await jusquALaPorte()
    await pilote.ecarter()
    await tick()

    const porteNoeud = pilote.store.etat.value.noeuds.find((n) => n.nom === 'porte-humaine')
    expect(porteNoeud?.artefact?.corps).toContain('Écartée')
  })

  it('ne se prend pas après une approbation', async () => {
    const pilote = await jusquALaPorte()
    pilote.approuver()
    await tick()
    expect(await pilote.ecarter()).toBe(false)
  })
})

describe("l'objection du sceptique", () => {
  it("cite un élément précis d'un artefact produit en amont", async () => {
    const pilote = await jusquALaPorte()
    const objection = pilote.store.etat.value.porte?.objet.objection ?? ''

    // Une objection générique ne satisferait pas l'exigence : elle doit
    // s'appuyer sur ce qui a réellement été produit.
    expect(objection).toMatch(/\d+ sorties/)
    expect(objection).toMatch(/\d+ critères/)
  })
})

describe('la porte quand rien n a pu être fabriqué', () => {
  const amont: Composant = {
    nom: 'amont-sterile',
    fournit: ['sortie-produit', 'objection'],
    presentation: { libelle: 'Amont', role: 'Ne fabrique rien' },
    applique(contexte) {
      contexte.fournir('sortie-produit', { fabrique: false })
      contexte.fournir('objection', { texte: 'Rien à attaquer.' })
      contexte.terminer()
    },
  }

  it("s'ouvre quand même et le dit", async () => {
    const noyau = creerNoyau()
    await noyau.charger(amont)
    await noyau.charger(porteHumaine)
    await tick()

    // La porte ne doit pas dépendre de la pièce qu'elle permet de refuser :
    // sinon elle ne s'ouvrirait jamais quand la fabrication échoue.
    const enAttente = noyau.portesEnAttente()
    expect(enAttente).toHaveLength(1)
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
