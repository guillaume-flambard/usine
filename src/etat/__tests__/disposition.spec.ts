// La disposition suit le graphe vivant : elle n'est plus une photographie
// prise avant le run. Ce qui doit rester vrai, c'est qu'elle est lisible et
// reproductible — et qu'elle accepte un graphe qui pousse.
import { describe, expect, it } from 'vitest'
import {
  cheminDeLien,
  disposer,
  disposerVivant,
  HAUTEUR_NOEUD,
  LARGEUR_NOEUD,
  signatureTopologie,
} from '../disposition'
import type { AreteVue, NoeudVue } from '../modele'
import type { IdComposant } from '../../runtime/contrat'
import { runJusquALaPorte } from '../../orchestration/__tests__/aide'

const chevauche = (
  a: { x: number; y: number; largeur: number; hauteur: number },
  b: { x: number; y: number; largeur: number; hauteur: number },
) =>
  a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur

const id = (valeur: string) => valeur as IdComposant

const noeud = (nom: string, apparuA: number): NoeudVue => ({
  id: id(nom),
  nom,
  presentation: { role: nom },
  injecte: [],
  fournit: [],
  etat: 'termine',
  apparuA,
})

const arete = (de: string, vers: string, nom: string): AreteVue => ({
  de: id(de),
  vers: id(vers),
  nom,
  aTransite: true,
})

const NOEUDS = ['a', 'b', 'c', 'd'].map((nom, index) => noeud(nom, index))
const ARETES = [arete('a', 'b', 'x'), arete('a', 'c', 'y'), arete('b', 'd', 'z')]

describe('la disposition du graphe vivant', () => {
  it('place exactement les nœuds vivants, ni plus ni moins', () => {
    const { boites } = disposerVivant(NOEUDS, ARETES)
    expect([...boites.keys()].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('accepte un graphe qui pousse : un nœud de plus, une place de plus', () => {
    const avant = disposerVivant(NOEUDS.slice(0, 2), [ARETES[0] as AreteVue])
    const apres = disposerVivant(NOEUDS, ARETES)
    expect(avant.boites.size).toBe(2)
    expect(apres.boites.size).toBe(4)
    // La largeur suit : le graphe occupe plus de place quand il grandit.
    expect(apres.largeur).toBeGreaterThan(avant.largeur)
  })

  it('ne fait chevaucher aucun nœud', () => {
    const boites = [...disposerVivant(NOEUDS, ARETES).boites.values()]
    for (let i = 0; i < boites.length; i += 1) {
      for (let j = i + 1; j < boites.length; j += 1) {
        const a = boites[i]
        const b = boites[j]
        if (a === undefined || b === undefined) continue
        expect(chevauche(a, b), `${a.nom} chevauche ${b.nom}`).toBe(false)
      }
    }
  })

  it('coule de gauche à droite : une dépendance est toujours à gauche', () => {
    const { boites, liens } = disposerVivant(NOEUDS, ARETES)
    for (const lien of liens) {
      const de = boites.get(lien.de)
      const vers = boites.get(lien.vers)
      if (de === undefined || vers === undefined) continue
      expect(de.x, `${lien.de} → ${lien.vers}`).toBeLessThan(vers.x)
    }
  })

  it("est déterministe : l'ordre d'arrivée des nœuds ne déplace rien", () => {
    const a = disposerVivant(NOEUDS, ARETES)
    const b = disposerVivant([...NOEUDS].reverse(), [...ARETES].reverse())
    for (const [nom, boite] of a.boites) {
      expect(b.boites.get(nom), nom).toEqual(boite)
    }
  })

  it('donne à chaque nœud la taille du design system', () => {
    for (const boite of disposerVivant(NOEUDS, ARETES).boites.values()) {
      expect(boite.largeur).toBe(LARGEUR_NOEUD)
      expect(boite.hauteur).toBe(HAUTEUR_NOEUD)
    }
  })

  it('trace un chemin pour chaque lien', () => {
    for (const lien of disposerVivant(NOEUDS, ARETES).liens) {
      expect(cheminDeLien(lien.points).startsWith('M ')).toBe(true)
    }
  })

  it('rend un chemin vide plutôt que de lever quand il n y a aucun point', () => {
    expect(cheminDeLien([])).toBe('')
  })

  it('ne bouge pas tant que la topologie ne bouge pas', () => {
    const avant = signatureTopologie(NOEUDS, ARETES)
    // Un changement d'état ou un artefact n'a aucune raison de déplacer un nœud.
    const memes = NOEUDS.map((n) => ({ ...n, etat: 'en-cours' as const }))
    expect(signatureTopologie(memes, ARETES)).toBe(avant)
    expect(signatureTopologie([...NOEUDS, noeud('e', 9)], ARETES)).not.toBe(avant)
  })

  it('accepte encore une liste de composants déclarés', () => {
    // `disposer` reste utilisable seule : c'est elle que `disposerVivant` appelle.
    const { boites } = disposer([{ nom: 'seul', injecte: [], fournit: [] }], { ordre: ['seul'] })
    expect(boites.get('seul')).toBeDefined()
  })
})

describe('la disposition telle que l application la calcule', () => {
  it('a une place pour chaque nœud du run, pièce fabriquée comprise', async () => {
    const pilote = await runJusquALaPorte()
    const noeuds = pilote.store.etat.value.noeuds

    expect(noeuds.length).toBeGreaterThan(3)
    // Un outil écrit pendant le run est un nœud comme un autre : il doit
    // avoir sa place alors que personne ne l'attendait.
    expect(noeuds.some((n) => n.fabrication !== undefined)).toBe(true)
    for (const n of noeuds) {
      expect(pilote.disposition.value.boites.has(n.nom), n.nom).toBe(true)
    }
  })
})
