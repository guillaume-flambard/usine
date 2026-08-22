// Ce que le chantier a déjà établi.
//
// Les coeffets font circuler ce qui est *structurel* : un agent déclare un nom,
// un autre le lit. Ils ne font pas circuler ce qui est **su**. Un fait établi
// au premier tour n'a aucun chemin vers un agent né au troisième — il faudrait
// que celui-ci ait deviné le nom à déclarer, avant d'exister.
//
// Le rappel est ce chemin. Il est local au run et sans réseau : une mémoire qui
// coûterait un aller-retour par tour ajouterait une seconde là où le produit se
// bat pour son premier écran. Le service, lui, conserve — mais il conserve un
// flux d'événements qui porte déjà ces faits, donc rien n'est écrit deux fois.

/** Un fait, et qui l'a établi. Sans auteur, il n'est pas vérifiable. */
export interface Fact {
  author: string
  text: string
}

const WORD = /[\wàâäéèêëîïôöùûüç'-]+/gu

/** Les mots qui portent du sens. Les plus courts n'en portent pas. */
const words = (text: string): string[] =>
  (text.toLowerCase().match(WORD) ?? []).filter((word) => word.length > 3)

export interface Recall {
  remember(fact: Fact): void
  /** Les faits les plus proches d'une question, du plus proche au moins. */
  recall(question: string, limit?: number): readonly Fact[]
  readonly size: number
}

/**
 * Un rappel par recouvrement de mots.
 *
 * Lexical, et dit comme tel : « allégation » retrouve « allégations », pas
 * « claim ». C'est une approximation, et c'est celle qui coûte zéro milliseconde
 * et zéro dépendance. Une empreinte sémantique se substituerait ici sans que
 * l'appelant change.
 */
export function createRecall(capacity = 200): Recall {
  const facts: { fact: Fact; terms: Set<string> }[] = []

  return {
    get size() {
      return facts.length
    },
    remember(fact) {
      const terms = new Set(words(fact.text))
      if (terms.size === 0) return
      // Un même fait republié ne compte pas deux fois : sinon un agent
      // bavard occuperait le rappel de tous les autres.
      if (facts.some((held) => held.fact.text === fact.text)) return
      facts.push({ fact, terms })
      if (facts.length > capacity) facts.shift()
    },
    recall(question, limit = 3) {
      const asked = new Set(words(question))
      if (asked.size === 0) return []

      return facts
        .map((held) => {
          let shared = 0
          for (const term of asked) if (held.terms.has(term)) shared += 1
          return { fact: held.fact, score: shared / asked.size }
        })
        // Un seuil, plutôt que les meilleurs quoi qu'il arrive : servir le
        // fait le moins mauvais remplirait le contexte de bruit, et un agent
        // le croirait pertinent parce qu'on le lui a servi.
        .filter((scored) => scored.score >= 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((scored) => scored.fact)
    },
  }
}
