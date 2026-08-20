// De quoi mener un run dans un test sans réécrire dix fois la même attente.
// Le graphe n'est plus connu d'avance : on n'attend donc plus un nombre de
// ticks, on attend un état.

import { creerPilote, type Pilote } from '../pilote'

export const BRIEF_SANTE =
  'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.'

export const BRIEF_PUB =
  'Un outil qui repère les allégations publicitaires trompeuses dans les copies de marques, avec un écran pour coller le texte.'

const souffler = () => new Promise<void>((resoudre) => setTimeout(resoudre, 5))

/** Attend qu'une condition devienne vraie, ou rend la main au bout du délai. */
export async function jusqua(condition: () => boolean, delaiMs = 3000): Promise<boolean> {
  const fin = Date.now() + delaiMs
  while (Date.now() < fin) {
    if (condition()) return true
    await souffler()
  }
  return condition()
}

/** Un run mené jusqu'à la porte humaine, quel que soit le graphe choisi. */
export async function runJusquALaPorte(brief = BRIEF_SANTE): Promise<Pilote> {
  // Cadence à zéro : la cadence de lecture est une affaire d'écran, elle n'a
  // rien à faire dans le temps d'une suite de tests.
  const pilote = creerPilote({ cadenceMs: 0 })
  await pilote.demarrer(brief)
  await jusqua(() => pilote.store.etat.value.porte !== undefined)
  return pilote
}

/** Un run mené jusqu'au produit livré. */
export async function runApprouve(brief = BRIEF_SANTE): Promise<Pilote> {
  const pilote = await runJusquALaPorte(brief)
  pilote.approuver()
  await jusqua(() => pilote.verificateur() !== undefined)
  return pilote
}

/** Un run mené jusqu'à ce que plus rien ne bouge. */
export async function runTermine(brief = BRIEF_SANTE): Promise<Pilote> {
  const pilote = await runApprouve(brief)
  await jusqua(() => pilote.fini())
  return pilote
}
