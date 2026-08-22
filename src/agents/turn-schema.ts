// Le vocabulaire d'actions, décrit une fois, en **outils**.
//
// La version précédente décrivait un seul schéma de sortie, avec une union
// discriminée par un champ `type`. Elle a échoué en production, et la cause
// mérite d'être écrite parce qu'elle n'était pas devinable :
//
// Le fournisseur sérialise les clés **par ordre alphabétique**. Un décodeur
// contraint écrit donc `name` avant `type` — et à cet instant, la seule
// branche de l'union où `name` est le seul autre champ est `remove`. Le modèle
// voulait faire naître un agent ; il s'est retrouvé enfermé dans « retirer »,
// et l'a répété jusqu'à épuiser ses tours. Le discriminant arrivait après les
// champs qu'il devait discriminer.
//
// Avec des outils, le nom de l'action sort du corps JSON : le fournisseur
// l'émet dans son propre champ, avant tout argument. Aucun ordre de clés ne
// peut plus le brouiller. C'est aussi ce que fait tout l'écosystème — et c'est
// cette raison-là, pas l'interopérabilité, qui décide.

/** Les noms sont contraints ici comme ils le sont à la relecture. */
const NAME_PATTERN = '^[a-z][a-z0-9-]{1,39}$'

const text = (maxLength: number, description: string) => ({
  type: 'string',
  maxLength,
  description,
})

const named = (description: string) => ({
  type: 'string',
  pattern: NAME_PATTERN,
  description,
})

const nullable = (shape: Record<string, unknown>) => ({ anyOf: [shape, { type: 'null' }] })

/**
 * Un outil.
 *
 * Tous les champs sont requis : un champ absent de `required` rend le schéma
 * non conforme au mode strict, et un décodeur devant un schéma non conforme se
 * comporte d'une façon que personne ne documente. Un champ facultatif se
 * déclare « ou nul » plutôt qu'en étant omis.
 */
const tool = (name: string, description: string, properties: Record<string, unknown>) => ({
  type: 'function',
  function: {
    name,
    description,
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    },
  },
})

/** Le vocabulaire, tel que le fournisseur le reçoit. */
export const TOOLS = [
  tool('create', "Fait naître un agent qui n'existait pas.", {
    name: named('Le nom du nouvel agent, en kebab-case.'),
    label: text(28, 'Un libellé court pour le graphe.'),
    role: text(140, 'Son rôle, en une ligne.'),
    mission: text(600, "Ce qu'il doit accomplir."),
    needs: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 40 },
      description: "Les noms publiés par d'autres dont il a besoin.",
    },
    provides: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', pattern: NAME_PATTERN },
      description: "Les noms qu'il publiera.",
    },
  }),
  tool('ask', 'Pose une question à un agent vivant et attend sa réponse.', {
    to: text(40, "Le nom de l'agent interrogé."),
    question: text(600, 'La question.'),
  }),
  tool(
    'screen',
    "Pose ou remplace l'écran de l'application. Balisage seulement : aucun script, aucun attribut d'événement. Une commande appelle un comportement par data-invoke, une saisie se déclare par data-field, la réponse s'affiche dans data-output.",
    { markup: text(40_000, "Le balisage de l'écran.") },
  ),
  tool("build", "Écrit un comportement de l'application et le charge à chaud.", {
    name: named("Le nom que l'écran appellera."),
    code: text(
      8_000,
      "Une expression JavaScript qui s'évalue en fonction d'un seul argument. Pas d'import, pas de réseau, pas de DOM.",
    ),
    source: nullable(named('Une source de données à brancher, ou null.')),
  }),
  tool(
    'replace',
    "Remplace un comportement vivant que tu as écrit par une meilleure version, pendant que le visiteur s'en sert.",
    {
      name: named('Le comportement à remplacer.'),
      code: text(8_000, 'La nouvelle version.'),
      source: nullable(named('Une source à brancher, ou null.')),
    },
  ),
  tool('publish', 'Publie une valeur sous un nom que tu as déclaré fournir.', {
    name: text(40, 'Un de tes noms fournis.'),
    text: text(4_000, 'Ce que tu publies.'),
  }),
  tool('remove', 'Retire un agent que tu as toi-même créé.', {
    name: text(40, "Le nom de l'agent à retirer."),
  }),
  tool('say', 'Dit quelque chose dans la narration du run.', {
    message: text(400, 'Le message.'),
  }),
  tool('done', 'Ta mission est remplie ; tu termines.', {
    summary: text(600, 'Ce que tu as fait.'),
  }),
] as const

/** Les noms d'outils. Ce qui n'en est pas un n'est pas une action. */
export const TOOL_NAMES: ReadonlySet<string> = new Set(
  TOOLS.map((entry) => entry.function.name as string),
)
