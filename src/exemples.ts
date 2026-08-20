// Des briefs pour démarrer, rien de plus. Ce ne sont pas des scénarios : ils
// ne décrivent aucun graphe, aucun casting, aucune étape. Ils remplissent le
// champ, et l'usine en fait ce qu'elle veut.
//
// Le champ reste libre : un brief écrit à la main donne un autre graphe.

export interface Exemple {
  cle: string
  titre: string
  brief: string
}

export const EXEMPLES: readonly Exemple[] = [
  {
    cle: 'allegations',
    titre: 'Allégations santé',
    brief:
      'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.',
  },
  {
    cle: 'publicite',
    titre: 'Publicité trompeuse',
    brief:
      'Un outil qui repère les allégations publicitaires trompeuses dans les copies de marques, avec un écran pour coller le texte.',
  },
  {
    cle: 'juridique',
    titre: 'Relecture juridique',
    brief:
      'Une relecture juridique stricte de mes textes de compléments alimentaires : formulations négatives comprises, des tests, et une API pour l’automatiser.',
  },
]

export const briefParDefaut = (): string => EXEMPLES[0]?.brief ?? ''

export const CONTACT = 'g.flambard@gmail.com'
