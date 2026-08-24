// Lire le rapport d'éval que le service tient sur les runs conservés.
//
// L'éval est le signal recruteur n°1 : la preuve qu'on a bâti avec de vrais
// LLM. Elle vit côté service (`services/api/usine_api/evaluation.py`), gratuite
// et sans fournisseur — ici on ne fait que la lire, et on la relit comme une
// donnée hostile, à l'image d'`archive-client.ts`.

const ENDPOINT = '/api/evaluation'

// Court comme le sondage des sources : cette ligne est un bonus, pas le run.
// Un service muet ne doit pas tenir une requête ouverte quinze secondes pour
// un texte que le visiteur ne verra peut-être jamais.
const TIMEOUT_MS = 6_000

/**
 * Le rapport agrégé, tel que `Report.as_json()` le rend.
 *
 * `medianFirstScreenRank` est `null` quand aucun run n'a servi d'écran — le
 * flux ne porte pas de rang à médianer, et on ne l'invente pas.
 */
export interface Evaluation {
  runs: number
  servedRatio: number
  replacedRatio: number
  medianFirstScreenRank: number | null
  meanTokens: number
  meanAgents: number
  totalRollbacks: number
  totalMalformed: number
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Un nombre fini, positif ou nul : un compte ou une moyenne ne descend pas sous zéro. */
const isCount = (value: unknown): value is number => isNumber(value) && value >= 0

/** Une part : entre 0 et 1. Hors bornes, ce n'est pas une part — on refuse. */
const isRatio = (value: unknown): value is number => isNumber(value) && value >= 0 && value <= 1

/**
 * Relit un rapport venu du service.
 *
 * Ce qui revient du réseau est une donnée hostile : un champ manquant, d'un
 * mauvais type, ou hors de son domaine (une part hors [0,1], un compte négatif)
 * fait rendre `undefined`, jamais un rendu partiel ou aberrant deviné — sinon
 * un service abusé afficherait « 150 % servent une app » comme un fait.
 */
function readEvaluation(value: unknown): Evaluation | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>

  const rank = candidate.medianFirstScreenRank
  if (!(rank === null || isCount(rank))) return undefined

  if (
    !isCount(candidate.runs) ||
    !isRatio(candidate.servedRatio) ||
    !isRatio(candidate.replacedRatio) ||
    !isCount(candidate.meanTokens) ||
    !isCount(candidate.meanAgents) ||
    !isCount(candidate.totalRollbacks) ||
    !isCount(candidate.totalMalformed)
  ) {
    return undefined
  }

  return {
    runs: candidate.runs,
    servedRatio: candidate.servedRatio,
    replacedRatio: candidate.replacedRatio,
    medianFirstScreenRank: rank,
    meanTokens: candidate.meanTokens,
    meanAgents: candidate.meanAgents,
    totalRollbacks: candidate.totalRollbacks,
    totalMalformed: candidate.totalMalformed,
  }
}

/**
 * La ligne de mesures à afficher, ou `undefined` s'il n'y a rien d'honnête à
 * montrer.
 *
 * Pur et testable : c'est ici que vivent la règle d'honnêteté (rien tant
 * qu'aucun run n'a été conservé — `runs === 0`, pas de zéros décoratifs), la
 * mise à l'échelle en pourcentage, et le repli `—` quand aucun rang n'existe.
 */
export function formatEvaluation(report: Evaluation | undefined): string | undefined {
  if (report === undefined || report.runs === 0) return undefined
  const percent = (ratio: number) => Math.round(ratio * 100)
  const rank = report.medianFirstScreenRank ?? '—'
  return (
    `Mesures — sur les runs conservés : ${report.runs} runs · ` +
    `${percent(report.servedRatio)}% servent une app · ` +
    `${percent(report.replacedRatio)}% avec remplacement à chaud · ` +
    `rang médian du 1er écran ${rank} · ` +
    `${Math.round(report.meanTokens)} tokens moyens`
  )
}

/**
 * Lit le rapport d'éval, ou rend `undefined`.
 *
 * Silencieux sur échec : un service absent ou un rapport illisible ne doit pas
 * emporter la page. Sans rapport, l'écran ne montre simplement rien — la règle
 * d'honnêteté veut qu'aucun élément ne s'affiche sans mesure réelle.
 */
export async function fetchEvaluation(
  endpoint = ENDPOINT,
  call: typeof fetch = globalThis.fetch,
): Promise<Evaluation | undefined> {
  try {
    const response = await call(endpoint, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return undefined
    return readEvaluation(await response.json())
  } catch {
    return undefined
  }
}
