// Spike Q1 / Q9 — Cordis dans le bundle navigateur.
// Vérifie : effet réversible, cascade, coeffect réactif, génération de composant à l'exécution.
import { Context, FiberState } from 'cordis'

interface Composant {
  name: string
  inject?: string[]
  provide?: string[]
  apply(c: Context): void
}

export interface Check {
  id: string
  label: string
  ok: boolean
  detail: string
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const nomEtat = (state: FiberState): string =>
  ({
    [FiberState.PENDING]: 'PENDING',
    [FiberState.LOADING]: 'LOADING',
    [FiberState.ACTIVE]: 'ACTIVE',
    [FiberState.FAILED]: 'FAILED',
    [FiberState.DISPOSED]: 'DISPOSED',
    [FiberState.UNLOADING]: 'UNLOADING',
  })[state] ?? String(state)

export async function runExperiment(): Promise<Check[]> {
  const checks: Check[] = []
  const add = (id: string, label: string, ok: boolean, detail: string) =>
    checks.push({ id, label, ok, detail })

  const ctx = new Context()

  // --- 1. Effet réversible, teardown en ordre inverse -----------------------
  const trace: string[] = []
  const outilA = {
    name: 'outil-A',
    apply(c: Context) {
      c.effect(() => {
        trace.push('ouvre:1')
        return () => trace.push('ferme:1')
      }, 'ressource-1')
      c.effect(() => {
        trace.push('ouvre:2')
        return () => trace.push('ferme:2')
      }, 'ressource-2')
    },
  }
  const fiberA = await ctx.plugin(outilA)
  const ouvert = trace.join(',') === 'ouvre:1,ouvre:2'
  add('1a', 'Un composant se charge et installe ses effets', ouvert, trace.join(' → '))

  await fiberA.dispose()
  const inverse = trace.join(',') === 'ouvre:1,ouvre:2,ferme:2,ferme:1'
  add('1b', 'dispose() annule les effets en ordre inverse', inverse, trace.join(' → '))

  // --- 2. Cascade : décharger le maître libère l'enfant ---------------------
  const cascade: string[] = []
  const enfant = {
    name: 'enfant',
    apply(c: Context) {
      c.effect(() => {
        cascade.push('enfant:ouvre')
        return () => cascade.push('enfant:ferme')
      }, 'enfant')
    },
  }
  const maitre = {
    name: 'maitre',
    apply(c: Context) {
      c.plugin(enfant)
    },
  }
  const fiberM = await ctx.plugin(maitre)
  await tick()
  const enfantVivant = cascade.includes('enfant:ouvre')
  add('2a', 'Le maître spawn un composant enfant', enfantVivant, cascade.join(' → '))

  await fiberM.dispose()
  await tick()
  const enfantLibere = cascade.includes('enfant:ferme')
  add('2b', 'Décharger le maître cascade sur son enfant', enfantLibere, cascade.join(' → '))

  // --- 3. Coeffect réactif : activation / désactivation ---------------------
  let activations = 0
  let desactivations = 0
  const outilRegistre = {
    name: 'outil-registre',
    provide: ['registre'],
    apply(c: Context) {
      c.provide('registre', { verifie: (t: string) => t.includes('guérit') })
    },
  }
  const agentVerif = {
    name: 'agent-verif',
    inject: ['registre'],
    apply(c: Context) {
      activations++
      c.effect(
        () => () => {
          desactivations++
        },
        'agent-verif',
      )
    },
  }

  const fiberAgent = await ctx.plugin(agentVerif)
  await tick()
  const enAttente = activations === 0 && fiberAgent.state === FiberState.PENDING
  add(
    '3a',
    "L'agent reste inactif tant que sa dépendance manque",
    enAttente,
    `activations=${activations} state=${nomEtat(fiberAgent.state)}`,
  )

  const fiberOutil = await ctx.plugin(outilRegistre)
  await tick()
  const active = activations === 1
  add(
    '3b',
    "L'agent s'active tout seul quand la dépendance arrive",
    active,
    `activations=${activations}`,
  )

  await fiberOutil.dispose()
  await tick()
  const desactive = desactivations === 1
  add(
    '3c',
    "L'agent se désactive tout seul quand la dépendance part",
    desactive,
    `desactivations=${desactivations}`,
  )

  const fiberOutil2 = await ctx.plugin(outilRegistre)
  await tick()
  const reactive = activations === 2
  add(
    '3d',
    "L'agent se réactive quand la dépendance revient (HMR à chaud)",
    reactive,
    `activations=${activations}`,
  )

  // --- 4. Génération d'un composant à l'exécution (FR-052) ------------------
  // La spec est produite « par un agent amont » ; le composant n'existe pas avant le run.
  const spec = { nom: 'agent-genere', message: 'fabriqué pendant le run' }
  let genereActif = false
  let source = ''
  let genereOk = false
  let genereDetail = ''
  try {
    source = `return {
      name: ${JSON.stringify(spec.nom)},
      inject: ['registre'],
      apply(c) {
        c.effect(() => {
          rapporte(true, ${JSON.stringify(spec.message)});
          return () => rapporte(false, 'retiré');
        });
      },
    }`
    const fabrique = new Function(
      'rapporte',
      source,
    ) as (r: (actif: boolean, m: string) => void) => Composant
    const composantGenere = fabrique((actif, m) => {
      genereActif = actif
      genereDetail = m
    })
    const fiberGenere = await ctx.plugin(composantGenere)
    await tick()
    genereOk = genereActif
    add(
      '4a',
      "Un composant fabriqué à l'exécution se charge et tourne",
      genereOk,
      genereDetail || 'aucun effet observé',
    )
    await fiberGenere.dispose()
    await tick()
    add(
      '4b',
      'Le composant fabriqué se retire proprement',
      genereActif === false,
      genereDetail,
    )
  } catch (error) {
    add('4a', "Un composant fabriqué à l'exécution se charge et tourne", false, String(error))
    add('4b', 'Le composant fabriqué se retire proprement', false, 'non atteint')
  }

  // --- 4bis. Génération SANS eval, par composition de primitives -------------
  // Même promesse (le composant n'existait pas avant le run) sans dépendre de 'unsafe-eval'.
  interface SpecComposant {
    nom: string
    dependances: string[]
    etapes: Array<{ operation: 'annonce' | 'derive'; valeur: string }>
  }
  const primitives = {
    annonce: (valeur: string, journal: string[]) => () => {
      journal.push(`annonce:${valeur}`)
      return () => journal.push(`annonce:${valeur}:retire`)
    },
    derive: (valeur: string, journal: string[]) => () => {
      journal.push(`derive:${valeur.toUpperCase()}`)
      return () => journal.push(`derive:${valeur.toUpperCase()}:retire`)
    },
  }
  const compile = (spec: SpecComposant, journal: string[]): Composant => ({
    name: spec.nom,
    inject: spec.dependances,
    apply(c: Context) {
      for (const etape of spec.etapes) {
        c.effect(primitives[etape.operation](etape.valeur, journal), etape.operation)
      }
    },
  })

  const journalCompose: string[] = []
  const specVenueDunAgent: SpecComposant = {
    nom: 'agent-compose',
    dependances: ['registre'],
    etapes: [
      { operation: 'annonce', valeur: 'allegations' },
      { operation: 'derive', valeur: 'verdict' },
    ],
  }
  const fiberCompose = await ctx.plugin(compile(specVenueDunAgent, journalCompose))
  await tick()
  add(
    '4c',
    'Composant fabriqué par composition, sans eval, se charge et tourne',
    journalCompose.join(',') === 'annonce:allegations,derive:VERDICT',
    journalCompose.join(' → '),
  )
  await fiberCompose.dispose()
  await tick()
  add(
    '4d',
    'Composant composé se retire proprement',
    journalCompose.length === 4,
    journalCompose.join(' → '),
  )

  // --- 5. Introspection de la topologie (FR-012) ----------------------------
  const taille = ctx.registry.size
  add(
    '5a',
    'Le runtime expose sa topologie (registry.size)',
    typeof taille === 'number',
    `registry.size=${taille}, compteur=${ctx.registry.counter}`,
  )

  await fiberOutil2.dispose()
  await fiberAgent.dispose()

  return checks
}
