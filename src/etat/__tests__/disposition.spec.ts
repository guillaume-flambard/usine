import { describe, expect, it } from 'vitest'
import { cheminDeLien, disposer, HAUTEUR_NOEUD, LARGEUR_NOEUD } from '../disposition'
import { ordreDeclare, topologieDeclaree } from '../../orchestration/lancer'
import { claimCheck } from '../../scenarios/claim-check'

const ORDRE = ordreDeclare([
  claimCheck.maitre,
  ...claimCheck.casting,
  ...claimCheck.emplacementsReserves,
]).map((entree) => entree.composant.nom)

const disposition = () => disposer(topologieDeclaree(claimCheck), { ordre: ORDRE })

const chevauche = (
  a: { x: number; y: number; largeur: number; hauteur: number },
  b: { x: number; y: number; largeur: number; hauteur: number },
) =>
  a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur

describe('disposition', () => {
  it('place tous les composants déclarés, emplacements réservés compris', () => {
    const { boites } = disposition()
    expect(boites.size).toBe(claimCheck.casting.length + 2)
    expect(boites.has('verificateur-allegations')).toBe(true)
  })

  it('ne fait chevaucher aucun nœud', () => {
    const boites = [...disposition().boites.values()]
    for (let i = 0; i < boites.length; i += 1) {
      for (let j = i + 1; j < boites.length; j += 1) {
        const a = boites[i]
        const b = boites[j]
        if (a === undefined || b === undefined) continue
        expect(chevauche(a, b), `${a.nom} chevauche ${b.nom}`).toBe(false)
      }
    }
  })

  it('coule de gauche à droite : une dépendance est toujours à gauche de son consommateur', () => {
    const { boites, liens } = disposition()
    for (const lien of liens) {
      const de = boites.get(lien.de)
      const vers = boites.get(lien.vers)
      if (de === undefined || vers === undefined) continue
      expect(de.x, `${lien.de} → ${lien.vers}`).toBeLessThan(vers.x)
    }
  })

  it('range les trois constructeurs dans la même couche', () => {
    const { boites } = disposition()
    const xs = ['regles', 'interface', 'tests'].map((quoi) => boites.get(`constructeur-${quoi}`)?.x)
    expect(new Set(xs).size).toBe(1)
    expect(xs[0]).toBeDefined()
  })

  it('est déterministe : même topologie, même disposition', () => {
    const a = disposition()
    const b = disposer([...topologieDeclaree(claimCheck)].reverse(), { ordre: ORDRE })
    for (const [nom, boite] of a.boites) {
      expect(b.boites.get(nom)).toEqual(boite)
    }
  })

  it('donne à chaque nœud la taille du design system', () => {
    for (const boite of disposition().boites.values()) {
      expect(boite.largeur).toBe(LARGEUR_NOEUD)
      expect(boite.hauteur).toBe(HAUTEUR_NOEUD)
    }
  })

  it('trace un chemin pour chaque lien', () => {
    for (const lien of disposition().liens) {
      expect(cheminDeLien(lien.points).startsWith('M ')).toBe(true)
    }
  })

  it('rend un chemin vide plutôt que de lever quand il n y a aucun point', () => {
    expect(cheminDeLien([])).toBe('')
  })
})
