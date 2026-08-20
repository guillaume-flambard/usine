// Les agents du mode par défaut. Leur jugement est écrit à la main — mais
// leur existence, leur câblage et leur travail sont réels : ils lisent une
// entrée, produisent une sortie, la publient, et déclenchent l'aval.

import type { Composant } from '../runtime/contrat'

export interface Besoin {
  brief: string
  secteur: string
}

export interface Histoires {
  titres: readonly string[]
}

export interface Memoire {
  secteur: string
  decisions: readonly string[]
}

export interface Sortie {
  quoi: string
  criteres: readonly string[]
}

export interface Specification {
  produit: string
  constructeurs: readonly string[]
  criteres: readonly string[]
}

export const agentMaitre = (besoin: Besoin): Composant => ({
  nom: 'agent-maitre',
  fournit: ['besoin', 'memoire'],
  presentation: { libelle: 'Agent maître', role: 'Ouvre le run et tient la mémoire du secteur' },
  applique(contexte) {
    contexte.emettre(`Constitue sa mémoire sur le secteur : ${besoin.secteur}.`)
    contexte.fournir('besoin', besoin)
    contexte.fournir('memoire', {
      secteur: besoin.secteur,
      decisions: [`Brief retenu : ${besoin.brief}`],
    })
    contexte.terminer()
  },
})

export const planificateur: Composant = {
  nom: 'planificateur',
  injecte: ['besoin'],
  fournit: ['histoires'],
  presentation: { libelle: 'Planificateur', role: 'Découpe le besoin en histoires utilisateur' },
  applique(contexte) {
    const besoin = contexte.lire<Besoin>('besoin')
    const titres = [
      'Coller une copie marketing',
      'Obtenir un verdict par allégation',
      'Voir la source de chaque verdict',
    ]
    contexte.emettre(`Découpe « ${besoin?.brief ?? '?'} » en ${titres.length} histoires.`)
    contexte.fournir('histoires', { titres } satisfies Histoires)
    contexte.terminer()
  },
}

export const architecte: Composant = {
  nom: 'architecte',
  injecte: ['histoires', 'memoire'],
  fournit: ['specification'],
  presentation: { libelle: 'Architecte', role: 'Choisit la composition et écrit la spécification' },
  applique(contexte) {
    const histoires = contexte.lire<Histoires>('histoires')
    const memoire = contexte.lire<Memoire>('memoire')
    const specification: Specification = {
      produit: 'verificateur-allegations',
      constructeurs: ['regles', 'interface', 'tests'],
      criteres: histoires?.titres ?? [],
    }
    contexte.emettre(
      `Retient trois constructeurs parallèles pour le secteur « ${memoire?.secteur ?? '?'} ».`,
    )
    contexte.fournir('specification', specification)
    contexte.terminer()
  },
}

/** Le nom technique reste sans accent ; l'affichage, lui, est du français. */
const LIBELLES_CONSTRUCTEUR: Record<string, string> = {
  regles: 'règles',
  interface: 'interface',
  tests: 'tests',
}

export const constructeur = (quoi: string, technologie?: string): Composant => ({
  nom: `constructeur-${quoi}`,
  injecte: ['specification', 'registre'],
  fournit: [`sortie-${quoi}`],
  presentation: {
    libelle: `Constr. · ${LIBELLES_CONSTRUCTEUR[quoi] ?? quoi}`,
    role: `Fabrique ${quoi} depuis la spécification`,
    ...(technologie !== undefined ? { technologie } : {}),
  },
  applique(contexte) {
    const specification = contexte.lire<Specification>('specification')
    const registre = contexte.lire<{ regles: readonly unknown[] }>('registre')
    contexte.emettre(
      `Travaille depuis ${specification?.criteres.length ?? 0} critères et ${registre?.regles.length ?? 0} règles.`,
    )
    contexte.fournir(`sortie-${quoi}`, { quoi, criteres: specification?.criteres ?? [] })
    contexte.terminer()
  },
})

export const sceptique: Composant = {
  nom: 'sceptique',
  injecte: ['sortie-regles', 'sortie-interface', 'sortie-tests', 'specification'],
  fournit: ['objection'],
  presentation: { libelle: 'Sceptique', role: 'Attaque le résultat avant la porte humaine' },
  applique(contexte) {
    const specification = contexte.lire<Specification>('specification')
    // Le sceptique lit ce que chaque constructeur a réellement produit : une
    // objection qui ne cite rien de précis ne vaut rien.
    const sorties = (['regles', 'interface', 'tests'] as const)
      .map((quoi) => contexte.lire<Sortie>(`sortie-${quoi}`))
      .filter((sortie): sortie is Sortie => sortie !== undefined)
    const objection = {
      cible: 'specification',
      texte: `Les ${sorties.length} sorties couvrent ${specification?.criteres.length ?? 0} critères ; une allégation reformulée visant le même effet ne sera pas détectée.`,
    }
    contexte.emettre(
      'Relève une couverture plus étroite que le nom du produit ne le laisse croire.',
    )
    contexte.fournir('objection', objection)
    contexte.terminer()
  },
}

export const livraison: Composant = {
  nom: 'livraison',
  injecte: ['objection'],
  fournit: ['livrable'],
  presentation: { libelle: 'Livraison', role: 'Monte le produit livré dans le graphe' },
  applique(contexte) {
    const objection = contexte.lire<{ texte: string }>('objection')
    contexte.emettre('Monte le produit livré dans le graphe.')
    contexte.fournir('livrable', { pret: true, objection: objection?.texte })
    contexte.terminer()
  },
}
