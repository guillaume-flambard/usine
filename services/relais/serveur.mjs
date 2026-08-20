// Point d'entrée du relais. Toute la logique est dans `relais.mjs` ; ici on
// ne fait que lire l'environnement et écouter.

import { creerRelais } from './relais.mjs'

const PORT = Number(process.env.PORT ?? 3000)
const MODELE = process.env.MODELE ?? 'anthropic/claude-3.5-haiku'
const CLE = process.env.OPENROUTER_API_KEY ?? ''

if (CLE.length === 0) {
  // On démarre quand même : /sante répondra `pret: false`, et le site restera
  // en mode déterministe au lieu d'annoncer un modèle qu'il n'a pas.
  process.stdout.write('relais sans clé : /raisonner rendra 503\n')
}

creerRelais({
  cle: CLE,
  modele: MODELE,
  origine: process.env.ORIGINE ?? 'https://usine.memolabs.dev',
}).listen(PORT, () => {
  process.stdout.write(`relais de raisonnement sur :${PORT} — modèle ${MODELE}\n`)
})
