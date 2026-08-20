// La disposition est calculée UNE FOIS, au démarrage, sur la topologie
// complète déclarée par le scénario — emplacements réservés compris. Les
// nœuds sont ensuite révélés, jamais repositionnés : sinon l'arrivée d'une
// pièce fabriquée ferait sauter tout ce qui est déjà posé.
//
// Seul le calcul de coordonnées est délégué. Le rendu reste à nous.

import dagre from '@dagrejs/dagre'
import type { Composant } from '../runtime/contrat'

export interface Boite {
  nom: string
  x: number
  y: number
  largeur: number
  hauteur: number
}

export interface Lien {
  de: string
  vers: string
  nom: string
  /** Points de la courbe, du départ à l'arrivée. */
  points: readonly { x: number; y: number }[]
}

export interface Disposition {
  boites: ReadonlyMap<string, Boite>
  liens: readonly Lien[]
  largeur: number
  hauteur: number
}

export const LARGEUR_NOEUD = 140
export const HAUTEUR_NOEUD = 56

export interface OptionsDisposition {
  /** L'ordre de déclaration : il fixe le rang à l'intérieur d'une couche. */
  ordre: readonly string[]
  ecartCouches?: number
  ecartRangs?: number
}

/**
 * Prend la topologie déclarée et rend des coordonnées stables. Deux runs de
 * même topologie donnent la même disposition, quel que soit l'ordre
 * d'activation, parce que les nœuds sont insérés dans l'ordre de déclaration.
 */
export function disposer(
  composants: readonly Composant[],
  options: OptionsDisposition,
): Disposition {
  const rang = new Map(options.ordre.map((nom, index) => [nom, index]))
  const tries = [...composants].sort((a, b) => (rang.get(a.nom) ?? 0) - (rang.get(b.nom) ?? 0))

  // Multigraphe : deux composants peuvent être reliés par plusieurs noms de
  // dépendance, et chaque arête doit garder son identité.
  const graphe = new dagre.graphlib.Graph({ directed: true, multigraph: true })
  graphe.setGraph({
    rankdir: 'LR',
    ranksep: options.ecartCouches ?? 96,
    nodesep: options.ecartRangs ?? 40,
    marginx: 24,
    marginy: 24,
  })
  graphe.setDefaultEdgeLabel(() => ({}))

  for (const composant of tries) {
    graphe.setNode(composant.nom, { width: LARGEUR_NOEUD, height: HAUTEUR_NOEUD })
  }

  // Qui publie quoi, d'après la déclaration seule : la disposition ne dépend
  // d'aucune exécution.
  const parNom = new Map<string, string>()
  for (const composant of tries) {
    for (const nom of composant.fournit ?? []) if (!parNom.has(nom)) parNom.set(nom, composant.nom)
  }

  const aretes: { de: string; vers: string; nom: string }[] = []
  for (const composant of tries) {
    for (const nom of composant.injecte ?? []) {
      const source = parNom.get(nom)
      if (source === undefined || source === composant.nom) continue
      aretes.push({ de: source, vers: composant.nom, nom })
      graphe.setEdge(source, composant.nom, {}, nom)
    }
  }

  dagre.layout(graphe)

  const boites = new Map<string, Boite>()
  for (const composant of tries) {
    const noeud = graphe.node(composant.nom) as
      { x: number; y: number; width: number; height: number } | undefined
    if (noeud === undefined) continue
    boites.set(composant.nom, {
      nom: composant.nom,
      // dagre centre ses nœuds ; on rend le coin haut-gauche, plus commode en SVG.
      x: noeud.x - noeud.width / 2,
      y: noeud.y - noeud.height / 2,
      largeur: noeud.width,
      hauteur: noeud.height,
    })
  }

  const liens: Lien[] = aretes.map((arete) => {
    const arc = graphe.edge(arete.de, arete.vers, arete.nom) as
      { points?: { x: number; y: number }[] } | undefined
    return { ...arete, points: arc?.points ?? [] }
  })

  const meta = graphe.graph() as { width?: number; height?: number }
  return {
    boites,
    liens,
    largeur: meta.width ?? 0,
    hauteur: meta.height ?? 0,
  }
}

/** Une courbe lissée passant par les points rendus par la disposition. */
export function cheminDeLien(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const [depart, ...suite] = points
  if (depart === undefined) return ''
  if (suite.length === 0) return `M ${depart.x} ${depart.y}`
  let chemin = `M ${depart.x} ${depart.y}`
  for (let index = 0; index < suite.length; index += 1) {
    const point = suite[index]
    const precedent = index === 0 ? depart : suite[index - 1]
    if (point === undefined || precedent === undefined) continue
    const milieu = (precedent.x + point.x) / 2
    chemin += ` C ${milieu} ${precedent.y}, ${milieu} ${point.y}, ${point.x} ${point.y}`
  }
  return chemin
}
