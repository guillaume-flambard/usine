import type { Agent } from './client'

/** Une alerte, ou plusieurs identiques posées sur des agents différents. */
export interface Groupe {
  cle: string
  /** La première phrase : elle dit quoi, sans la leçon. */
  resume: string
  /** Le texte entier, gardé pour qui veut comprendre. */
  texte: string
  /** Les agents concernés, dans l'ordre où l'observateur les a vus. */
  agents: string[]
}

/** La première phrase, points de suspension et abréviations mis à part. */
function premierePhrase(texte: string): string {
  const fin = texte.search(/\.(\s|$)/)
  return fin === -1 ? texte.trim() : texte.slice(0, fin + 1).trim()
}

/**
 * Regroupe les alertes identiques.
 *
 * Trois agents qui partagent un compte b.ai produisent trois fois la même
 * alerte de quota, cinq lignes chacune. Répétée, elle ne dit pas trois
 * problèmes : elle dit un problème et trois victimes. En dix secondes, la
 * distinction est tout ce qui compte.
 *
 * Le regroupement se fait sur le texte débarrassé de ses nombres, parce que
 * c'est le seul écart entre « 3 refus de quota » et « 2 refus de quota » : même
 * cause, même conduite à tenir. Rien n'est rejugé ici, ni requalifié : deux
 * alertes que l'observateur a écrites pareil sont montrées ensemble, c'est tout.
 */
export function grouper(agents: readonly Agent[]): Groupe[] {
  const groupes = new Map<string, Groupe>()
  for (const agent of agents) {
    for (const texte of agent.alertes) {
      const cle = texte.replace(/\d+/g, '#')
      const connu = groupes.get(cle)
      if (connu) {
        if (!connu.agents.includes(agent.nom)) connu.agents.push(agent.nom)
        continue
      }
      groupes.set(cle, {
        cle,
        resume: premierePhrase(texte),
        texte,
        agents: [agent.nom],
      })
    }
  }
  return [...groupes.values()]
}
