// Le mode par défaut doit passer sous une politique de sécurité stricte.
// Le spike l'a mesuré une fois ; ce test l'empêche de régresser.
import { describe, expect, it } from 'vitest'
import { fabriqueParComposition, fabriqueParEvaluation } from '../../runtime/fabrique'
import type { SpecificationComposant } from '../../runtime/fabrique'

const SPEC: SpecificationComposant = {
  nom: 'verificateur-allegations',
  libelle: 'Vérificateur',
  role: 'Classe chaque allégation',
  injecte: ['registre'],
  fournit: ['verificateur'],
  etapes: [
    'decouper-allegations',
    'classer-par-regles',
    'ecarter-les-negations',
    'exiger-une-source',
  ],
}

describe('la fabrication sous politique de sécurité stricte', () => {
  it('compile sans jamais évaluer de code', () => {
    // On neutralise `Function` dans un vrai navigateur : c'est l'équivalent
    // exécutable d'une CSP sans `unsafe-eval` pour ce qui nous concerne.
    const original = globalThis.Function
    try {
      Object.defineProperty(globalThis, 'Function', {
        value: () => {
          throw new EvalError("unsafe-eval n'est pas autorisé")
        },
        configurable: true,
      })
      const resultat = fabriqueParComposition().compiler(SPEC)
      expect(resultat.ok).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'Function', { value: original, configurable: true })
    }
  })

  it("refuse proprement la voie par évaluation quand la politique l'interdit", () => {
    const original = globalThis.Function
    try {
      Object.defineProperty(globalThis, 'Function', {
        value: () => {
          throw new EvalError("unsafe-eval n'est pas autorisé")
        },
        configurable: true,
      })
      const resultat = fabriqueParEvaluation().compiler(SPEC)
      expect(resultat.ok).toBe(false)
      if (resultat.ok) return
      // Elle échoue, elle ne casse pas : le run continue sans la pièce.
      expect(resultat.echec.code).toBe('evaluation-refusee')
    } finally {
      Object.defineProperty(globalThis, 'Function', { value: original, configurable: true })
    }
  })
})
