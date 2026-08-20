// Le port de fabrication. Deux voies, une seule interface : le choix reste
// un réglage, jamais une réécriture.
//
// Par défaut, la fabrication assemble des primitives déclarées — aucune
// évaluation de code, donc compatible avec une politique de sécurité de
// contenu stricte. La voie par évaluation existe pour le mode LLM branché,
// où la spécification peut être réellement imprévue, et elle exige
// `unsafe-eval` : c'est un arbitrage à poser, jamais un effet de bord.

import type { Composant, ContexteComposant } from '../contrat'
import type { Primitive } from './primitives'
import {
  chercherPrimitive,
  sourceDe,
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
  code: 'primitive-inconnue' | 'evaluation-refusee' | 'specification-invalide'
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
      const invalide = verifierSpecification(specification)
      if (invalide !== undefined) return { ok: false, echec: invalide }

      const etapes: DescriptionPrimitive[] = []
      for (const nom of specification.etapes) {
        const primitive = chercherPrimitive(nom)
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
        ...etapes.flatMap((etape) => [`// ${etape.nom}`, sourceDe(etape), '']),
      ].join('\n')

      const composant: Composant = {
        nom: specification.nom,
        injecte: [...specification.injecte],
        fournit: [...specification.fournit],
        presentation: { libelle: specification.libelle, role: specification.role },
        applique(contexte: ContexteComposant) {
          // Toutes les dépendances déclarées sont lues : une dépendance
          // déclarée et jamais consommée serait une arête qui ne porte rien.
          const lues = specification.injecte.map((nom) =>
            contexte.lire<{ regles?: Passe['regles'] }>(nom),
          )
          const regles = lues.flatMap((valeur) => valeur?.regles ?? [])

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
 * La voie par évaluation. Elle construit **réellement** le corps du composant
 * par évaluation de code — c'est ce qui permettra à un modèle de produire une
 * spécification imprévue. Elle exige `unsafe-eval` et échoue proprement sous
 * une politique stricte, d'où son cantonnement au mode LLM branché.
 */
export function fabriqueParEvaluation(): Fabrique {
  return {
    voie: 'evaluation',
    compiler(specification) {
      const invalide = verifierSpecification(specification)
      if (invalide !== undefined) return { ok: false, echec: invalide }

      const etapes: DescriptionPrimitive[] = []
      for (const nom of specification.etapes) {
        const primitive = chercherPrimitive(nom)
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

      const corps = [
        '// Construit par évaluation de code, à partir de la spécification.',
        'return function verifier(texte, regles, etapes) {',
        '  var passe = { texte: texte, allegations: [], verdicts: [], regles: regles }',
        ...specification.etapes.map((nom, index) => `  passe = etapes[${index}](passe)  // ${nom}`),
        '  return passe.verdicts',
        '}',
      ].join('\n')

      let verifierCompile: (
        texte: string,
        regles: Passe['regles'],
        etapes: readonly Primitive[],
      ) => readonly Verdict[]
      try {
        verifierCompile = new Function(corps)() as typeof verifierCompile
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

      const composant: Composant = {
        nom: specification.nom,
        injecte: [...specification.injecte],
        fournit: [...specification.fournit],
        presentation: { libelle: specification.libelle, role: specification.role },
        applique(contexte: ContexteComposant) {
          const lues = specification.injecte.map((nom) =>
            contexte.lire<{ regles?: Passe['regles'] }>(nom),
          )
          const regles = lues.flatMap((valeur) => valeur?.regles ?? [])
          const appliquants = etapes.map((etape) => etape.appliquer)
          const verifier: Verificateur = (texte) => verifierCompile(texte, regles, appliquants)
          for (const nom of specification.fournit) contexte.fournir(nom, verifier)
          contexte.emettre(`Évalué depuis ${etapes.length} primitives.`)
          contexte.terminer()
        },
      }

      return { ok: true, piece: { composant, source: corps, specification } }
    },
  }
}

/**
 * Une spécification qu'on ne peut pas honorer doit être refusée à la
 * compilation, pas découverte à l'activation.
 */
function verifierSpecification(
  specification: SpecificationComposant,
): EchecFabrication | undefined {
  if (specification.etapes.length === 0) {
    return { code: 'specification-invalide', message: "La spécification n'a aucune étape." }
  }
  if (specification.fournit.length === 0) {
    return { code: 'specification-invalide', message: 'La spécification ne publie rien.' }
  }
  if (specification.injecte.length === 0) {
    return {
      code: 'specification-invalide',
      message: "La spécification ne consomme rien : elle n'aurait aucune source de vérité.",
    }
  }
  return undefined
}
