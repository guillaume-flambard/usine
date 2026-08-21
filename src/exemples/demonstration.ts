// La démonstration. Sans clé, l'usine ne peut rien inventer : un modèle est
// ce qui fait naître les agents. Plutôt qu'un écran vide ou — pire — un
// catalogue déguisé en émergence, le site rejoue des réponses préparées.
//
// Elles sont préparées, pas produites maintenant, et l'écran le dit. Tout le
// reste du run est réel : les agents naissent vraiment, se parlent vraiment,
// et le code écrit ici est vraiment évalué et vraiment exécuté sur ce que le
// visiteur tape.

import type { Demande, Raisonneur } from '../runtime/raisonneur'

const tour = (pensee: string, actions: readonly unknown[]) => JSON.stringify({ pensee, actions })

/** Le brief que la démonstration sait jouer. Les autres retombent à vide. */
export const BRIEF_DE_DEMONSTRATION =
  'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.'

/** Les mots du besoin que la démonstration sait jouer. */
const INDICES = ['allegation', 'sante', 'complement', 'conformite']

const briefReconnu = (contexte: string): boolean => {
  const brief = (contexte.split('\n')[0] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return INDICES.filter((indice) => brief.includes(indice)).length >= 2
}

function reponse(contexte: string): string {
  // Une question posée d'un agent à un autre.
  if (contexte.includes('Question posée par')) {
    if (contexte.includes('Toi : juriste')) {
      return tour('on m’interroge sur les textes', [
        {
          type: 'dire',
          message:
            'Oui : toute allégation tranchée doit citer son texte. Les allégations autorisées relèvent du règlement (UE) 432/2012, les allégations thérapeutiques sont interdites par le règlement (CE) 1924/2006 article 7.',
        },
      ])
    }
    return tour('je réponds au mieux', [
      { type: 'dire', message: 'Je m’en tiens à ce que j’ai publié.' },
    ])
  }

  // L'objection finale, demandée par le maître sur ce qui existe.
  if (contexte.includes('Agents créés :')) {
    return tour('je cherche la faille', [
      {
        type: 'dire',
        message:
          'Le détecteur ne reconnaît que des formulations littérales : une allégation reformulée pour viser le même effet thérapeutique passera au travers. Et il ne distingue pas une négation — « ne traite pas les maladies » sera signalé comme une allégation thérapeutique.',
      },
    ])
  }

  if (contexte.includes('Toi : agent-maitre')) {
    // La démonstration ne sait jouer qu'un besoin. Le dire vaut mieux que
    // faire naître un juriste européen pour un compteur de syllabes.
    if (!briefReconnu(contexte)) {
      return tour('ce besoin n’est pas celui que je sais rejouer', [
        {
          type: 'dire',
          message:
            'Les réponses de cette démonstration sont préparées pour un seul besoin. Pour celui-ci, il faut un modèle branché : sans lui, je ne peux rien inventer.',
        },
        { type: 'terminer', resume: 'Rien à jouer sur ce besoin.' },
      ])
    }
    if (contexte.includes('existe maintenant')) {
      return tour('le chantier tient debout', [
        { type: 'terminer', resume: 'Trois agents sont au travail.' },
      ])
    }
    return tour(
      'il faut quelqu’un qui connaisse les textes, quelqu’un qui code, quelqu’un qui doute',
      [
        {
          type: 'creer',
          nom: 'juriste',
          libelle: 'Juriste',
          role: 'Connaît les textes opposables et ne tranche jamais sans les citer',
          mission:
            'Extraire du corpus les motifs interdits et les motifs autorisés, avec leur source, et les publier.',
          injecte: ['corpus'],
          fournit: ['motifs'],
        },
        {
          type: 'creer',
          nom: 'artisan',
          libelle: 'Artisan',
          role: 'Écrit le code du produit et le charge à chaud',
          mission:
            'Écrire un vérificateur qui découpe un texte en allégations et rend, pour chacune, un verdict et sa source, à partir des motifs publiés par le juriste.',
          injecte: ['motifs'],
          fournit: ['rapport'],
        },
        { type: 'terminer', resume: 'Deux agents pour commencer.' },
      ],
    )
  }

  if (contexte.includes('Toi : juriste')) {
    if (contexte.includes('« motifs » est publié')) {
      return tour('mon travail est fait', [{ type: 'terminer', resume: 'Motifs publiés.' }])
    }
    return tour('je lis le corpus européen', [
      {
        type: 'publier',
        nom: 'motifs',
        texte: JSON.stringify({
          interdits: [
            { motif: 'guérit', source: 'Règlement (CE) 1924/2006, art. 7' },
            { motif: 'soigne', source: 'Règlement (CE) 1924/2006, art. 7' },
            { motif: 'traite', source: 'Règlement (CE) 1924/2006, art. 7' },
            { motif: 'prévient la maladie', source: 'Règlement (CE) 1924/2006, art. 7' },
          ],
          autorises: [
            {
              motif: 'contribue à réduire la fatigue',
              source: 'Règlement (UE) 432/2012, annexe',
            },
            {
              motif: 'contribue au fonctionnement normal du système immunitaire',
              source: 'Règlement (UE) 432/2012, annexe',
            },
          ],
        }),
      },
      { type: 'terminer', resume: 'Motifs et sources publiés.' },
    ])
  }

  if (contexte.includes('Toi : artisan')) {
    if (contexte.includes('« rapport » est publié')) {
      return tour('le produit tient', [{ type: 'terminer', resume: 'Vérificateur livré.' }])
    }
    return tour('je vérifie une règle auprès du juriste, puis j’écris', [
      { type: 'demander', a: 'juriste', question: 'Faut-il citer un texte pour chaque verdict ?' },
      {
        type: 'fabriquer',
        nom: 'verificateur',
        fournit: 'verificateur',
        code: CODE_DU_VERIFICATEUR,
      },
      {
        type: 'publier',
        nom: 'rapport',
        texte:
          'Vérificateur écrit et chargé : il découpe le texte en allégations et rend un verdict sourcé pour chacune.',
      },
      { type: 'terminer', resume: 'Vérificateur écrit et chargé à chaud.' },
    ])
  }

  return tour('rien à faire', [{ type: 'terminer', resume: '' }])
}

/**
 * Le code que « l'artisan » écrit. Il est réellement évalué et réellement
 * exécuté sur ce que le visiteur tape : c'est la seule partie de la
 * démonstration qui ne peut pas être préenregistrée.
 */
const CODE_DU_VERIFICATEUR = `(texte) => {
  const INTERDITS = [
    { motif: 'guérit', source: 'Règlement (CE) 1924/2006, art. 7' },
    { motif: 'soigne', source: 'Règlement (CE) 1924/2006, art. 7' },
    { motif: 'traite', source: 'Règlement (CE) 1924/2006, art. 7' },
    { motif: 'prévient la maladie', source: 'Règlement (CE) 1924/2006, art. 7' },
  ]
  const AUTORISES = [
    { motif: 'contribue à réduire la fatigue', source: 'Règlement (UE) 432/2012, annexe' },
    { motif: 'contribue au fonctionnement normal du système immunitaire', source: 'Règlement (UE) 432/2012, annexe' },
  ]
  const sansAccent = (s) => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
  const trouve = (phrase, regles) =>
    regles.find((r) => new RegExp('(^|[^\\\\p{L}])' + sansAccent(r.motif).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '($|[^\\\\p{L}])', 'u').test(sansAccent(phrase)))
  return String(texte)
    .split(/(?<=[.;!?])\\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((phrase) => {
      const interdit = trouve(phrase, INTERDITS)
      if (interdit) return { allegation: phrase, verdict: 'interdit', source: interdit.source }
      const autorise = trouve(phrase, AUTORISES)
      if (autorise) return { allegation: phrase, verdict: 'autorisé', source: autorise.source }
      return { allegation: phrase, verdict: 'à vérifier', source: 'aucune règle ne couvre cette formulation' }
    })
}`

/**
 * Le raisonneur de démonstration. Son origine n'est pas `llm` : l'écran ne
 * doit jamais annoncer un modèle qui ne tourne pas.
 */
export function raisonneurDeDemonstration(delaiMs = 500): Raisonneur {
  return {
    origine: 'demonstration',
    async raisonner(demande: Demande) {
      // Un délai, parce qu'un vrai modèle en met : sans lui, le graphe
      // entier naîtrait en une image et rien ne se verrait.
      await new Promise((suite) => setTimeout(suite, delaiMs))
      return { texte: reponse(demande.contexte), origine: 'demonstration' as const }
    },
  }
}
