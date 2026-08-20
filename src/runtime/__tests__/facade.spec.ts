// Couvre la façade donnée aux composants et le flux d'événements, là où
// `noyau.spec.ts` ne va pas : lecture de dépendance, narration, fin de
// travail, désabonnement, forme de la topologie et incidents d'abonnés.
import { describe, expect, it, vi } from 'vitest'
import { creerNoyau } from '../noyau'
import type { Composant, IdComposant } from '../contrat'
import type { EvenementRun } from '../evenements'

const tick = async () => {
  for (let index = 0; index < 3; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

function journal() {
  const noyau = creerNoyau()
  const evenements: EvenementRun[] = []
  const desabonner = noyau.abonner((evenement) => evenements.push(evenement))
  return { noyau, evenements, desabonner }
}

const fournisseur = (nom: string, cle: string, valeur: unknown): Composant => ({
  nom,
  fournit: [cle],
  presentation: { role: `Fournit ${cle}`, technologie: 'registre EU' },
  applique(contexte) {
    contexte.fournir(cle, valeur)
  },
})

describe('la façade du composant', () => {
  it('rend la valeur publiée et signale le transit', async () => {
    const { noyau, evenements } = journal()
    let recu: unknown
    await noyau.charger(fournisseur('registre-eu', 'registre', { articles: 12 }))
    await noyau.charger({
      nom: 'verificateur',
      injecte: ['registre'],
      presentation: { role: 'Lit le registre' },
      applique(contexte) {
        recu = contexte.lire('registre')
      },
    })
    await tick()

    expect(recu).toEqual({ articles: 12 })
    const transit = evenements.find((e) => e.type === 'valeur-transmise')
    expect(transit).toBeDefined()
    if (transit?.type === 'valeur-transmise') {
      expect(transit.nom).toBe('registre')
      expect(transit.de).toContain('registre-eu')
      expect(transit.vers).toContain('verificateur')
    }
  })

  it('signale le transit même quand la valeur publiée est indéfinie', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger(fournisseur('vide', 'registre', undefined))
    await noyau.charger({
      nom: 'lecteur',
      injecte: ['registre'],
      presentation: { role: 'Lit' },
      applique(contexte) {
        contexte.lire('registre')
      },
    })
    await tick()

    expect(evenements.some((e) => e.type === 'valeur-transmise')).toBe(true)
  })

  it('refuse de publier ou de lire un nom non déclaré, et l activation échoue', async () => {
    for (const cas of ['fournir', 'lire'] as const) {
      const { noyau, evenements } = journal()
      await noyau.charger({
        nom: `indiscipline-${cas}`,
        presentation: { role: 'Sort de sa déclaration' },
        applique(contexte) {
          if (cas === 'fournir') contexte.fournir('inconnu', 1)
          else contexte.lire('inconnu')
        },
      })
      await tick()

      const erreur = evenements.find((e) => e.type === 'composant-en-erreur')
      expect(erreur?.type === 'composant-en-erreur' && erreur.erreur.code).toBe(
        'dependance-inconnue',
      )
      expect(evenements.some((e) => e.type === 'composant-active')).toBe(false)
      expect(noyau.introspecter().composants[0]?.etat).toBe('en-erreur')
    }
  })

  it('porte la narration et la fin de travail jusqu au flux et à la topologie', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger({
      nom: 'planificateur',
      presentation: { role: 'Découpe le besoin' },
      applique(contexte) {
        contexte.emettre('Découpe le besoin en quatre histoires.')
        contexte.terminer()
      },
    })
    await tick()

    const message = evenements.find((e) => e.type === 'message-emis')
    expect(message?.type === 'message-emis' && message.message).toBe(
      'Découpe le besoin en quatre histoires.',
    )
    expect(evenements.some((e) => e.type === 'travail-termine')).toBe(true)
    expect(noyau.introspecter().composants[0]?.termine).toBe(true)
  })

  it('nomme la dépendance partie dans la cause de désactivation', async () => {
    const { noyau, evenements } = journal()
    await noyau.charger({
      nom: 'verificateur',
      injecte: ['registre'],
      presentation: { role: 'Attend le registre' },
      applique() {},
    })
    const idOutil = await noyau.charger(fournisseur('registre-eu', 'registre', {}))
    await tick()
    expect(idOutil).toBeDefined()

    await noyau.liberer(idOutil as IdComposant)
    await tick()

    const desactive = evenements.find((e) => e.type === 'composant-desactive')
    expect(desactive?.type === 'composant-desactive' && desactive.cause).toEqual({
      genre: 'dependance-partie',
      noms: ['registre'],
    })
    expect(evenements.some((e) => e.type === 'composant-libere')).toBe(true)
  })

  it('décrit chaque nœud avec son rôle, sa technologie et ses noms déclarés', async () => {
    const { noyau } = journal()
    await noyau.charger(fournisseur('registre-eu', 'registre', {}))
    await tick()

    const noeud = noyau.introspecter().composants[0]
    expect(noeud?.presentation.role).toBe('Fournit registre')
    expect(noeud?.presentation.technologie).toBe('registre EU')
    expect(noeud?.fournit).toEqual(['registre'])
    expect(noeud?.injecte).toEqual([])
  })

  it('expose le lien de parenté des composants chargés en cascade', async () => {
    const { noyau } = journal()
    await noyau.charger({
      nom: 'maitre',
      presentation: { role: 'Charge un enfant' },
      applique(contexte) {
        void contexte.charger({
          nom: 'enfant',
          presentation: { role: 'Chargé par le maître' },
          applique() {},
        })
      },
    })
    await tick()

    const enfant = noyau.introspecter().composants.find((c) => c.nom === 'enfant')
    expect(enfant?.parent).toContain('maitre')
  })

  it('ne relie pas à lui-même un composant qui publie et consomme le même nom', async () => {
    const { noyau } = journal()
    await noyau.charger({
      nom: 'boucle',
      fournit: ['memoire'],
      injecte: ['memoire'],
      presentation: { role: 'Publie et consomme' },
      applique(contexte) {
        contexte.fournir('memoire', {})
      },
    })
    await tick()

    expect(noyau.introspecter().dependances).toHaveLength(0)
  })

  it('cesse de livrer après désabonnement', async () => {
    const { noyau, evenements, desabonner } = journal()
    await noyau.charger(fournisseur('registre-eu', 'registre', {}))
    await tick()
    const avant = evenements.length
    expect(avant).toBeGreaterThan(0)

    desabonner()
    await noyau.charger({
      nom: 'autre',
      presentation: { role: 'Après désabonnement' },
      applique() {},
    })
    await tick()

    expect(evenements).toHaveLength(avant)
  })

  it('isole un abonné qui lève : les autres reçoivent, le composant reste actif', async () => {
    const noyau = creerNoyau()
    const recus: EvenementRun[] = []
    noyau.abonner(() => {
      throw new Error('abonné fautif')
    })
    noyau.abonner((evenement) => recus.push(evenement))

    await noyau.charger({
      nom: 'sain',
      presentation: { role: 'Ne fait rien de mal' },
      applique() {},
    })
    await tick()

    expect(noyau.introspecter().composants[0]?.etat).toBe('actif')
    expect(recus.some((e) => e.type === 'composant-active')).toBe(true)
    const incident = recus.find((e) => e.type === 'abonne-en-erreur')
    expect(incident?.type === 'abonne-en-erreur' && incident.message).toBe('abonné fautif')
  })

  it('libère un composant dont le chargement était encore en vol', async () => {
    const { noyau } = journal()
    // Volontairement sans `await` : la libération est demandée avant que la
    // fibre existe.
    void noyau.charger({
      nom: 'en-vol',
      presentation: { role: 'Chargement non attendu' },
      applique() {},
    })
    await noyau.libererTout()
    await tick()

    expect(noyau.introspecter().composants).toHaveLength(0)
  })

  it('reste idempotent quand on libère deux fois le même composant', async () => {
    const { noyau, evenements } = journal()
    const id = await noyau.charger(fournisseur('registre-eu', 'registre', {}))
    await tick()
    await Promise.all([noyau.liberer(id as IdComposant), noyau.liberer(id as IdComposant)])
    await tick()

    expect(evenements.filter((e) => e.type === 'composant-libere')).toHaveLength(1)
  })

  it('rend inerte la façade conservée après libération', async () => {
    const { noyau, evenements } = journal()
    let facade: Parameters<Composant['applique']>[0] | undefined
    const id = await noyau.charger({
      nom: 'bavard',
      presentation: { role: 'Garde sa façade' },
      applique(contexte) {
        facade = contexte
      },
    })
    await tick()
    await noyau.liberer(id as IdComposant)
    await tick()
    const avant = evenements.length

    expect(() => facade?.emettre('trop tard')).not.toThrow()
    expect(() => facade?.effet(() => () => {}, 'trop tard')).not.toThrow()
    expect(evenements).toHaveLength(avant)
  })

  it('rend le nom réservé quand l activation du fournisseur échoue', async () => {
    const { noyau } = journal()
    await noyau.charger({
      nom: 'fournisseur-fautif',
      fournit: ['registre'],
      presentation: { role: 'Échoue avant de publier' },
      applique() {
        throw new Error('boum')
      },
    })
    await tick()

    const remplacant = await noyau.charger(fournisseur('registre-eu', 'registre', {}))
    await tick()
    expect(remplacant).toBeDefined()
  })

  it('n émet aucune sortie console', async () => {
    const espion = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { noyau } = journal()
    await noyau.charger(fournisseur('registre-eu', 'registre', {}))
    await tick()
    await noyau.libererTout()

    expect(espion).not.toHaveBeenCalled()
    espion.mockRestore()
  })
})
