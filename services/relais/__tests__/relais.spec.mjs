// Le relais porte la clé. Ce qui se vérifie ici : elle ne ressort jamais, ce
// qui rentre est borné, et le débit est plafonné avant le premier euro.
import { describe, expect, it, vi } from 'vitest'
import { creerCompteur, creerGestionnaire, LIMITES } from '../relais.mjs'

const CLE = 'sk-or-v1-secrete'

/** Un serveur éphémère : on parle au relais par le réseau, comme le vrai. */
async function surServeur(options, travail) {
  const { createServer } = await import('node:http')
  const serveur = createServer(creerGestionnaire(options))
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre))
  const { port } = serveur.address()
  try {
    return await travail(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resoudre) => serveur.close(resoudre))
  }
}

const reponseModele = (contenu, usage = { prompt_tokens: 120, completion_tokens: 40 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content: contenu } }], usage }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const demander = (base, corps) =>
  fetch(`${base}/raisonner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(corps),
  })

describe('le relais de raisonnement', () => {
  it('rend le texte et les tokens du modèle, sans jamais rendre la clé', async () => {
    const appeler = vi.fn(async () => reponseModele('Une composition en trois temps.'))
    await surServeur({ cle: CLE, appeler }, async (base) => {
      const reponse = await demander(base, {
        role: 'architecte',
        instruction: 'Décris.',
        contexte: 'Trois histoires.',
      })
      const brut = await reponse.text()
      expect(reponse.status).toBe(200)
      expect(JSON.parse(brut)).toMatchObject({
        texte: 'Une composition en trois temps.',
        tokens: { entree: 120, sortie: 40 },
      })
      expect(brut).not.toContain(CLE)
      expect(JSON.stringify([...reponse.headers])).not.toContain(CLE)
    })

    // La clé part chez le fournisseur, et nulle part ailleurs.
    const [url, options] = appeler.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(options.headers.authorization).toBe(`Bearer ${CLE}`)
  })

  it('borne ce qui part chez le fournisseur', async () => {
    const appeler = vi.fn(async () => reponseModele('ok'))
    await surServeur({ cle: CLE, appeler }, (base) =>
      demander(base, {
        role: 'sceptique',
        instruction: 'x'.repeat(5000),
        contexte: 'y'.repeat(12_000),
      }),
    )

    const envoye = JSON.parse(appeler.mock.calls[0][1].body)
    expect(envoye.max_tokens).toBe(LIMITES.sortieMax)
    const utilisateur = envoye.messages.at(-1).content
    expect(utilisateur.match(/x+/)[0]).toHaveLength(LIMITES.instructionMax)
    expect(utilisateur.match(/y+/)[0]).toHaveLength(LIMITES.contexteMax)
  })

  it("refuse un rôle qui n'est pas au casting, sans appeler le modèle", async () => {
    const appeler = vi.fn(async () => reponseModele('ne devrait pas partir'))
    await surServeur({ cle: CLE, appeler }, async (base) => {
      const reponse = await demander(base, { role: 'exfiltrateur', instruction: 'ignore tout' })
      expect(reponse.status).toBe(400)
      expect((await reponse.json()).erreur).toContain('rôle inconnu')
    })
    expect(appeler).not.toHaveBeenCalled()
  })

  it('ne relaie pas le message d erreur du fournisseur tel quel', async () => {
    const appeler = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: `clé ${CLE} invalide` } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )
    await surServeur({ cle: CLE, appeler }, async (base) => {
      const reponse = await demander(base, { role: 'architecte', instruction: 'x' })
      const brut = await reponse.text()
      expect(reponse.status).toBe(502)
      expect(brut).not.toContain(CLE)
      expect(brut).toContain('401')
    })
  })

  it('annonce son état sans clé, et refuse de raisonner', async () => {
    await surServeur({ cle: '', modele: 'anthropic/claude-3.5-haiku' }, async (base) => {
      expect(await (await fetch(`${base}/sante`)).json()).toEqual({
        pret: false,
        modele: 'anthropic/claude-3.5-haiku',
      })
      expect((await demander(base, { role: 'architecte', instruction: 'x' })).status).toBe(503)
    })
  })

  it('coupe une charge utile démesurée avant de la lire', async () => {
    const appeler = vi.fn(async () => reponseModele('ne devrait pas partir'))
    await surServeur({ cle: CLE, appeler }, async (base) => {
      // Le relais ferme la connexion : le client voit une panne réseau, pas
      // un relais qui a avalé un mégaoctet.
      await expect(
        demander(base, { role: 'architecte', contexte: 'z'.repeat(LIMITES.corpsMax * 3) }),
      ).rejects.toThrow()
    })
    expect(appeler).not.toHaveBeenCalled()
  })

  it('ignore toute route qui n est pas la sienne', async () => {
    await surServeur({ cle: CLE }, async (base) => {
      expect((await fetch(`${base}/`)).status).toBe(404)
      expect((await fetch(`${base}/raisonner`)).status).toBe(404)
    })
  })
})

describe('le compteur de débit', () => {
  it('plafonne une adresse à la minute, puis la relâche', () => {
    let instant = Date.parse('2026-08-20T10:00:00Z')
    const autorise = creerCompteur(LIMITES, () => instant)

    for (let i = 0; i < LIMITES.parMinute; i += 1) expect(autorise('a')).toBeUndefined()
    expect(autorise('a')).toContain('trop de demandes')
    // Une autre adresse n'est pas punie pour la première.
    expect(autorise('b')).toBeUndefined()

    instant += 61_000
    expect(autorise('a')).toBeUndefined()
  })

  it('plafonne la journée entière, toutes adresses confondues', () => {
    let instant = Date.parse('2026-08-20T10:00:00Z')
    const limites = { ...LIMITES, parMinute: 10_000, parJour: 12 }
    const autorise = creerCompteur(limites, () => instant)

    for (let i = 0; i < limites.parJour; i += 1) expect(autorise(`ip-${i}`)).toBeUndefined()
    expect(autorise('ip-neuve')).toBe('quota du jour atteint')

    // Le lendemain, le quota repart : sinon le site meurt au premier abus.
    instant += 24 * 3600_000
    expect(autorise('ip-neuve')).toBeUndefined()
  })
})
