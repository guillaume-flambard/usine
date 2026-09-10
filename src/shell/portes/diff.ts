/** Une ligne du diff : conservée, retirée du service, ou ajoutée par la candidate. */
export interface LigneDiff {
  etat: 'garde' | 'retire' | 'ajoute'
  texte: string
}

/**
 * Le diff de deux textes, ligne à ligne.
 *
 * Une plus longue sous-séquence commune, pas une comparaison position par
 * position. La différence n'est pas académique : une invite à laquelle on
 * ajoute une phrase au début verrait, avec une comparaison naïve, TOUTES ses
 * lignes marquées comme changées. Sur un écran qui sert à décider si une
 * consigne mérite de servir, ça reviendrait à cacher le seul changement réel
 * dans un mur de faux changements.
 */
export function diffLignes(avant: string, apres: string): LigneDiff[] {
  const a = avant.split('\n')
  const b = apres.split('\n')

  // Table des longueurs de la plus longue sous-séquence commune.
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }

  const lignes: LigneDiff[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lignes.push({ etat: 'garde', texte: a[i]! })
      i++
      j++
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lignes.push({ etat: 'retire', texte: a[i]! })
      i++
    } else {
      lignes.push({ etat: 'ajoute', texte: b[j]! })
      j++
    }
  }
  while (i < a.length) lignes.push({ etat: 'retire', texte: a[i++]! })
  while (j < b.length) lignes.push({ etat: 'ajoute', texte: b[j++]! })
  return lignes
}

/** Combien de lignes changent réellement. Zéro veut dire : rien à décider. */
export function ampleur(lignes: readonly LigneDiff[]): number {
  return lignes.filter((l) => l.etat !== 'garde').length
}
