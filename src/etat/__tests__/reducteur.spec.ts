import { describe, expect, it } from 'vitest'
import { etatInitial, reduire, type EtatComplet } from '../reducteur'
import type { EvenementRun, SansSequence } from '../../runtime/evenements'
import type { IdComposant } from '../../runtime/contrat'

const id = (nom: string) => nom as IdComposant

let sequence = 0
const suivant = () => (sequence += 1)

function cree(nom: string, injecte: string[] = [], fournit: string[] = []): EvenementRun {
  return {
    type: 'composant-cree',
    sequence: suivant(),
    id: id(nom),
    nom,
    presentation: { role: `Rôle de ${nom}` },
    injecte,
    fournit,
  }
}

// `SansSequence` est distributif : sans lui, `Omit` sur l'union ne garderait
// que les clés communes et les variantes cesseraient d'être vérifiées.
const evt = (e: SansSequence): EvenementRun => ({ ...e, sequence: suivant() }) as EvenementRun

function rejouer(evenements: readonly EvenementRun[]): EtatComplet {
  return evenements.reduce(reduire, etatInitial())
}

const noeud = (etat: EtatComplet, nom: string) => etat.vue.noeuds.find((n) => n.nom === nom)

describe('réducteur', () => {
  it('crée un nœud inactif quand il ne déclare aucune dépendance', () => {
    const etat = rejouer([cree('solo')])
    expect(noeud(etat, 'solo')?.etat).toBe('inactif')
    expect(etat.vue.agentsVivants).toBe(1)
  })

  it('crée un nœud en attente quand il injecte quelque chose', () => {
    const etat = rejouer([cree('verificateur', ['registre'])])
    expect(noeud(etat, 'verificateur')?.etat).toBe('en-attente-de-dependance')
  })

  it('passe en cours à l activation', () => {
    const etat = rejouer([cree('solo'), evt({ type: 'composant-active', id: id('solo') })])
    expect(noeud(etat, 'solo')?.etat).toBe('en-cours')
  })

  it('passe terminé quand le travail est signalé', () => {
    const etat = rejouer([
      cree('solo'),
      evt({ type: 'composant-active', id: id('solo') }),
      evt({ type: 'travail-termine', id: id('solo') }),
    ])
    expect(noeud(etat, 'solo')?.etat).toBe('termine')
  })

  it('repasse en attente à la désactivation et retient la cause', () => {
    const etat = rejouer([
      cree('verificateur', ['registre']),
      evt({ type: 'composant-active', id: id('verificateur') }),
      evt({
        type: 'composant-desactive',
        id: id('verificateur'),
        cause: { genre: 'dependance-partie', noms: ['registre'] },
      }),
    ])
    const vu = noeud(etat, 'verificateur')
    expect(vu?.etat).toBe('en-attente-de-dependance')
    expect(vu?.cause).toEqual({ genre: 'dependance-partie', noms: ['registre'] })
  })

  it('met en erreur et y reste, même après une désactivation', () => {
    const etat = rejouer([
      cree('fautif', ['registre']),
      evt({
        type: 'composant-en-erreur',
        erreur: {
          code: 'echec-activation',
          message: 'boum',
          composant: id('fautif'),
          nom: 'fautif',
        },
      }),
      evt({
        type: 'composant-desactive',
        id: id('fautif'),
        cause: { genre: 'liberation' },
      }),
    ])
    // Une désactivation après une erreur ne requalifie pas le nœud : le
    // réducteur reflète le cycle, et le cycle a été mis en défaut.
    expect(noeud(etat, 'fautif')?.erreur?.code).toBe('echec-activation')
    expect(etat.vue.incidents).toHaveLength(1)
  })

  it('consigne un incident sans identifiant sans toucher aux nœuds', () => {
    const etat = rejouer([
      cree('solo'),
      evt({
        type: 'composant-en-erreur',
        erreur: { code: 'nom-deja-fourni', message: 'déjà pris', nom: 'refuse' },
      }),
    ])
    expect(noeud(etat, 'solo')?.etat).toBe('inactif')
    expect(etat.vue.incidents).toHaveLength(1)
    expect(etat.vue.incidents[0]?.erreur.nom).toBe('refuse')
  })

  it('marque le nœud libéré et le garde visible', () => {
    const etat = rejouer([
      cree('solo'),
      evt({ type: 'composant-active', id: id('solo') }),
      evt({ type: 'composant-libere', id: id('solo') }),
    ])
    expect(noeud(etat, 'solo')?.etat).toBe('libere')
    expect(etat.vue.noeuds).toHaveLength(1)
    expect(etat.vue.agentsVivants).toBe(0)
  })

  it('ne garde comme narration que le message de plus haute séquence', () => {
    const etat = rejouer([
      cree('planificateur'),
      evt({ type: 'message-emis', id: id('planificateur'), message: 'premier' }),
      evt({ type: 'message-emis', id: id('planificateur'), message: 'second' }),
    ])
    expect(etat.vue.narration?.message).toBe('second')
    expect(etat.vue.journal).toHaveLength(2)
    expect(etat.vue.journal[0]?.auteur).toBe('planificateur')
  })

  it('déduit les arêtes des noms déclarés et marque le transit', () => {
    const etat = rejouer([
      cree('outil', [], ['registre']),
      cree('agent', ['registre']),
      evt({
        type: 'valeur-transmise',
        de: id('outil'),
        vers: id('agent'),
        nom: 'registre',
      }),
    ])
    expect(etat.vue.aretes).toHaveLength(1)
    expect(etat.vue.aretes[0]?.aTransite).toBe(true)
  })

  it('ne relie pas un nœud à lui-même', () => {
    const etat = rejouer([cree('boucle', ['memoire'], ['memoire'])])
    expect(etat.vue.aretes).toHaveLength(0)
  })

  it('ignore un événement portant un identifiant inconnu', () => {
    const etat = rejouer([cree('solo'), evt({ type: 'composant-active', id: id('fantome') })])
    expect(noeud(etat, 'solo')?.etat).toBe('inactif')
    expect(etat.vue.noeuds).toHaveLength(1)
  })

  it('est pur : la même suite réduite deux fois donne le même état', () => {
    const suite: EvenementRun[] = [
      cree('outil', [], ['registre']),
      cree('agent', ['registre']),
      evt({ type: 'composant-active', id: id('outil') }),
      evt({ type: 'composant-active', id: id('agent') }),
      evt({ type: 'message-emis', id: id('agent'), message: 'travaille' }),
      evt({ type: 'travail-termine', id: id('agent') }),
    ]
    expect(rejouer(suite).vue).toEqual(rejouer(suite).vue)
  })

  it('ne mute jamais l état reçu', () => {
    const depart = rejouer([cree('solo')])
    const avant = JSON.stringify(depart.vue)
    reduire(depart, evt({ type: 'composant-active', id: id('solo') }))
    expect(JSON.stringify(depart.vue)).toBe(avant)
  })
})
