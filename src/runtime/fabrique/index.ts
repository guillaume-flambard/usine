// Le port de fabrication. Deux voies, une seule interface : le choix reste
// un réglage, jamais une réécriture.
//
// Par défaut, la fabrication assemble des primitives déclarées — aucune
// évaluation de code, donc compatible avec une politique de sécurité de
// contenu stricte. La voie par évaluation existe pour le mode LLM branché,
// où la spécification peut être réellement imprévue, et elle exige
// `unsafe-eval` : c'est un arbitrage à poser, jamais un effet de bord.

import type { Composant, ContexteComposant } from '../contrat'
import {
  REGISTRE_PRIMITIVES,
  type DescriptionPrimitive,
  type Passe,
  type Verdict,
} from './primitives'

/** Ce qu'un agent amont produit pour décrire la pièce à fabriquer. */
export interface SpecificationComposant {
  nom: string
  libelle: string
  role: string
  /** Ce dont la pièce aura besoin une fois chargée. */
  injecte: readonly string[]
  /** Ce qu'elle publiera. */
  fournit: readonly string[]
  /** Les primitives à enchaîner, dans l'ordre. Toutes doivent être au registre. */
  etapes: readonly string[]
}

export interface EchecFabrication {
  code: 'primitive-inconnue' | 'evaluation-refusee'
  message: string
}

export interface PieceFabriquee {
  composant: Composant
  /** Le code de la pièce, tel qu'il a été assemblé, pour l'inspection. */
  source: string
  specification: SpecificationComposant
}

export type ResultatFabrication =
  { ok: true; piece: PieceFabriquee } | { ok: false; echec: EchecFabrication }

export interface Fabrique {
  readonly voie: 'composition' | 'evaluation'
  compiler(specification: SpecificationComposant): ResultatFabrication
}

/** Ce qu'une pièce fabriquée publie : une fonction, prête à l'emploi. */
export type Verificateur = (texte: string) => readonly Verdict[]

/**
 * La voie par défaut. Elle assemble des primitives existantes ; le composant
 * produit n'existait pas avant le run, mais aucune chaîne n'est évaluée.
 */
export function fabriqueParComposition(): Fabrique {
  return {
    voie: 'composition',
    compiler(specification) {
      const etapes: DescriptionPrimitive[] = []
      for (const nom of specification.etapes) {
        const primitive = REGISTRE_PRIMITIVES.get(nom)
        if (primitive === undefined) {
          return {
            ok: false,
            echec: {
              code: 'primitive-inconnue',
              message: `« ${nom} » n'est pas au registre des primitives.`,
            },
          }
        }
        etapes.push(primitive)
      }

      const source = [
        `// ${specification.role}`,
        `composant « ${specification.nom} »`,
        `  consomme : ${specification.injecte.join(', ') || 'rien'}`,
        `  publie   : ${specification.fournit.join(', ') || 'rien'}`,
        '',
        'verifier(texte) =',
        ...etapes.map((etape, index) => `  ${index + 1}. ${etape.nom}  // ${etape.resume}`),
        '',
        ...etapes.flatMap((etape) => [`// ${etape.nom}`, etape.source, '']),
      ].join('\n')

      const composant: Composant = {
        nom: specification.nom,
        injecte: [...specification.injecte],
        fournit: [...specification.fournit],
        presentation: { libelle: specification.libelle, role: specification.role },
        applique(contexte: ContexteComposant) {
          const source = contexte.lire<{
            regles: Passe['regles']
          }>(specification.injecte[0] ?? '')
          const regles = source?.regles ?? []

          const verifier: Verificateur = (texte: string) => {
            const depart: Passe = { texte, allegations: [], verdicts: [], regles }
            return etapes.reduce((passe, etape) => etape.appliquer(passe), depart).verdicts
          }

          for (const nom of specification.fournit) contexte.fournir(nom, verifier)
          contexte.emettre(
            `Assemblé à partir de ${etapes.length} primitives et de ${regles.length} règles.`,
          )
          contexte.terminer()
        },
      }

      return { ok: true, piece: { composant, source, specification } }
    },
  }
}

/**
 * La voie par évaluation. Réservée au mode LLM branché : elle exige
 * `unsafe-eval` et échoue proprement sous une politique stricte.
 */
export function fabriqueParEvaluation(): Fabrique {
  return {
    voie: 'evaluation',
    compiler(specification) {
      const source = `return {
  nom: ${JSON.stringify(specification.nom)},
  etapes: ${JSON.stringify(specification.etapes)},
}`
      try {
        const construire = new Function(source) as () => unknown
        construire()
      } catch (cause) {
        return {
          ok: false,
          echec: {
            code: 'evaluation-refusee',
            message:
              cause instanceof Error
                ? cause.message
                : "L'évaluation de code est refusée par la politique de sécurité.",
          },
        }
      }
      // La composition reste le moteur : l'évaluation ne sert qu'à prouver
      // qu'une spécification imprévue peut être acceptée.
      return fabriqueParComposition().compiler(specification)
    },
  }
}
