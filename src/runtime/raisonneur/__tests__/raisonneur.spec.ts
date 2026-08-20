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

describe('raisonneur branché sur un modèle', () => {
  it('nomme le modèle par défaut sans le deviner', () => {
    expect(MODELE_PAR_DEFAUT).toBe('claude-opus-5')
    expect(raisonneurClaude({ cle: 'test' }).origine).toBe('llm')
  })

  it('retombe sur le repli quand la clé est refusée, sans lever', async () => {
    // Aucune clé valide ici : l'appel échoue, et c'est le comportement testé.
    const raisonneur: Raisonneur = raisonneurClaude({ cle: 'cle-invalide' })
    const raisonnement = await raisonneur.raisonner(DEMANDE)

    expect(raisonnement.texte).toBe(DEMANDE.repli)
    expect(raisonnement.origine).toBe('llm')
    expect(raisonnement.echec).toBeDefined()
    expect(raisonnement.tokens).toBeUndefined()
  })
})
