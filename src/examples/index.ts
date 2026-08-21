// Briefs to start from, nothing more. These are not scenarios: they describe
// no graph, no casting, no step. They fill the field, and the factory makes of
// them whatever it wants.
//
// The field stays free: a hand-written brief gives another graph.

export interface Example {
  key: string
  title: string
  brief: string
}

export const EXAMPLES: readonly Example[] = [
  {
    key: 'health-claims',
    title: 'Allégations santé',
    brief:
      'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.',
  },
  {
    key: 'advertising',
    title: 'Publicité trompeuse',
    brief:
      'Un outil qui repère les allégations publicitaires trompeuses dans les copies de marques, avec un écran pour coller le texte.',
  },
  {
    key: 'legal-review',
    title: 'Relecture juridique',
    brief:
      'Une relecture juridique stricte de mes textes de compléments alimentaires : formulations négatives comprises, des tests, et une API pour l’automatiser.',
  },
]

export const CONTACT = 'g.flambard@gmail.com'
