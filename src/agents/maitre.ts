// Le maître. Il n'a pas de plan : il amorce.
//
// Il publie ce dont tout le monde a besoin, lit le brief, fait naître les
// premiers agents — et ceux-là en font naître d'autres s'ils en ont besoin.
// Puis il attend que le chantier se stabilise, demande une dernière objection,
// et ouvre la porte humaine sur ce qui existe réellement. Pas sur ce qui
// était prévu : rien n'était prévu.

import { CORPUS } from '../corpus'
import type { Composant, IdComposant } from '../runtime/contrat'
import { raisonneurDeterministe, type Raisonneur } from '../runtime/raisonneur'
import { BUDGET, boucler, creerChantier, penser, type Budget, type Chantier } from './libre'

export interface OptionsMaitre {
  brief: string
  raisonneur?: Raisonneur
  budget?: Budget
  /**
   * Attend que plus aucun agent ne travaille. Vient de l'orchestration, qui
   * seule voit la topologie : le maître ne connaît pas ses petits-enfants.
   */
  stabilise(delaiMs?: number): Promise<boolean>
  /** Ce que le run a réellement publié, à cet instant. */
  produits(): readonly string[]
}

/** Ce que la porte humaine montre : uniquement ce qui existe pour de vrai. */
export interface BilanDuRun {
  agents: number
  outils: readonly string[]
  publications: readonly string[]
}

const MISSION_DU_MAITRE = (brief: string) =>
  [
    "Tu ouvres une usine logicielle qui n'existe pas encore.",
    `Le besoin exprimé : ${brief}`,
    '',
    "Fais naître les premiers agents dont ce besoin a besoin — pas plus. Chacun aura sa propre mission et pourra en créer d'autres, s'interroger entre eux et écrire des outils.",
    "Au moins un agent, quelque part, doit finir par écrire l'outil qui rend le besoin utilisable.",
    'Tu ne fais pas le travail toi-même : tu amorces, puis tu termines.',
  ].join('\n')

export function maitreLibre(options: OptionsMaitre): Composant {
  const raisonneur = options.raisonneur ?? raisonneurDeterministe()
  const chantier: Chantier = creerChantier(options.brief, raisonneur, options.budget ?? BUDGET)

  return {
    nom: 'agent-maitre',
    fournit: ['besoin', 'raisonneur', 'memoire', 'corpus'],
    presentation: {
      libelle: 'Agent maître',
      role: "Lit le besoin et fait naître les premiers agents ; le reste s'invente",
    },
    applique(contexte) {
      contexte.fournir('besoin', { de: 'agent-maitre', texte: options.brief })
      // Le raisonneur est un coeffet : aucun agent ne parle à un fournisseur,
      // et le graphe montre qui dépend de la faculté de raisonner.
      contexte.fournir('raisonneur', raisonneur)
      // Une ressource, pas un agent : des règles réelles que ceux qui en
      // veulent peuvent injecter. Elle ne prédétermine aucun graphe — elle
      // évite seulement que l'usine invente le droit quand il existe.
      contexte.fournir('corpus', CORPUS)
      contexte.fournir('memoire', {
        de: 'agent-maitre',
        texte: [
          `Besoin : ${options.brief}`,
          raisonneur.origine === 'llm'
            ? "Mode LLM branché : ce que vous allez voir n'a pas été écrit d'avance."
            : "Mode déterministe : aucun modèle ne raisonne, l'usine ne peut rien inventer.",
          `Budget : ${chantier.budget.agentsMax} agents, profondeur ${chantier.budget.profondeurMax}, ${chantier.budget.toursMax} tours chacun.`,
        ].join('\n'),
      })
      contexte.emettre('Lit le besoin. Rien n’existe encore.')

      void amorcer(contexte, chantier, options)
    },
  }
}

async function amorcer(
  contexte: Parameters<Composant['applique']>[0],
  chantier: Chantier,
  options: OptionsMaitre,
): Promise<void> {
  await boucler(
    contexte,
    {
      nom: 'agent-maitre',
      libelle: 'Agent maître',
      role: 'Amorce le chantier',
      mission: MISSION_DU_MAITRE(options.brief),
      injecte: [],
      fournit: [],
      profondeur: 0,
    },
    chantier,
  )

  // Le chantier se poursuit sans lui : les agents qu'il a créés en créent
  // d'autres. Il attend que plus rien ne bouge avant de demander à trancher.
  const stabilise = await options.stabilise()
  const publications = options.produits()
  const bilan: BilanDuRun = {
    agents: chantier.agentsCrees,
    outils: publications.filter(
      (nom) => chantier.publications.get(nom) === '(un outil exécutable)',
    ),
    publications,
  }

  const objection = await derniereObjection(contexte, chantier, bilan)
  contexte.publierArtefact({
    titre: 'Ce que le run a produit',
    corps: [
      `Besoin : ${chantier.brief}`,
      `${bilan.agents} agents ont existé.`,
      bilan.outils.length > 0
        ? `Outils écrits pendant le run : ${bilan.outils.join(', ')}.`
        : "Aucun outil exécutable n'a été écrit.",
      `Noms publiés : ${bilan.publications.join(', ') || 'aucun'}.`,
      stabilise ? '' : "Le chantier ne s'est pas stabilisé dans le temps imparti.",
    ]
      .filter((ligne) => ligne.length > 0)
      .join('\n'),
    decouleDe: 'le besoin',
  })

  contexte.emettre('Le run attend votre décision.')
  contexte.attendreDecision(
    {
      resume: [
        bilan.agents > 0
          ? `${bilan.agents} agents ont été créés pendant ce run ; aucun n'existait avant votre brief.`
          : "Aucun agent n'a été créé : sans modèle branché, l'usine ne peut rien inventer.",
        bilan.outils.length > 0
          ? `${bilan.outils.length} outil(s) ont été écrits et chargés à chaud : ${bilan.outils.join(', ')}.`
          : "Aucun outil exécutable n'est sorti du run.",
        'Approuver livre ce qui existe ; écarter défait le chantier.',
      ].join(' '),
      objection,
    },
    (decision) => {
      contexte.emettre(
        decision === 'approuve'
          ? 'Décision : approuvé. Le produit est livré.'
          : 'Décision : écarté.',
      )
      contexte.terminer()
    },
  )
}

/** Une dernière critique, demandée au modèle sur ce qui existe vraiment. */
async function derniereObjection(
  contexte: Parameters<Composant['applique']>[0],
  chantier: Chantier,
  bilan: BilanDuRun,
): Promise<string> {
  const repli =
    bilan.outils.length === 0
      ? "Rien d'exécutable n'est sorti de ce run : il n'y a pas de produit à livrer."
      : `Le run a produit ${bilan.outils.length} outil(s) sur ${bilan.agents} agents ; rien ne prouve qu'ils couvrent le besoin exprimé.`

  const tour = await penser(
    contexte,
    chantier,
    'Formule en deux phrases l\'objection la plus sérieuse contre ce qui a été produit, en citant un élément précis. Réponds par {"pensee":"","actions":[{"type":"dire","message":"ton objection"}]}.',
    [
      `Besoin : ${chantier.brief}`,
      `Agents créés : ${bilan.agents}`,
      `Outils écrits : ${bilan.outils.join(', ') || 'aucun'}`,
      `Noms publiés : ${bilan.publications.join(', ') || 'aucun'}`,
    ].join('\n'),
  )
  const dit = tour?.actions.find((action) => action.type === 'dire')
  return dit?.type === 'dire' && dit.message.length > 0 ? dit.message : repli
}

/** L'identifiant du maître, quand l'orchestration en a besoin. */
export type IdMaitre = IdComposant
