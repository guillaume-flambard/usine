// Le port de raisonnement : le défaut ne touche jamais au réseau, et un
// modèle qui échoue ne casse pas le run.
import { describe, expect, it, vi } from 'vitest'
import { raisonneurDeterministe, type Demande, type Raisonneur } from '../index'
import { raisonneurClaude, MODELE_PAR_DEFAUT } from '../claude'

const DEMANDE: Demande = {
  role: 'architecte',
  instruction: 'Motive la composition.',
  contexte: 'Trois constructeurs.',
  repli: 'La réponse écrite à la main.',
}

describe('raisonneur déterministe', () => {
  it('rend le repli, sans réseau ni tokens', async () => {
    const fetchEspion = vi.spyOn(globalThis, 'fetch')
    const raisonnement = await raisonneurDeterministe().raisonner(DEMANDE)

    expect(raisonnement.texte).toBe(DEMANDE.repli)
    expect(raisonnement.origine).toBe('deterministe')
    expect(raisonnement.tokens).toBeUndefined()
    // La promesse de frugalité tient ou ne tient pas : rien ne part.
    expect(fetchEspion).not.toHaveBeenCalled()
    fetchEspion.mockRestore()
  })
})

/** Une fausse route HTTP : la suite ne doit jamais sortir sur le réseau. */
const reponseFactice = (corps: unknown, statut = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

const MESSAGE = (texte: string, stop = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: texte.length > 0 ? [{ type: 'text', text: texte }] : [],
  stop_reason: stop,
  stop_sequence: null,
  usage: {
    input_tokens: 1000,
    output_tokens: 250,
    cache_read_input_tokens: 120,
    cache_creation_input_tokens: 30,
  },
})

describe('raisonneur branché sur un modèle', () => {
  it('nomme le modèle par défaut sans le deviner', () => {
    expect(MODELE_PAR_DEFAUT).toBe('claude-opus-5')
    expect(raisonneurClaude({ cle: 'test' }).origine).toBe('llm')
  })

  it('rend le texte du modèle et compte les tokens réellement facturés', async () => {
    const raisonneur = raisonneurClaude({
      cle: 'cle-de-test',
      fetchDeSubstitution: reponseFactice(MESSAGE('Voici la composition retenue.')),
    })
    const raisonnement = await raisonneur.raisonner(DEMANDE)

    expect(raisonnement.texte).toBe('Voici la composition retenue.')
    expect(raisonnement.origine).toBe('llm')
    expect(raisonnement.echec).toBeUndefined()
    // Entrée = tokens frais + lus en cache + écrits en cache. Compter la
    // seule entrée fraîche sous-déclarerait la dépense réelle.
    expect(raisonnement.tokens).toEqual({ entree: 1000 + 120 + 30, sortie: 250 })
  })

  it('retombe sur le repli quand le modèle répond sans texte', async () => {
    const raisonneur = raisonneurClaude({
      cle: 'cle-de-test',
      fetchDeSubstitution: reponseFactice(MESSAGE('')),
    })
    const raisonnement = await raisonneur.raisonner(DEMANDE)

    expect(raisonnement.texte).toBe(DEMANDE.repli)
    expect(raisonnement.echec).toContain('sans texte')
    // Les tokens ont été dépensés malgré tout : les taire serait mentir.
    expect(raisonnement.tokens?.sortie).toBe(250)
  })

  it('refuse une réponse tronquée plutôt que de la publier', async () => {
    const raisonneur = raisonneurClaude({
      cle: 'cle-de-test',
      fetchDeSubstitution: reponseFactice(MESSAGE('Trois constructeurs en par', 'max_tokens')),
    })
    const raisonnement = await raisonneur.raisonner(DEMANDE)

    // Une phrase coupée en plein milieu n'est pas une décision d'architecte.
    expect(raisonnement.texte).toBe(DEMANDE.repli)
    expect(raisonnement.echec).toContain('tronquée')
  })

  it('retombe sur le repli quand la clé est refusée, sans lever', async () => {
    const raisonneur: Raisonneur = raisonneurClaude({
      cle: 'cle-invalide',
      fetchDeSubstitution: reponseFactice(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        401,
      ),
    })
    const raisonnement = await raisonneur.raisonner(DEMANDE)

    expect(raisonnement.texte).toBe(DEMANDE.repli)
    expect(raisonnement.origine).toBe('llm')
    expect(raisonnement.echec).toBeDefined()
    expect(raisonnement.tokens).toBeUndefined()
  })

  it('ne sort jamais sur le réseau réel pendant la suite', async () => {
    const espion = vi.spyOn(globalThis, 'fetch')
    await raisonneurClaude({
      cle: 'cle-de-test',
      fetchDeSubstitution: reponseFactice(MESSAGE('ok')),
    }).raisonner(DEMANDE)
    expect(espion).not.toHaveBeenCalled()
    espion.mockRestore()
  })
})
