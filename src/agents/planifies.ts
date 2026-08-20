// Les agents que le plan fait exister. Aucun d'eux n'est écrit d'avance :
// leur nom, leur rôle, leurs dépendances et l'outil qu'ils fabriquent
// viennent du plan, donc du brief.
//
// Ce fichier ne décide rien du graphe. Il donne un corps à ce que le plan a
// décidé — et il refuse de mentir sur ce corps : un nœud n'affiche une
// technologie que s'il la fait tourner.

import { corpusDuBrief, planifier } from '../orchestration/planifier'
import { trouverCorpus, type Corpus } from '../corpus'
import type { Composant, ContexteComposant } from '../runtime/contrat'
import {
  fabriqueParComposition,
  type Fabrique,
  type SpecificationComposant,
} from '../runtime/fabrique'
import { nomsDePrimitives } from '../runtime/fabrique/primitives'
import { raisonneurDeterministe, type Raisonneur, type Raisonnement } from '../runtime/raisonneur'
import {
  nomsPublies,
  vaguesDeChargement,
  type AgentPlanifie,
  type Plan,
} from '../orchestration/plan'

/** Ce qu'un agent planifié publie sous un nom de sortie. */
export interface SortiePlanifiee {
  /** L'agent qui l'a produite. */
  de: string
  texte: string
}

export interface ContexteDuPlan {
  corpus: Corpus
  plan: Plan
}

/** Le nom sous lequel la source de vérité publie ses règles. */
export const NOM_REGISTRE = 'registre'
/** Le nom que la porte humaine lit pour savoir s'il y a quelque chose à livrer. */
export const NOM_SORTIE_PRODUIT = 'sortie-produit'

/**
 * Le texte que l'agent publie quand aucun modèle ne raisonne. Il cite ce
 * qu'il a réellement lu : une sortie qui ne s'appuie sur rien ne vaut rien,
 * et c'est vrai du repli comme du reste.
 */
const repliDe = (agent: AgentPlanifie, lues: readonly { nom: string; texte: string }[]): string => {
  const pleines = lues.filter((entree) => entree.texte.trim().length > 0)
  if (pleines.length === 0) return `${agent.role}, sans entrée disponible.`
  const caracteres = pleines.reduce((total, entree) => total + entree.texte.length, 0)
  return `${agent.role} — appuyé sur ${pleines.length} sorties (${pleines
    .map((entree) => entree.nom)
    .join(', ')}), soit ${caracteres} caractères lus.`
}

/** Le texte réellement publié, quel que soit ce qui s'est passé en amont. */
function texteDe(contexte: ContexteComposant, agent: AgentPlanifie, plan: Plan): Promise<string> {
  const lues = agent.injecte
    .filter((nom) => nom !== 'raisonneur' && nom !== 'fabrique' && nom !== 'memoire')
    .map((nom) => ({ nom, texte: contexte.lire<SortiePlanifiee>(nom)?.texte ?? '' }))
  const repli = repliDe(agent, lues)
  const raisonneur = contexte.lire<Raisonneur>('raisonneur') ?? raisonneurDeterministe()

  return raisonneur
    .raisonner({
      role: agent.nom,
      instruction: `${agent.role}. Réponds en deux phrases, sans préambule.`,
      contexte: [
        `Produit visé : ${plan.produit}`,
        `Corpus : ${plan.corpus}`,
        ...lues.map(
          (entree) => `${entree.nom} : ${entree.texte.length > 0 ? entree.texte : '(rien)'}`,
        ),
      ].join('\n'),
      repli,
    })
    .catch((cause): Raisonnement => ({
      texte: repli,
      origine: 'deterministe',
      echec: cause instanceof Error ? cause.message : String(cause),
    }))
    .then((raisonnement) => {
      if (raisonnement.tokens !== undefined || raisonnement.echec !== undefined) {
        contexte.compterTokens(
          raisonnement.tokens?.entree ?? 0,
          raisonnement.tokens?.sortie ?? 0,
          raisonnement.echec,
        )
      }
      return raisonnement.texte.trim().length > 0 ? raisonnement.texte.trim() : repli
    })
}

/** La source de vérité : elle ne raisonne pas, elle publie un corpus réel. */
function appliquerLaSource(
  contexte: ContexteComposant,
  agent: AgentPlanifie,
  corpus: Corpus,
): void {
  // Une règle sans motif correspondrait à tout ; une règle tranchée sans
  // source produirait un verdict incitable. Les deux sont écartées ici.
  const valides = corpus.regles.filter(
    (regle) =>
      regle.motif.trim().length > 0 &&
      (regle.statut === 'a-verifier' || regle.source.trim().length > 0),
  )
  const ecartees = corpus.regles.length - valides.length
  contexte.emettre(
    `Charge ${valides.length} règles — ${corpus.titre}` +
      (ecartees > 0 ? `, ${ecartees} écartée(s) comme inutilisables.` : '.'),
  )
  contexte.publierArtefact({
    titre: 'Source de vérité retenue',
    corps: [
      `${corpus.titre}.`,
      `${valides.length} règles chargées${ecartees > 0 ? `, ${ecartees} écartée(s)` : ''}.`,
      '',
      "L'usine choisit son corpus dans le brief ; elle ne l'invente pas.",
    ].join('\n'),
    decouleDe: 'le brief',
  })
  contexte.fournir(NOM_REGISTRE, { regles: valides })
  for (const nom of agent.fournit) {
    if (nom === NOM_REGISTRE) continue
    contexte.fournir(nom, { de: agent.nom, texte: `${valides.length} règles — ${corpus.titre}` })
  }
  contexte.terminer()
}

/** Le fabricant : il produit une pièce qui n'existait pas et la charge à chaud. */
function appliquerLeFabricant(contexte: ContexteComposant, agent: AgentPlanifie, plan: Plan): void {
  const outil = agent.outil
  if (outil === undefined) return
  const fabrique = contexte.lire<Fabrique>('fabrique')
  const registre = contexte.lire<{ regles: readonly unknown[] }>(NOM_REGISTRE)

  const echouer = (message: string, titre: string) => {
    contexte.emettre(message)
    contexte.publierArtefact({ titre, corps: message, decouleDe: 'le plan du run' })
    for (const nom of agent.fournit) {
      contexte.fournir(
        nom,
        nom === NOM_SORTIE_PRODUIT ? { fabrique: false } : { de: agent.nom, texte: message },
      )
    }
    contexte.terminer()
  }

  if (fabrique === undefined) {
    // Sortir en silence condamnerait tout l'aval à attendre sans diagnostic.
    echouer('Aucune fabrique disponible : rien ne sera fabriqué.', 'Fabrication impossible')
    return
  }

  const aFabriquer: SpecificationComposant = {
    nom: outil.fournit,
    libelle: 'Outil fabriqué',
    role: `${plan.produit} — assemblé pendant le run`,
    injecte: [NOM_REGISTRE],
    fournit: [outil.fournit],
    etapes: outil.etapes,
  }

  const resultat = fabrique.compiler(aFabriquer)
  if (!resultat.ok) {
    echouer(`Fabrication refusée : ${resultat.echec.message}`, 'Fabrication refusée')
    return
  }

  contexte.emettre(
    `Fabrique « ${aFabriquer.nom} » : ${outil.etapes.length} primitives, ${registre?.regles.length ?? 0} règles.`,
  )
  // Le résultat du chargement est attendu : annoncer une pièce fabriquée qui
  // n'a pas pris serait exactement le mensonge que ce produit refuse.
  void contexte
    .charger(resultat.piece.composant, {
      specification: [
        `nom : ${aFabriquer.nom}`,
        `rôle : ${aFabriquer.role}`,
        `consomme : ${aFabriquer.injecte.join(', ')}`,
        `publie : ${aFabriquer.fournit.join(', ')}`,
        `étapes : ${outil.etapes.join(' → ')}`,
        '',
        `décidé par « ${agent.nom} », d'après le plan du run`,
      ].join('\n'),
      source: resultat.piece.source,
      voie: fabrique.voie,
    })
    .then((idPiece) => {
      if (idPiece === undefined) {
        echouer(
          `La pièce « ${aFabriquer.nom} » a été compilée mais son chargement a été refusé.`,
          'Fabrication non chargée',
        )
        return
      }
      contexte.publierArtefact({
        titre: 'Spécification de la pièce fabriquée',
        corps: [
          `La pièce « ${aFabriquer.nom} » n'existait pas avant ce run.`,
          `Elle enchaîne : ${outil.etapes.join(' → ')}.`,
          '',
          fabrique.voie === 'composition'
            ? "Aucune chaîne de code n'est évaluée : les primitives sont assemblées."
            : 'Le corps de la pièce a été produit par évaluation de code.',
        ].join('\n'),
        decouleDe: 'le plan du run',
      })
      for (const nom of agent.fournit) {
        contexte.fournir(
          nom,
          nom === NOM_SORTIE_PRODUIT
            ? { fabrique: true, primitives: outil.etapes.length }
            : { de: agent.nom, texte: `pièce « ${aFabriquer.nom} » chargée` },
        )
      }
      contexte.terminer()
    })
}

/**
 * Donne un corps à un agent du plan. Trois façons d'exister, choisies par ce
 * que l'agent publie — pas par son nom : publier le registre, fabriquer un
 * outil, ou raisonner.
 */
export function agentDuPlan(agent: AgentPlanifie, { corpus, plan }: ContexteDuPlan): Composant {
  const publieLeRegistre = agent.fournit.includes(NOM_REGISTRE)
  const fabrique = agent.outil !== undefined

  // Le coeffet dont l'agent a besoin pour exister est ajouté ici, pas laissé
  // au plan : un plan qui oublie de déclarer « raisonneur » ferait tomber
  // l'agent en défaut au premier mot qu'il essaie d'écrire.
  const requis = publieLeRegistre ? [] : fabrique ? ['fabrique'] : ['raisonneur']
  const injecte = [...new Set([...agent.injecte, ...requis])]

  return {
    nom: agent.nom,
    injecte,
    fournit: agent.fournit,
    presentation: {
      libelle: agent.libelle,
      role: agent.role,
      // Un nœud n'affiche une technologie que s'il la fait réellement
      // tourner : le registre porte son corpus, le fabricant sa voie.
      ...(publieLeRegistre ? { technologie: corpus.technologie } : {}),
      ...(fabrique ? { technologie: 'composition de primitives' } : {}),
    },
    applique(contexte) {
      if (publieLeRegistre) {
        appliquerLaSource(contexte, agent, corpus)
        return
      }
      if (fabrique) {
        appliquerLeFabricant(contexte, agent, plan)
        return
      }
      contexte.emettre(`${agent.role}.`)
      void texteDe(contexte, agent, plan).then((texte) => {
        contexte.publierArtefact({
          titre: agent.libelle,
          corps: texte,
          decouleDe:
            agent.injecte.length > 0 ? `ce que publie ${agent.injecte.join(', ')}` : 'le brief',
        })
        for (const nom of agent.fournit) {
          contexte.fournir(nom, { de: agent.nom, texte })
        }
        contexte.terminer()
      })
    },
  }
}

/** Ce dont le maître a besoin pour ouvrir un run et le faire pousser. */
export interface OptionsMaitre {
  brief: string
  raisonneur?: Raisonneur
  fabrique?: Fabrique
  /** Attend qu'un nom soit publié. Vient du noyau. */
  attendre(nom: string, delaiMs?: number): Promise<boolean>
  /** Ce que le run charge une fois le plan épuisé : porte, livraison. */
  suite: readonly Composant[]
  /**
   * Borne l'attente d'une vague. Sans elle, un agent tombé en panne
   * figerait le chargement de la suivante — et le run s'arrêterait sans
   * qu'aucun écran ne le dise.
   */
  delaiParVague?: number
}

const DELAI_PAR_VAGUE = 10_000

/**
 * Le maître. Il ne connaît pas le graphe : il lit le brief, en tire un plan,
 * puis fait naître les agents vague après vague, chacune attendant que la
 * précédente ait réellement publié.
 */
export function maitreDuPlan(options: OptionsMaitre): Composant {
  const raisonneur = options.raisonneur ?? raisonneurDeterministe()
  const fabrique = options.fabrique ?? fabriqueParComposition()

  return {
    nom: 'agent-maitre',
    fournit: ['besoin', 'memoire', 'fabrique', 'raisonneur'],
    presentation: {
      libelle: 'Agent maître',
      role: "Lit le brief, décide de quoi l'usine sera faite, et la fait naître",
    },
    applique(contexte) {
      const corpusPressenti = corpusDuBrief(options.brief)
      contexte.fournir('besoin', { brief: options.brief, secteur: corpusPressenti.titre })
      // La fabrique et le raisonneur sont des coeffets : aucun agent ne les
      // construit lui-même, et le graphe montre qui en dépend.
      contexte.fournir('fabrique', fabrique)
      contexte.fournir('raisonneur', raisonneur)
      contexte.emettre("Lit le brief et décide de quoi l'usine sera faite.")

      void planifier(options.brief, raisonneur, nomsDePrimitives()).then(async (planification) => {
        const { plan, echec, tokens } = planification
        if (tokens !== undefined || echec !== undefined) {
          contexte.compterTokens(tokens?.entree ?? 0, tokens?.sortie ?? 0, echec)
        }
        const corpus = trouverCorpus(plan.corpus) ?? corpusPressenti
        const vagues = vaguesDeChargement(plan)

        contexte.fournir('memoire', {
          // Le plan voyage avec la mémoire : c'est par là que l'interface
          // apprend quel produit ce run vise, sans le deviner.
          plan,
          secteur: corpus.titre,
          decisions: [
            `Brief retenu : ${options.brief}`,
            raisonneur.origine === 'llm'
              ? 'Mode LLM branché : les agents qui raisonnent le font par un modèle.'
              : 'Mode déterministe : les agents composent et fabriquent réellement.',
            plan.origine === 'modele'
              ? 'Plan rédigé par un modèle, puis vérifié avant chargement.'
              : `Plan déterministe, déduit du brief.${echec !== undefined ? ` Le modèle a été écarté : ${echec}` : ''}`,
            `Corpus retenu : ${corpus.titre}.`,
            fabrique.voie === 'evaluation'
              ? 'La fabrication passe par évaluation de code, sur consentement explicite.'
              : 'La fabrication passe par composition de primitives, sans évaluation de code.',
          ],
        })
        contexte.emettre(
          `Plan arrêté : ${plan.agents.length} agents, ${vagues.length} vagues, corpus ${corpus.titre}.`,
        )
        contexte.publierArtefact({
          titre: 'Plan du run',
          corps: [
            `Brief : ${options.brief}`,
            `Produit visé : ${plan.produit}`,
            `Corpus : ${corpus.titre}`,
            `Origine du plan : ${plan.origine === 'modele' ? 'un modèle' : 'déduction du brief'}`,
            ...(echec !== undefined ? ['', `Modèle écarté : ${echec}`] : []),
            '',
            ...plan.agents.map(
              (agent) =>
                `— ${agent.libelle} (${agent.nom}) : ${agent.role}` +
                (agent.injecte.length > 0 ? `\n   attend ${agent.injecte.join(', ')}` : '') +
                (agent.outil !== undefined
                  ? `\n   fabrique « ${agent.outil.fournit} » : ${agent.outil.etapes.join(' → ')}`
                  : ''),
            ),
          ].join('\n'),
          decouleDe: 'le brief',
        })

        for (const vague of vagues) {
          for (const agent of vague) {
            await contexte.charger(agentDuPlan(agent, { corpus, plan }))
          }
          // La vague suivante n'existe qu'une fois celle-ci publiée : le
          // graphe pousse au rythme du travail, pas d'un minuteur.
          await Promise.all(
            vague
              .flatMap((agent) => nomsPublies(agent))
              .map((nom) => options.attendre(nom, options.delaiParVague ?? DELAI_PAR_VAGUE)),
          )
        }

        for (const composant of options.suite) {
          await contexte.charger(composant)
        }
        contexte.terminer()
      })
    },
  }
}
