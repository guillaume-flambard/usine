// Hydrater un kernel vivant depuis un préfixe de flux (AD-49).
//
// Ce test tourne en node, via `spawnVmWorker` : le fil isolé y est un `node:vm`,
// pas un vrai Worker, mais il évalue le vrai code — donc ce qu'un modèle a
// écrit tourne pour de bon. Ce que node ne prouve pas (l'arrêt d'une boucle
// folle) est prouvé dans les suites navigateur.
//
// Chaque test couvre une ligne de la matrice d'entrées/sorties de la story.
import { describe, expect, it } from 'vitest'
import { hydrateKernel } from '../fork'
import { liveBehaviours } from '../../orchestration/factory'
import { behaviourComponent, behaviourKey, behaviourName } from '../behaviour'
import { spawnVmWorker } from '../../agents/__tests__/vm-worker'
import { initialState, reduce } from '../../state/reducer'
import type { SpawnWorker } from '../isolate'
import type { RunArchive } from '../replay'
import type { RunEvent } from '../../runtime/events'
import type { Component, ComponentContext, ComponentId } from '../../runtime/contract'

const ALPHA_V1 = '(input) => "alpha-v1:" + input'
const ALPHA_V2 = '(input) => "alpha-v2:" + input'
const ALPHA_V3 = '(input) => "alpha-v3:" + input'
const BETA_V1 = '(input) => "beta:" + input'
const BROKEN = 'this is (((not a function'

const MASTER = 'master#0' as ComponentId
const DISPLAY = { role: 'comportement de test' }
const buildOf = (source: string) =>
  ({ specification: 'spec', source, route: 'evaluation' as const })

/** Fabrique un flux ordonné par `sequence`, un `at` élapsé qui suit l'index. */
function stream(...factories: ((seq: number) => Omit<RunEvent, 'sequence' | 'at'>)[]): RunEvent[] {
  return factories.map((make, index) => {
    const seq = index + 1
    return { ...make(seq), sequence: seq, at: index } as RunEvent
  })
}

const created = (id: string, name: string, provides: readonly string[]) =>
  () =>
    ({
      type: 'component-created' as const,
      id: id as ComponentId,
      name,
      display: DISPLAY,
      needs: [],
      provides,
      parent: MASTER,
    })
const built = (id: string, source: string) =>
  () =>
    ({ type: 'component-built' as const, id: id as ComponentId, parent: MASTER, build: buildOf(source) })
const activated = (id: string) => () => ({ type: 'component-activated' as const, id: id as ComponentId })
const replaced = (id: string, previous: string, name: string) =>
  () =>
    ({
      type: 'component-replaced' as const,
      id: id as ComponentId,
      previous: previous as ComponentId,
      name,
    })
const released = (id: string) => () => ({ type: 'component-released' as const, id: id as ComponentId })

/**
 * Un run où deux comportements naissent (alpha, beta), alpha est remplacé
 * (v1→v2), puis beta est relâché. Les points N notables :
 *   N=6  : alpha v1 + beta v1 vivants
 *   N=11 : alpha v2 + beta v1 vivants
 *   N=12 : alpha v2 seul (beta relâché)
 */
function scenario(): RunArchive {
  return {
    version: 1,
    brief: 'un run à forker',
    events: stream(
      created('alpha#1', 'alpha-v1', [behaviourKey('alpha')]), // 1
      built('alpha#1', ALPHA_V1), // 2
      activated('alpha#1'), // 3
      created('beta#1', 'beta-v1', [behaviourKey('beta')]), // 4
      built('beta#1', BETA_V1), // 5
      activated('beta#1'), // 6
      released('alpha#1'), // 7
      created('alpha#2', 'alpha-v2', [behaviourKey('alpha')]), // 8
      built('alpha#2', ALPHA_V2), // 9
      activated('alpha#2'), // 10
      replaced('alpha#2', 'alpha#1', 'alpha-v2'), // 11
      released('beta#1'), // 12
    ),
  }
}

/** Les comportements vivants du modèle de lecture réduit sur `[1..stopAt]`. */
function reducedLive(events: readonly RunEvent[], stopAt?: number): string[] {
  const prefix = stopAt === undefined ? events : events.filter((event) => event.sequence <= stopAt)
  const view = prefix.reduce(reduce, initialState()).view
  return view.nodes
    .filter((node) => node.state !== 'released' && node.state !== 'failed')
    .flatMap((node) => {
      const name = node.provides.map(behaviourName).find((each) => each !== undefined)
      if (name === undefined) return []
      const version = Number(node.name.slice(node.name.lastIndexOf('-v') + 2))
      return [`${name}@v${version}`]
    })
    .sort()
}

/** La même vue, tirée des comportements vivants d'un kernel. */
const kernelLive = (behaviours: readonly { name: string; version: number }[]): string[] =>
  behaviours.map((behaviour) => `${behaviour.name}@v${behaviour.version}`).sort()

describe('hydrateKernel — un kernel vivant depuis un préfixe (AD-49)', () => {
  it('à N, égale les comportements vivants du modèle de lecture réduit sur [1..N]', async () => {
    const archive = scenario()
    const { kernel, behaviours } = await hydrateKernel(archive, {
      stopAt: 12,
      spawnWorker: spawnVmWorker,
    })

    // AD-45 : re-réduire le préfixe donne le même ensemble vivant.
    expect(kernelLive(behaviours)).toEqual(reducedLive(archive.events, 12))
    expect(kernelLive(behaviours)).toEqual(['alpha@v2'])
    // `liveBehaviours(kernel)` lit la même chose que le retour de la fonction.
    expect(kernelLive(liveBehaviours(kernel))).toEqual(['alpha@v2'])
    await kernel.releaseAll()
  })

  it('hydrate un point intermédiaire : alpha v1 et beta v1 vivants à N=6', async () => {
    const archive = scenario()
    const { kernel, behaviours } = await hydrateKernel(archive, {
      stopAt: 6,
      spawnWorker: spawnVmWorker,
    })

    expect(kernelLive(behaviours)).toEqual(reducedLive(archive.events, 6))
    expect(kernelLive(behaviours)).toEqual(['alpha@v1', 'beta@v1'])
    await kernel.releaseAll()
  })

  it('compte la version à travers deux remplacements : v1→v2→v3 hydrate en v3', async () => {
    // Le comptage est le chemin le plus sujet à l'off-by-one : deux
    // remplacements successifs doivent donner v3, pas v2 ni v4.
    const archive: RunArchive = {
      version: 1,
      brief: 'alpha remplacé deux fois',
      events: stream(
        created('alpha#1', 'alpha-v1', [behaviourKey('alpha')]),
        built('alpha#1', ALPHA_V1),
        activated('alpha#1'),
        released('alpha#1'),
        created('alpha#2', 'alpha-v2', [behaviourKey('alpha')]),
        built('alpha#2', ALPHA_V2),
        activated('alpha#2'),
        replaced('alpha#2', 'alpha#1', 'alpha-v2'),
        released('alpha#2'),
        created('alpha#3', 'alpha-v3', [behaviourKey('alpha')]),
        built('alpha#3', ALPHA_V3),
        activated('alpha#3'),
        replaced('alpha#3', 'alpha#2', 'alpha-v3'),
      ),
    }
    const { kernel, behaviours } = await hydrateKernel(archive, { spawnWorker: spawnVmWorker })

    expect(kernelLive(behaviours)).toEqual(reducedLive(archive.events))
    const alpha = behaviours.find((behaviour) => behaviour.name === 'alpha')
    expect(alpha?.version).toBe(3)
    const answer = await alpha?.call('salut')
    expect(answer?.output).toBe('alpha-v3:salut')
    await kernel.releaseAll()
  })

  it('un comportement relâché avant N est absent du kernel hydraté', async () => {
    const archive = scenario()
    const { kernel, behaviours } = await hydrateKernel(archive, {
      stopAt: 12,
      spawnWorker: spawnVmWorker,
    })

    // beta a été relâché en seq 12 ; alpha#1 en seq 7 (remplacement).
    expect(behaviours.map((behaviour) => behaviour.name)).not.toContain('beta')
    expect(kernelLive(behaviours)).toEqual(['alpha@v2'])
    await kernel.releaseAll()
  })

  it('sans stopAt, hydrate à la fin du flux', async () => {
    const archive = scenario()
    const { kernel, behaviours } = await hydrateKernel(archive, { spawnWorker: spawnVmWorker })

    expect(kernelLive(behaviours)).toEqual(reducedLive(archive.events))
    expect(kernelLive(behaviours)).toEqual(['alpha@v2'])
    await kernel.releaseAll()
  })

  it('la version hydratée répond avec son propre code', async () => {
    const archive = scenario()
    const { kernel, behaviours } = await hydrateKernel(archive, {
      stopAt: 12,
      spawnWorker: spawnVmWorker,
    })
    const alpha = behaviours.find((behaviour) => behaviour.name === 'alpha')

    const answer = await alpha?.call('salut')
    expect(answer?.output).toBe('alpha-v2:salut')
    await kernel.releaseAll()
  })

  it('sur un kernel hydraté, un remplacement qui compile émet component-replaced et la nouvelle version répond', async () => {
    const archive = scenario()
    const { kernel } = await hydrateKernel(archive, { stopAt: 12, spawnWorker: spawnVmWorker })

    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))

    const alphaId = kernel
      .inspect()
      .components.find((node) => node.provides.includes(behaviourKey('alpha')))?.id
    expect(alphaId).toBeDefined()

    const made = await behaviourComponent(
      { name: 'alpha', version: 3, code: ALPHA_V3, author: 'test' },
      spawnVmWorker,
    )
    if (!('component' in made)) throw new Error('le remplacement aurait dû compiler')
    const fresh = await kernel.replace(alphaId as ComponentId, made.component)

    expect(fresh).toBeDefined()
    expect(events.some((event) => event.type === 'component-replaced')).toBe(true)

    const alpha = liveBehaviours(kernel).find((behaviour) => behaviour.name === 'alpha')
    expect(alpha?.version).toBe(3)
    const answer = await alpha?.call('salut')
    expect(answer?.output).toBe('alpha-v3:salut')
    await kernel.releaseAll()
  })

  it('un remplacement qui ne compile pas est refusé avant le kernel ; la version précédente sert encore', async () => {
    const archive = scenario()
    const { kernel } = await hydrateKernel(archive, { stopAt: 12, spawnWorker: spawnVmWorker })

    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))

    // Le code refusé ne devient jamais un composant : rien n'atteint `replace`.
    const made = await behaviourComponent(
      { name: 'alpha', version: 3, code: BROKEN, author: 'test' },
      spawnVmWorker,
    )
    expect('failure' in made).toBe(true)

    // Aucun remplacement n'a eu lieu, et la version précédente répond toujours.
    expect(events.some((event) => event.type === 'component-replaced')).toBe(false)
    const alpha = liveBehaviours(kernel).find((behaviour) => behaviour.name === 'alpha')
    const answer = await alpha?.call('salut')
    expect(answer?.output).toBe('alpha-v2:salut')
    await kernel.releaseAll()
  })

  it('un remplacement qui tombe à l’activation roule en arrière : pas de component-replaced, le slot reste tenu (AD-31)', async () => {
    const archive = scenario()
    const { kernel } = await hydrateKernel(archive, { stopAt: 12, spawnWorker: spawnVmWorker })

    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))

    const alphaId = kernel
      .inspect()
      .components.find((node) => node.provides.includes(behaviourKey('alpha')))?.id as ComponentId

    // Un composant qui compile mais tombe à `apply` : c'est le seul échec qui
    // exerce vraiment le retour arrière du kernel (un code qui ne compile pas
    // n'atteint jamais `replace`).
    const failing: Component = {
      name: 'alpha-fail',
      provides: [behaviourKey('alpha')],
      display: { role: 'tombe' },
      apply(_context: ComponentContext) {
        throw new Error('boom')
      },
    }
    const fresh = await kernel.replace(alphaId, failing)

    // Le remplacement n'a pas pris : aucun component-replaced, et le nom reste
    // fourni — le kernel a restauré la version précédente (AD-31).
    expect(fresh).toBeUndefined()
    expect(events.some((event) => event.type === 'component-replaced')).toBe(false)
    expect(kernel.providedNames()).toContain(behaviourKey('alpha'))
    await kernel.releaseAll()
  })

  it('stopAt avant tout composant : kernel vide, behaviours vides', async () => {
    const archive = scenario()
    const { kernel, behaviours } = await hydrateKernel(archive, {
      stopAt: 0,
      spawnWorker: spawnVmWorker,
    })

    expect(behaviours).toEqual([])
    expect(liveBehaviours(kernel)).toEqual([])
    expect(reducedLive(archive.events, 0)).toEqual([])
    await kernel.releaseAll()
  })

  it('rejette quand un comportement vivant à N n’a aucune source dans le flux (Block If)', async () => {
    // gamma est créé avec un provides `behaviour:*` mais jamais construit : rien
    // à recompiler. On refuse, on ne devine pas.
    const archive: RunArchive = {
      version: 1,
      brief: 'un comportement sans source',
      events: stream(
        created('gamma#1', 'gamma-v1', [behaviourKey('gamma')]),
        activated('gamma#1'),
      ),
    }

    await expect(hydrateKernel(archive, { spawnWorker: spawnVmWorker })).rejects.toThrow(
      /behaviour source missing in stream/,
    )
  })

  it('rejette avant toute création quand un orphelin côtoie un comportement valide', async () => {
    // delta est recompilable, gamma non. Le rejet doit précéder toute
    // matérialisation : aucun isolat n'est né, donc rien à démonter.
    const archive: RunArchive = {
      version: 1,
      brief: 'un valide et un orphelin',
      events: stream(
        created('delta#1', 'delta-v1', [behaviourKey('delta')]),
        built('delta#1', ALPHA_V1),
        activated('delta#1'),
        created('gamma#1', 'gamma-v1', [behaviourKey('gamma')]),
        activated('gamma#1'),
      ),
    }
    // Un espion sur la fabrique de fils : s'il est appelé, un isolat a été
    // créé — donc le rejet ne serait pas survenu avant la boucle de chargement.
    let spawns = 0
    const spy: SpawnWorker = () => {
      spawns += 1
      return spawnVmWorker()
    }

    await expect(hydrateKernel(archive, { spawnWorker: spy })).rejects.toThrow(
      /behaviour source missing in stream/,
    )
    // Rien n'a été matérialisé, alors même qu'un comportement était valide.
    expect(spawns).toBe(0)
  })

  it('rejette et démonte le kernel quand une source présente refuse de recompiler', async () => {
    // La source EST là mais ne compile pas : ce n'est pas un orphelin, c'est un
    // échec d'hydratation. On refuse plutôt que d'omettre en silence (l'omission
    // casserait « ensemble hydraté == read model »), et on démonte l'isolat déjà
    // né avant de relancer.
    const archive: RunArchive = {
      version: 1,
      brief: 'une source qui ne compile pas',
      events: stream(
        created('alpha#1', 'alpha-v1', [behaviourKey('alpha')]),
        built('alpha#1', BROKEN),
        activated('alpha#1'),
      ),
    }

    await expect(hydrateKernel(archive, { spawnWorker: spawnVmWorker })).rejects.toThrow(
      /behaviour failed to rehydrate/,
    )
  })
})
