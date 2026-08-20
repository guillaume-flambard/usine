import { describe, expect, it } from 'vitest'
import {
  fabriqueParComposition,
  fabriqueParEvaluation,
  type SpecificationComposant,
} from '../index'
import { nomsDePrimitives } from '../primitives'
import { creerNoyau } from '../../noyau'
import type { Composant } from '../../contrat'

const SPEC: SpecificationComposant = {
  nom: 'verificateur-allegations',
  libelle: 'Vérificateur',
  role: 'Classe chaque allégation et cite sa source',
  injecte: ['registre'],
  fournit: ['verificateur'],
  etapes: ['decouper-allegations', 'classer-par-regles', 'exiger-une-source'],
}

const REGLES = [
  { motif: 'guérit', statut: 'interdit' as const, source: 'Règlement (CE) 1924/2006, art. 7' },
  {
    motif: 'contribue à réduire la fatigue',
    statut: 'autorise' as const,
    source: 'Règlement (UE) 432/2012',
  },
]

const outilRegistre: Composant = {
  nom: 'outil-registre',
  fournit: ['registre'],
  presentation: { libelle: 'Registre', role: 'Source de vérité' },
  applique(contexte) {
    contexte.fournir('registre', { regles: REGLES })
  },
}

const tick = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

describe('fabrication par composition', () => {
  it('compile une spécification en composant chargeable', () => {
    const resultat = fabriqueParComposition().compiler(SPEC)
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.piece.composant.nom).toBe('verificateur-allegations')
    expect(resultat.piece.composant.fournit).toEqual(['verificateur'])
  })

  it("n'évalue aucune chaîne de code", () => {
    // La preuve la plus simple : neutraliser `Function` et compiler quand même.
    const original = globalThis.Function
    try {
      Object.defineProperty(globalThis, 'Function', {
        value: () => {
          throw new Error('évaluation interdite')
        },
        configurable: true,
      })
      expect(fabriqueParComposition().compiler(SPEC).ok).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'Function', { value: original, configurable: true })
    }
  })

  it('refuse une primitive absente du registre', () => {
    const resultat = fabriqueParComposition().compiler({ ...SPEC, etapes: ['inventee'] })
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.echec.code).toBe('primitive-inconnue')
    expect(resultat.echec.message).toContain('inventee')
  })

  it('rend une source lisible qui décrit ce qui a été assemblé', () => {
    const resultat = fabriqueParComposition().compiler(SPEC)
    if (!resultat.ok) throw new Error('compilation échouée')
    for (const etape of SPEC.etapes) expect(resultat.piece.source).toContain(etape)
    expect(resultat.piece.source).toContain(SPEC.role)
  })

  it('produit une pièce qui tourne vraiment une fois chargée', async () => {
    const noyau = creerNoyau()
    await noyau.charger(outilRegistre)
    const resultat = fabriqueParComposition().compiler(SPEC)
    if (!resultat.ok) throw new Error('compilation échouée')
    await noyau.charger(resultat.piece.composant)
    await tick()

    const topologie = noyau.introspecter()
    expect(topologie.composants.map((c) => c.nom)).toContain('verificateur-allegations')
    expect(topologie.dependances.some((d) => d.nom === 'registre')).toBe(true)
  })

  it('classe un texte réel, avec sa source, et retombe sur « à vérifier »', async () => {
    const noyau = creerNoyau()
    let verifier: ((texte: string) => readonly { statut: string; source?: string }[]) | undefined
    await noyau.charger(outilRegistre)
    const resultat = fabriqueParComposition().compiler(SPEC)
    if (!resultat.ok) throw new Error('compilation échouée')
    await noyau.charger(resultat.piece.composant)
    await noyau.charger({
      nom: 'lecteur',
      injecte: ['verificateur'],
      presentation: { libelle: 'Lecteur', role: 'Récupère la fonction' },
      applique(contexte) {
        verifier = contexte.lire('verificateur')
      },
    })
    await tick()

    const verdicts = verifier?.(
      'Ce produit guérit les rhumes. Il contribue à réduire la fatigue. Il rend heureux.',
    )
    expect(verdicts).toHaveLength(3)
    expect(verdicts?.[0]?.statut).toBe('interdit')
    expect(verdicts?.[0]?.source).toContain('1924/2006')
    expect(verdicts?.[1]?.statut).toBe('autorise')
    // Aucune règle ne couvre la troisième : jamais de verdict tranché.
    expect(verdicts?.[2]?.statut).toBe('a-verifier')
    expect(verdicts?.[2]?.source).toBeUndefined()
  })

  it('expose son registre de primitives', () => {
    expect(nomsDePrimitives()).toEqual([
      'decouper-allegations',
      'classer-par-regles',
      'exiger-une-source',
    ])
  })
})

describe('fabrication par évaluation', () => {
  it("échoue proprement quand l'évaluation de code est refusée", () => {
    const original = globalThis.Function
    try {
      Object.defineProperty(globalThis, 'Function', {
        value: () => {
          throw new Error("unsafe-eval n'est pas autorisé")
        },
        configurable: true,
      })
      const resultat = fabriqueParEvaluation().compiler(SPEC)
      expect(resultat.ok).toBe(false)
      if (resultat.ok) return
      expect(resultat.echec.code).toBe('evaluation-refusee')
    } finally {
      Object.defineProperty(globalThis, 'Function', { value: original, configurable: true })
    }
  })

  it("aboutit quand l'évaluation est permise", () => {
    expect(fabriqueParEvaluation().compiler(SPEC).ok).toBe(true)
  })
})
