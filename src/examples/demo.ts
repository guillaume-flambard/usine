// The demo. With no key, the factory can invent nothing: a model is what
// brings the agents into existence. Rather than a blank screen — or worse, a
// catalogue disguised as emergence — the site replays prepared answers.
//
// They are prepared, not produced now, and the screen says so. Everything else
// in the run is real: the agents are really born, they really talk, and the
// code written here is really evaluated and really executed on what the
// visitor types.

import type { Reasoner, ReasoningRequest } from '../runtime/reasoner'

const turn = (thought: string, actions: readonly unknown[]) => JSON.stringify({ thought, actions })

/** The brief this demo knows how to play. Any other falls flat. */
export const DEMO_BRIEF =
  'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.'

/** The words of a need this demo knows how to play. */
const HINTS = ['allegation', 'sante', 'complement', 'conformite']

const briefRecognised = (context: string): boolean => {
  const brief = (context.split('\n')[0] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return HINTS.filter((hint) => brief.includes(hint)).length >= 2
}

function answer(context: string): string {
  // A question one agent asked another.
  if (context.includes('Question posée par')) {
    if (context.includes('Toi : juriste')) {
      return turn('on m’interroge sur les textes', [
        {
          type: 'say',
          message:
            'Oui : toute allégation tranchée doit citer son texte. Les allégations autorisées relèvent du règlement (UE) 432/2012, les allégations thérapeutiques sont interdites par le règlement (CE) 1924/2006 article 7.',
        },
      ])
    }
    return turn('je réponds au mieux', [
      { type: 'say', message: 'Je m’en tiens à ce que j’ai publié.' },
    ])
  }

  // The final objection, asked by the master about what exists.
  if (context.includes('Agents créés :')) {
    return turn('je cherche la faille', [
      {
        type: 'say',
        message:
          'Le détecteur ne reconnaît que des formulations littérales : une allégation reformulée pour viser le même effet thérapeutique passera au travers. Et il ne distingue pas une négation — « ne traite pas les maladies » sera signalé comme une allégation thérapeutique.',
      },
    ])
  }

  if (context.includes('Toi : master-agent')) {
    // The demo only knows one need. Saying so beats spawning a European
    // lawyer for a syllable counter.
    if (!briefRecognised(context)) {
      return turn('ce besoin n’est pas celui que je sais rejouer', [
        {
          type: 'say',
          message:
            'Les réponses de cette démonstration sont préparées pour un seul besoin. Pour celui-ci, il faut un modèle branché : sans lui, je ne peux rien inventer.',
        },
        { type: 'done', summary: 'Rien à jouer sur ce besoin.' },
      ])
    }
    if (context.includes('existe maintenant')) {
      return turn('le chantier tient debout', [
        { type: 'done', summary: 'Trois agents sont au travail.' },
      ])
    }
    return turn('il faut quelqu’un qui connaisse les textes, quelqu’un qui code, quelqu’un qui doute', [
      {
        type: 'create',
        name: 'juriste',
        label: 'Juriste',
        role: 'Connaît les textes opposables et ne tranche jamais sans les citer',
        mission:
          'Extraire du corpus les motifs interdits et les motifs autorisés, avec leur source, et les publier.',
        needs: ['corpus'],
        provides: ['motifs'],
      },
      {
        type: 'create',
        name: 'artisan',
        label: 'Artisan',
        role: 'Écrit le code du produit et le charge à chaud',
        mission:
          'Écrire un vérificateur qui découpe un texte en allégations et rend, pour chacune, un verdict et sa source, à partir des motifs publiés par le juriste.',
        needs: ['motifs'],
        provides: ['rapport'],
      },
      { type: 'done', summary: 'Deux agents pour commencer.' },
    ])
  }

  if (context.includes('Toi : juriste')) {
    if (context.includes('« motifs » est publié')) {
      return turn('mon travail est fait', [{ type: 'done', summary: 'Motifs publiés.' }])
    }
    return turn('je lis le corpus européen', [
      {
        type: 'publish',
        name: 'motifs',
        text: JSON.stringify({
          interdits: [
            { motif: 'guérit', source: 'Règlement (CE) 1924/2006, art. 7' },
            { motif: 'soigne', source: 'Règlement (CE) 1924/2006, art. 7' },
            { motif: 'traite', source: 'Règlement (CE) 1924/2006, art. 7' },
            { motif: 'prévient la maladie', source: 'Règlement (CE) 1924/2006, art. 7' },
          ],
          autorises: [
            { motif: 'contribue à réduire la fatigue', source: 'Règlement (UE) 432/2012, annexe' },
            {
              motif: 'contribue au fonctionnement normal du système immunitaire',
              source: 'Règlement (UE) 432/2012, annexe',
            },
          ],
        }),
      },
      { type: 'done', summary: 'Motifs et sources publiés.' },
    ])
  }

  if (context.includes('Toi : artisan')) {
    if (context.includes('« rapport » est publié')) {
      return turn('le produit tient', [{ type: 'done', summary: 'Vérificateur livré.' }])
    }
    return turn('je vérifie une règle auprès du juriste, je pose l’écran, puis j’écris', [
      { type: 'ask', to: 'juriste', question: 'Faut-il citer un texte pour chaque verdict ?' },
      {
        type: 'screen',
        markup:
          '<h1>Vérificateur d’allégations</h1>' +
          '<label for="t">Collez un texte marketing</label>' +
          '<textarea id="t" data-field="texte" rows="4"></textarea>' +
          '<button data-invoke="verificateur">Vérifier</button>' +
          '<div data-output="verificateur"></div>',
      },
      { type: 'build', name: 'verificateur', code: CHECKER_CODE },
      {
        type: 'publish',
        name: 'rapport',
        text: 'Vérificateur écrit et chargé : il découpe le texte en allégations et rend un verdict sourcé pour chacune.',
      },
      { type: 'done', summary: 'Vérificateur écrit et chargé à chaud.' },
    ])
  }

  return turn('rien à faire', [{ type: 'done', summary: '' }])
}

/**
 * The code "the artisan" writes. It is really evaluated and really executed on
 * what the visitor types: the only part of the demo that cannot be prerecorded.
 */
const CHECKER_CODE = `(texte) => {
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
 * The demo reasoner. Its origin is not `llm`: the screen must never announce a
 * model that is not running.
 */
export function demoReasoner(delayMs = 500): Reasoner {
  return {
    origin: 'demo',
    async reason(request: ReasoningRequest) {
      // A delay, because a real model takes one: without it the whole graph
      // would be born in a single frame and nothing would be visible.
      await new Promise((next) => setTimeout(next, delayMs))
      return { text: answer(request.context), origin: 'demo' as const }
    },
  }
}
