// La disposition suit le graphe vivant. Elle ne peut plus être calculée une
// fois pour toutes : le graphe n'existe pas avant le brief, et il pousse
// pendant le run. Elle est donc recalculée à chaque changement de topologie
// — et seulement là, jamais à chaque événement.
//
// Les nœuds glissent vers leur nouvelle place au lieu d'apparaître posés :
// c'est la transition CSS du composant de nœud qui s'en charge.
//
// Seul le calcul de coordonnées est délégué. Le rendu reste à nous.

import dagre from '@dagrejs/dagre'
import type { AreteVue, NoeudVue } from './modele'

/** Le minimum dont la disposition a besoin d'un composant. */
export interface NoeudDisposable {
  nom: string
  injecte?: readonly string[]
  fournit?: readonly string[]
}

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
  composants: readonly NoeudDisposable[],
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

/**
 * La signature de la topologie vivante. Deux états qui la partagent donnent
 * la même disposition : c'est ce qui évite de relancer dagre à chaque
 * message ou changement d'état d'un nœud.
 */
export const signatureTopologie = (
  noeuds: readonly NoeudVue[],
  aretes: readonly AreteVue[],
): string =>
  [
    noeuds
      .map((noeud) => noeud.nom)
      .sort()
      .join(','),
    aretes
      .map((arete) => `${arete.de}>${arete.nom}>${arete.vers}`)
      .sort()
      .join(','),
  ].join('|')

/**
 * La disposition du graphe tel qu'il est à cet instant. Les arêtes viennent
 * de ce qui est réellement câblé, pas d'une déclaration : un lien n'apparaît
 * que si le noyau a établi la dépendance.
 */
export function disposerVivant(
  noeuds: readonly NoeudVue[],
  aretes: readonly AreteVue[],
  options: Partial<OptionsDisposition> = {},
): Disposition {
  const nomParId = new Map(noeuds.map((noeud) => [noeud.id, noeud.nom]))
  // L'ordre d'apparition fixe le rang à l'intérieur d'une couche : c'est le
  // seul ordre qui existe encore, le casting déclaré ayant disparu.
  const ordre = [...noeuds].sort((a, b) => a.apparuA - b.apparuA).map((noeud) => noeud.nom)

  // Les dépendances vues par la disposition sont celles que le noyau a
  // câblées ; `injecte` seul relierait des nœuds qui ne se parlent pas encore.
  const injectePar = new Map<string, string[]>()
  const fournitPar = new Map<string, string[]>()
  for (const arete of aretes) {
    const de = nomParId.get(arete.de)
    const vers = nomParId.get(arete.vers)
    if (de === undefined || vers === undefined) continue
    injectePar.set(vers, [...(injectePar.get(vers) ?? []), arete.nom])
    if (!(fournitPar.get(de) ?? []).includes(arete.nom)) {
      fournitPar.set(de, [...(fournitPar.get(de) ?? []), arete.nom])
    }
  }

  return disposer(
    noeuds.map((noeud) => ({
      nom: noeud.nom,
      injecte: injectePar.get(noeud.nom) ?? [],
      fournit: fournitPar.get(noeud.nom) ?? [],
    })),
    { ...options, ordre },
  )
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
