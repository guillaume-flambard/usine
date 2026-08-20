// Relais de raisonnement. Il existe pour une seule raison : garder la clé
// OpenRouter côté serveur. Une clé dans un bundle client se lit dans l'onglet
// réseau et se vide.
//
// Aucune dépendance : Node seul. Ce qui rentre est borné, ce qui sort est
// borné, et le débit est limité par adresse. Le module n'écoute pas de
// lui-même — `serveur.mjs` s'en charge — pour rester testable.

import { createServer } from 'node:http'

/** Bornes dures. Un visiteur ne peut pas faire dériver la facture. */
export const LIMITES = {
  contexteMax: 4000,
  instructionMax: 500,
  corpsMax: 20_000,
  sortieMax: 400,
  parMinute: 6,
  parJour: 300,
}

/** Seuls ces rôles peuvent demander à raisonner. */
export const ROLES = new Set(['planificateur', 'architecte', 'sceptique'])

const CONSIGNE =
  "Tu es un agent d'une chaîne de production logicielle. Réponds en français, " +
  'en texte brut, sans préambule, sans titre, sans liste à puces. Trois phrases au plus.'

/**
 * Le compteur de débit. Par adresse pour la minute, global pour la journée :
 * la seconde borne est celle qui protège la facture.
 */
export function creerCompteur(limites = LIMITES, horloge = () => Date.now()) {
  const passages = new Map()
  let jour = { date: '', total: 0 }

  return function autorise(adresse) {
    const maintenant = horloge()
    const date = new Date(maintenant).toISOString().slice(0, 10)
    if (date !== jour.date) jour = { date, total: 0 }
    if (jour.total >= limites.parJour) return 'quota du jour atteint'

    const recents = (passages.get(adresse) ?? []).filter((t) => maintenant - t < 60_000)
    if (recents.length >= limites.parMinute) return 'trop de demandes, réessayez dans une minute'
    recents.push(maintenant)
    passages.set(adresse, recents)
    jour.total += 1
    return undefined
  }
}

const lireCorps = (requete, maximum) =>
  new Promise((resoudre, rejeter) => {
    let donnees = ''
    requete.on('data', (bout) => {
      donnees += bout
      // On coupe avant de lire : une charge utile démesurée ne doit pas
      // pouvoir occuper la mémoire du relais.
      if (donnees.length > maximum) {
        rejeter(new Error('charge utile trop grande'))
        requete.destroy()
      }
    })
    requete.on('end', () => resoudre(donnees))
    requete.on('error', rejeter)
  })

/**
 * Le gestionnaire de requêtes. `appeler` est injectable : les tests ne
 * sortent jamais sur le réseau, et le fournisseur reste remplaçable.
 */
export function creerGestionnaire({
  cle = '',
  modele = 'anthropic/claude-3.5-haiku',
  origine = 'https://usine.memolabs.dev',
  appeler = globalThis.fetch,
  limites = LIMITES,
  autorise = creerCompteur(limites),
} = {}) {
  const json = (reponse, code, corps) => {
    reponse.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origine,
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    })
    reponse.end(JSON.stringify(corps))
  }

  return async function gerer(requete, reponse) {
    if (requete.method === 'OPTIONS') return json(reponse, 204, {})
    const chemin = (requete.url ?? '').split('?')[0]

    if (chemin === '/sante') {
      // `pret` dit s'il y a une clé, jamais laquelle : c'est ce que le
      // navigateur lit pour choisir son mode.
      return json(reponse, 200, { pret: cle.length > 0, modele })
    }
    if (requete.method !== 'POST' || chemin !== '/raisonner') {
      return json(reponse, 404, { erreur: 'route inconnue' })
    }
    if (cle.length === 0) {
      return json(reponse, 503, { erreur: 'aucune clé configurée sur le relais' })
    }

    let demande
    try {
      demande = JSON.parse(await lireCorps(requete, limites.corpsMax))
    } catch (cause) {
      return json(reponse, 400, { erreur: cause instanceof Error ? cause.message : String(cause) })
    }

    // Le rôle est validé avant le compteur : une demande malformée ne doit
    // pas consommer le quota des visiteurs légitimes.
    const role = String(demande?.role ?? '')
    if (!ROLES.has(role)) return json(reponse, 400, { erreur: `rôle inconnu : ${role}` })

    const adresse = String(requete.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      .trim()
    const refus = autorise(adresse.length > 0 ? adresse : (requete.socket?.remoteAddress ?? '?'))
    if (refus !== undefined) return json(reponse, 429, { erreur: refus })

    const instruction = String(demande?.instruction ?? '').slice(0, limites.instructionMax)
    const contexte = String(demande?.contexte ?? '').slice(0, limites.contexteMax)

    try {
      const appel = await appeler('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cle}`,
          'content-type': 'application/json',
          'http-referer': origine,
          'x-title': "L'usine agentique — Memo Labs",
        },
        body: JSON.stringify({
          model: modele,
          max_tokens: limites.sortieMax,
          messages: [
            { role: 'system', content: CONSIGNE },
            {
              role: 'user',
              content: `Rôle : ${role}\nTâche : ${instruction}\n\nContexte :\n${contexte}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      })

      const resultat = await appel.json()
      if (!appel.ok) {
        // Le message du fournisseur peut contenir n'importe quoi : il ne
        // repart pas tel quel, seul son statut est public.
        return json(reponse, 502, { erreur: `le modèle a refusé (${appel.status})` })
      }

      const texte = String(resultat?.choices?.[0]?.message?.content ?? '').trim()
      const usage = resultat?.usage ?? {}
      return json(reponse, 200, {
        texte,
        modele: resultat?.model ?? modele,
        tokens: {
          entree: Number(usage.prompt_tokens ?? 0),
          sortie: Number(usage.completion_tokens ?? 0),
        },
      })
    } catch (cause) {
      return json(reponse, 502, {
        erreur: cause instanceof Error ? cause.message : 'appel au modèle impossible',
      })
    }
  }
}

export const creerRelais = (options) => createServer(creerGestionnaire(options))
