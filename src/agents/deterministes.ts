// Les agents du mode par défaut. Leur jugement est écrit à la main — mais
// leur existence, leur câblage et leur travail sont réels : ils lisent une
// entrée, produisent une sortie, la publient, et déclenchent l'aval.

import type { Composant } from '../runtime/contrat'
import {
  fabriqueParComposition,
  type Fabrique,
  type SpecificationComposant,
} from '../runtime/fabrique'

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
  fournit: ['besoin', 'memoire', 'fabrique'],
  presentation: { libelle: 'Agent maître', role: 'Ouvre le run et tient la mémoire du secteur' },
  applique(contexte) {
    const memoire: Memoire = {
      secteur: besoin.secteur,
      decisions: [
        `Brief retenu : ${besoin.brief}`,
        'Mode déterministe : les agents composent et fabriquent réellement.',
        'La fabrication passe par composition de primitives, sans évaluation de code.',
      ],
    }
    contexte.emettre(`Constitue sa mémoire sur le secteur : ${besoin.secteur}.`)
    contexte.fournir('besoin', besoin)
    contexte.fournir('memoire', memoire)
    // La fabrique est un coeffect : aucun agent ne la construit lui-même,
    // et le graphe montre qui en dépend.
    contexte.fournir('fabrique', fabriqueParComposition())
    contexte.publierArtefact({
      titre: 'Mémoire de run',
      corps: [`Secteur : ${memoire.secteur}`, '', ...memoire.decisions.map((d) => `— ${d}`)].join(
        '\n',
      ),
      decouleDe: 'le brief',
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
    contexte.publierArtefact({
      titre: 'Découpage en histoires',
      corps: titres.map((titre, index) => `${index + 1}. ${titre}`).join('\n'),
      decouleDe: 'le besoin',
    })
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
    contexte.publierArtefact({
      titre: 'Décision de composition',
      corps: [
        `Produit visé : ${specification.produit}`,
        `Constructeurs en parallèle : ${specification.constructeurs.join(', ')}`,
        '',
        'Critères retenus :',
        ...specification.criteres.map((critere) => `— ${critere}`),
      ].join('\n'),
      decouleDe: 'les histoires et la mémoire de run',
    })
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
    contexte.publierArtefact({
      titre: `Sortie du constructeur ${LIBELLES_CONSTRUCTEUR[quoi] ?? quoi}`,
      corps: [
        `Couvre ${specification?.criteres.length ?? 0} critères.`,
        '',
        ...(specification?.criteres ?? []).map((critere) => `— ${critere}`),
      ].join('\n'),
      decouleDe: "la décision de composition de l'architecte",
    })
    contexte.terminer()
  },
})

/**
 * Le constructeur qui fabrique vraiment une pièce : il écrit une
 * spécification de composant, la passe à la fabrique, et charge le résultat.
 * C'est ce qui sépare une orchestration d'une usine.
 */
export const constructeurFabricant: Composant = {
  nom: 'constructeur-produit',
  injecte: ['specification', 'registre', 'fabrique'],
  fournit: ['sortie-produit'],
  presentation: {
    libelle: 'Constr. · produit',
    role: 'Écrit une spécification de composant et fabrique la pièce',
  },
  applique(contexte) {
    const specification = contexte.lire<Specification>('specification')
    const registre = contexte.lire<{ regles: readonly unknown[] }>('registre')
    const fabrique = contexte.lire<Fabrique>('fabrique')
    if (fabrique === undefined) return

    const aFabriquer: SpecificationComposant = {
      nom: 'verificateur-allegations',
      libelle: 'Vérificateur',
      role: 'Classe chaque allégation et cite sa source',
      injecte: ['registre'],
      fournit: ['verificateur'],
      etapes: ['decouper-allegations', 'classer-par-regles', 'exiger-une-source'],
    }

    const resultat = fabrique.compiler(aFabriquer)
    if (!resultat.ok) {
      contexte.emettre(`Fabrication refusée : ${resultat.echec.message}`)
      contexte.fournir('sortie-produit', { fabrique: false })
      contexte.terminer()
      return
    }

    contexte.emettre(
      `Fabrique « ${aFabriquer.nom} » : ${aFabriquer.etapes.length} primitives, ${registre?.regles.length ?? 0} règles.`,
    )
    void contexte.charger(resultat.piece.composant, {
      specification: [
        `nom : ${aFabriquer.nom}`,
        `rôle : ${aFabriquer.role}`,
        `consomme : ${aFabriquer.injecte.join(', ')}`,
        `publie : ${aFabriquer.fournit.join(', ')}`,
        `étapes : ${aFabriquer.etapes.join(' → ')}`,
        '',
        `critères repris de l'architecte : ${(specification?.criteres ?? []).length}`,
      ].join('\n'),
      source: resultat.piece.source,
      voie: fabrique.voie,
    })

    contexte.publierArtefact({
      titre: 'Spécification de la pièce fabriquée',
      corps: [
        `La pièce « ${aFabriquer.nom} » n'existait pas avant ce run.`,
        `Elle enchaîne : ${aFabriquer.etapes.join(' → ')}.`,
        '',
        "Aucune chaîne de code n'est évaluée : les primitives sont assemblées.",
      ].join('\n'),
      decouleDe: "la décision de composition de l'architecte",
    })
    contexte.fournir('sortie-produit', { fabrique: true })
    contexte.terminer()
  },
}

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
    contexte.publierArtefact({
      titre: 'Objection',
      corps: objection.texte,
      decouleDe: `l'artefact « ${objection.cible} »`,
    })
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
