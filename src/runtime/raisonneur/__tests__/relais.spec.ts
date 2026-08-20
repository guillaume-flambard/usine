// Le relais est le seul chemin par lequel le site public fait raisonner un
// modèle. Ce qui compte ici : la clé n'y transite jamais, et aucune panne du
// relais n'empêche un run d'aller au bout.
import { describe, expect, it, vi } from 'vitest'
import { raisonneurRelais, relaisDisponible } from '../relais'
import type { Demande } from '../index'

const DEMANDE: Demande = {
  role: 'architecte',
  instruction: 'Décris la composition en deux phrases.',
  contexte: 'Trois histoires.',
  repli: 'Trois constructeurs, un sceptique, une porte.',
}

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  })

describe('le raisonneur qui passe par le relais', () => {
  it('rend le texte du modèle et les tokens réellement comptés', async () => {
    const appeler = vi.fn(async () =>
      reponse({
        texte: '  Une composition en trois temps.  ',
        tokens: { entree: 120, sortie: 40 },
      }),
    )
    const resultat = await raisonneurRelais({ fetchDeSubstitution: appeler }).raisonner(DEMANDE)

    expect(resultat).toEqual({
      texte: 'Une composition en trois temps.',
      origine: 'llm',
      tokens: { entree: 120, sortie: 40 },
    })
    expect(resultat.echec).toBeUndefined()
  })

  it("n'envoie ni clé ni repli au serveur", async () => {
    const appeler = vi.fn(async () => reponse({ texte: 'ok' }))
    await raisonneurRelais({ fetchDeSubstitution: appeler }).raisonner(DEMANDE)

    const [url, options] = appeler.mock.calls[0] as [string, RequestInit]
    // Même origine : c'est ce qui permet `connect-src 'self'`.
    expect(url).toBe('/api/raisonner')
    const corps = JSON.parse(String(options.body)) as Record<string, unknown>
    expect(Object.keys(corps).sort()).toEqual(['contexte', 'instruction', 'role'])
    expect(JSON.stringify(options.headers)).not.toMatch(/authorization|api-key/i)
  })

  it('retombe sur le repli quand le relais refuse, et le dit', async () => {
    const appeler = vi.fn(async () => reponse({ erreur: 'quota du jour atteint' }, 429))
    const resultat = await raisonneurRelais({ fetchDeSubstitution: appeler }).raisonner(DEMANDE)

    expect(resultat.texte).toBe(DEMANDE.repli)
    expect(resultat.echec).toBe('quota du jour atteint')
  })

  it('retombe sur le repli quand le relais est injoignable', async () => {
    const appeler = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })
    const resultat = await raisonneurRelais({ fetchDeSubstitution: appeler }).raisonner(DEMANDE)

    expect(resultat.texte).toBe(DEMANDE.repli)
    expect(resultat.echec).toBe('Failed to fetch')
  })

  it('refuse une réponse vide plutôt que de livrer du blanc', async () => {
    const appeler = vi.fn(async () => reponse({ texte: '   ' }))
    const resultat = await raisonneurRelais({ fetchDeSubstitution: appeler }).raisonner(DEMANDE)

    expect(resultat.texte).toBe(DEMANDE.repli)
    expect(resultat.echec).toBe('le modèle a répondu sans texte')
  })
})

describe('la sonde du relais', () => {
  it('ne déclare le relais prêt que s il porte une clé', async () => {
    const pret = vi.fn(async () => reponse({ pret: true, modele: 'anthropic/claude-3.5-haiku' }))
    const sansCle = vi.fn(async () => reponse({ pret: false }))

    expect(await relaisDisponible('/api/sante', pret)).toBe(true)
    expect(await relaisDisponible('/api/sante', sansCle)).toBe(false)
  })

  it('rend faux sur 502, sur corps illisible et sur panne réseau', async () => {
    const cinqCentDeux = vi.fn(async () => new Response('Bad Gateway', { status: 502 }))
    const illisible = vi.fn(async () => new Response('<html>', { status: 200 }))
    const panne = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })

    expect(await relaisDisponible('/api/sante', cinqCentDeux)).toBe(false)
    expect(await relaisDisponible('/api/sante', illisible)).toBe(false)
    expect(await relaisDisponible('/api/sante', panne)).toBe(false)
  })
})
