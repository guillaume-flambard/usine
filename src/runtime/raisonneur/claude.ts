// L'adaptateur Claude. Chargé à la demande : le mode par défaut ne doit
// embarquer ni le SDK ni la moindre route réseau.
//
// La clé est fournie par l'utilisateur, vit en mémoire de module, et ne sort
// que vers l'API d'Anthropic. Elle n'est ni persistée ni journalisée.

import type { Demande, Raisonneur, Raisonnement } from './index'

/** Le modèle par défaut. Configurable, mais jamais deviné. */
export const MODELE_PAR_DEFAUT = 'claude-opus-5'

export interface OptionsClaude {
  cle: string
  modele?: string
  /** Profondeur de réflexion. Le défaut de l'API est `high`. */
  effort?: 'low' | 'medium' | 'high'
  /** Au-delà, on retombe sur le repli : un run ne doit pas pendre. */
  delaiMs?: number
  /** Point d'entrée de substitution, pour tester sans réseau. */
  fetchDeSubstitution?: typeof fetch
  baseURL?: string
}

/** Ce qui a réellement été facturé en entrée, cache compris. */
const tokensEntree = (usage: {
  input_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}) =>
  usage.input_tokens +
  (usage.cache_read_input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0)

export function raisonneurClaude(options: OptionsClaude): Raisonneur {
  return {
    origine: 'llm',
    async raisonner(demande: Demande): Promise<Raisonnement> {
      try {
        // Import dynamique : sans clé, le SDK n'entre jamais dans le bundle
        // exécuté, et aucune requête n'est possible.
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        const client = new Anthropic({
          apiKey: options.cle,
          // Un appel qui ne revient jamais ferait pendre le run indéfiniment.
          timeout: options.delaiMs ?? 60_000,
          maxRetries: 1,
          ...(options.fetchDeSubstitution !== undefined
            ? { fetch: options.fetchDeSubstitution }
            : {}),
          ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
          // L'application est client-only et la clé appartient à
          // l'utilisateur qui l'a saisie : c'est un choix explicite, pas un
          // oubli. Il est dit à l'écran avant le premier appel.
          dangerouslyAllowBrowser: true,
        })

        const reponse = await client.messages.create({
          model: options.modele ?? MODELE_PAR_DEFAUT,
          max_tokens: 2048,
          thinking: { type: 'adaptive' },
          output_config: { effort: options.effort ?? 'medium' },
          system:
            "Tu es un agent d'une chaîne de production logicielle. Réponds en français, " +
            'en texte brut, sans préambule ni formatage. Sois bref et concret.',
          messages: [
            {
              role: 'user',
              content: [
                `Rôle : ${demande.role}`,
                `Tâche : ${demande.instruction}`,
                '',
                'Contexte :',
                demande.contexte,
              ].join('\n'),
            },
          ],
        })

        const texte = reponse.content
          .filter((bloc): bloc is Extract<typeof bloc, { type: 'text' }> => bloc.type === 'text')
          .map((bloc) => bloc.text)
          .join('\n')
          .trim()

        const tokens = {
          entree: tokensEntree(reponse.usage),
          sortie: reponse.usage.output_tokens,
        }

        if (texte.length === 0) {
          return {
            texte: demande.repli,
            origine: 'llm',
            echec: 'Le modèle a répondu sans texte.',
            tokens,
          }
        }

        // Une réponse coupée en plein milieu n'est pas une décision : la
        // publier comme telle serait pire que de ne pas appeler le modèle.
        if (reponse.stop_reason === 'max_tokens') {
          return {
            texte: demande.repli,
            origine: 'llm',
            echec: 'Réponse tronquée par la limite de tokens.',
            tokens,
          }
        }

        return { texte, origine: 'llm', tokens }
      } catch (cause) {
        // Clé invalide, quota, réseau : le run continue sur le repli
        // déterministe. Un agent branché ne doit pas pouvoir casser la
        // démonstration.
        return {
          texte: demande.repli,
          origine: 'llm',
          echec: cause instanceof Error ? cause.message : String(cause),
        }
      }
    },
  }
}
