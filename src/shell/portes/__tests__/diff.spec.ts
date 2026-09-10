import { describe, expect, it } from 'vitest'
import { ampleur, diffLignes } from '../diff'

describe('le diff de deux invites', () => {
  it('ne marque rien quand rien ne change', () => {
    const lignes = diffLignes('une\ndeux', 'une\ndeux')
    expect(lignes.every((l) => l.etat === 'garde')).toBe(true)
    expect(ampleur(lignes)).toBe(0)
  })

  it("n'accuse qu'une ligne quand une seule est ajoutée en tête", () => {
    // Le cas qui distingue un vrai diff d'une comparaison position par
    // position : celle-ci marquerait tout le reste comme changé, et le seul
    // changement réel disparaîtrait dans un mur de faux changements.
    const lignes = diffLignes('une\ndeux\ntrois', 'zero\nune\ndeux\ntrois')
    expect(ampleur(lignes)).toBe(1)
    expect(lignes[0]).toEqual({ etat: 'ajoute', texte: 'zero' })
  })

  it('rend un retrait et un ajout pour une ligne réécrite', () => {
    const lignes = diffLignes('une\ndeux', 'une\nDEUX')
    expect(lignes.map((l) => l.etat)).toEqual(['garde', 'retire', 'ajoute'])
  })

  it('supporte un texte vide des deux côtés', () => {
    expect(ampleur(diffLignes('', ''))).toBe(0)
    expect(diffLignes('', 'une').map((l) => l.etat)).toContain('ajoute')
  })
})
