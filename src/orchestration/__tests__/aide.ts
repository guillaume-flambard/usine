// De quoi mener un run dans un test sans réécrire dix fois la même attente.
// Le graphe n'est plus connu d'avance : on n'attend donc plus un nombre de
// ticks, on attend un état.

import { creerPilote, type Pilote } from '../pilote'
import { modeleScripte } from '../../agents/__tests__/modele-scripte'

export const BRIEF = 'Un outil qui repère les allégations thérapeutiques interdites.'

const souffler = () => new Promise<void>((resoudre) => setTimeout(resoudre, 5))

/** Attend qu'une condition devienne vraie, ou rend la main au bout du délai. */
export async function jusqua(condition: () => boolean, delaiMs = 8000): Promise<boolean> {
  const fin = Date.now() + delaiMs
  while (Date.now() < fin) {
    if (condition()) return true
    await souffler()
  }
  return condition()
}

/** Un pilote branché sur le modèle scripté : sans modèle, rien ne naît. */
export const piloteScripte = (): Pilote => {
  const pilote = creerPilote({ pasMs: 10, delaiStabilisationMs: 4000 })
  pilote.brancher(modeleScripte())
  return pilote
}

/** Un run mené jusqu'à la porte humaine, quel que soit le graphe inventé. */
export async function runJusquALaPorte(brief = BRIEF): Promise<Pilote> {
  const pilote = piloteScripte()
  await pilote.demarrer(brief)
  await jusqua(() => pilote.store.etat.value.porte !== undefined)
  return pilote
}

/** Un run mené jusqu'au produit livré. */
export async function runApprouve(brief = BRIEF): Promise<Pilote> {
  const pilote = await runJusquALaPorte(brief)
  pilote.approuver()
  await jusqua(() => pilote.produit() !== undefined)
  return pilote
}

/** Un run mené jusqu'à ce que plus rien ne bouge. */
export async function runTermine(brief = BRIEF): Promise<Pilote> {
  const pilote = await runApprouve(brief)
  await jusqua(() => pilote.fini())
  return pilote
}
