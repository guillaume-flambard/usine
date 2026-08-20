// Le raisonneur qui passe par le relais du serveur. C'est celui du site
// public : le visiteur n'a aucune clé à fournir, et la clé n'est jamais dans
// le navigateur.
//
// Même port que les autres. Un relais absent, saturé ou en panne retombe sur
// le repli déterministe — le run va au bout dans tous les cas.

import type { Demande, Raisonneur, Raisonnement } from './index'

export interface OptionsRelais {
  /** Même origine par défaut : nginx relaie /api vers le service. */
  point?: string
  delaiMs?: number
  fetchDeSubstitution?: typeof fetch
}

interface ReponseRelais {
  texte?: string
  modele?: string
  tokens?: { entree: number; sortie: number }
  erreur?: string
}

export function raisonneurRelais(options: OptionsRelais = {}): Raisonneur {
  const point = options.point ?? '/api/raisonner'
  const appeler = options.fetchDeSubstitution ?? globalThis.fetch

  return {
    origine: 'llm',
    async raisonner(demande: Demande): Promise<Raisonnement> {
      try {
        const reponse = await appeler(point, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            role: demande.role,
            instruction: demande.instruction,
            contexte: demande.contexte,
          }),
          signal: AbortSignal.timeout(options.delaiMs ?? 30_000),
        })

        const corps = (await reponse.json()) as ReponseRelais
        if (!reponse.ok || corps.erreur !== undefined) {
          return {
            texte: demande.repli,
            origine: 'llm',
            echec: corps.erreur ?? `relais indisponible (${reponse.status})`,
          }
        }

        const texte = (corps.texte ?? '').trim()
        if (texte.length === 0) {
          return {
            texte: demande.repli,
            origine: 'llm',
            echec: 'le modèle a répondu sans texte',
            ...(corps.tokens !== undefined ? { tokens: corps.tokens } : {}),
          }
        }

        return {
          texte,
          origine: 'llm',
          ...(corps.tokens !== undefined ? { tokens: corps.tokens } : {}),
        }
      } catch (cause) {
        return {
          texte: demande.repli,
          origine: 'llm',
          echec: cause instanceof Error ? cause.message : 'relais injoignable',
        }
      }
    },
  }
}

/** Le relais est-il configuré et joignable ? Sert à choisir le mode au démarrage. */
export async function relaisDisponible(
  point = '/api/sante',
  appeler: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const reponse = await appeler(point, { signal: AbortSignal.timeout(4000) })
    if (!reponse.ok) return false
    const corps = (await reponse.json()) as { pret?: boolean }
    return corps.pret === true
  } catch {
    return false
  }
}
