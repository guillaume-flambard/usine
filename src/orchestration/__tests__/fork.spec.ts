// Le mode fork du pilote (CAP-3/CAP-4, AD-37/38/43/44/46/48).
//
// Ce test tourne en node, via `spawnVmWorker` : le fil isolé y est un `node:vm`
// qui évalue le vrai code d'un comportement. Il exerce `pilot.fork(archive, N)`
// de bout en bout — tronc, branche, estampille, isolation d'un remplacement —
// sur un flux construit à la main, sans lancer de vrai run.
//
// Chaque test couvre une ligne de la matrice d'entrées/sorties de la story.
import { describe, expect, it } from 'vitest'
import { createPilot } from '../pilot'
import { liveBehaviours } from '../factory'
import { spawnVmWorker } from '../../agents/__tests__/vm-worker'
import { behaviourComponent, behaviourKey } from '../../app/behaviour'
import type { RunArchive } from '../../app/replay'
import type { RunEvent } from '../../runtime/events'
import type { ComponentId } from '../../runtime/contract'

const ALPHA_V1 = '(input) => "alpha-v1:" + input'
const ALPHA_V2 = '(input) => "alpha-v2:" + input'
const ALPHA_V3 = '(input) => "alpha-v3:" + input'
const BETA_V1 = '(input) => "beta:" + input'

const MASTER = 'master#0' as ComponentId
const DISPLAY = { role: 'comportement de test' }
const buildOf = (source: string) => ({ specification: 'spec', source, route: 'evaluation' as const })

/** Fabrique un flux ordonné par `sequence`, un `at` élapsé qui suit l'index. */
function stream(...factories: ((seq: number) => Omit<RunEvent, 'sequence' | 'at'>)[]): RunEvent[] {
  return factories.map((make, index) => {
    const seq = index + 1
    return { ...make(seq), sequence: seq, at: index } as RunEvent
  })
}

const created = (id: string, name: string, provides: readonly string[]) => () => ({
  type: 'component-created' as const,
  id: id as ComponentId,
  name,
  display: DISPLAY,
  needs: [],
  provides,
  parent: MASTER,
})
const built = (id: string, source: string) => () => ({
  type: 'component-built' as const,
  id: id as ComponentId,
  parent: MASTER,
  build: buildOf(source),
})
const activated = (id: string) => () => ({ type: 'component-activated' as const, id: id as ComponentId })
const replaced = (id: string, previous: string, name: string) => () => ({
  type: 'component-replaced' as const,
  id: id as ComponentId,
  previous: previous as ComponentId,
  name,
})
const released = (id: string) => () => ({ type: 'component-released' as const, id: id as ComponentId })

/**
 * Un run où alpha et beta naissent, alpha est remplacé (v1→v2), puis beta est
 * relâché. À N=12 : alpha v2 seul est vivant, et le préfixe porte un
 * `component-replaced` (seq 11).
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

const forkPilot = () => createPilot({ spawnWorker: spawnVmWorker })

describe('pilot.fork — tronc + branche coexistants (AD-37/38/48)', () => {
  it('rend un tronc (store, pas de kernel) et une branche (kernel + store) à N', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    // Le tronc : un store réduit sur [1..12], sans kernel. alpha v2 vivant,
    // alpha#1 et beta relâchés.
    const trunkNodes = fork.trunk.store.state.value.nodes
    expect(trunkNodes.map((n) => n.id).sort()).toEqual(['alpha#1', 'alpha#2', 'beta#1'])
    const trunkLive = trunkNodes.filter((n) => n.state !== 'released' && n.state !== 'failed')
    expect(trunkLive.map((n) => n.name)).toEqual(['alpha-v2'])
    // Le tronc n'expose pas de kernel (AD-48).
    expect('kernel' in fork.trunk).toBe(false)

    // La branche : un kernel vivant, ses comportements à N.
    expect(fork.branch.kernel).toBeDefined()
    expect(fork.branch.behaviours.map((b) => b.name).sort()).toEqual(['alpha'])
    expect(fork.branch.behaviours.find((b) => b.name === 'alpha')?.version).toBe(2)

    await fork.branch.kernel.releaseAll()
  })

  it('le premier événement de la branche est branch-forked, estampillé, {trunkId, from, offset}', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    const first = fork.branch.stream()[0]
    expect(first?.type).toBe('branch-forked')
    if (first?.type !== 'branch-forked') throw new Error('pas de branch-forked')
    expect(first.branchId).toBe(fork.branch.branchId)
    expect(first.from).toBe(12)
    // offset = le `at` de l'événement N=12 sur le tronc (seq 12 → at=index 11).
    expect(first.offset).toBe(11)
    expect(typeof first.trunkId).toBe('string')
    expect(first.trunkId.length).toBeGreaterThan(0)
    // trunkId nomme le recording, pas la branche : les deux diffèrent.
    expect(first.trunkId).not.toBe(fork.branch.branchId)

    await fork.branch.kernel.releaseAll()
  })

  it('estampille chaque événement de la branche ; le tronc n’a pas de branchId', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    // On provoque plusieurs événements sur la branche (un remplacement en émet
    // une poignée) pour ne pas ne vérifier que le seul branch-forked.
    const alphaId = fork.branch.kernel
      .inspect()
      .components.find((n) => n.provides.includes(behaviourKey('alpha')))?.id as ComponentId
    const made = await behaviourComponent(
      { name: 'alpha', version: 3, code: ALPHA_V3, author: 'test' },
      spawnVmWorker,
    )
    if (!('component' in made)) throw new Error('le remplacement aurait dû compiler')
    await fork.branch.kernel.replace(alphaId, made.component)

    const events = fork.branch.stream()
    // Le remplacement a bien produit plusieurs événements, tous estampillés.
    expect(events.length).toBeGreaterThan(1)
    expect(events.every((e) => e.branchId === fork.branch.branchId)).toBe(true)
    // Les événements du tronc (le préfixe rejoué) n'en portent pas.
    expect(scenario().events.every((e) => e.branchId === undefined)).toBe(true)

    await fork.branch.kernel.releaseAll()
  })

  it('isolation : un remplacement sur la branche bouge son read model, pas celui du tronc', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    // Le tronc a re-réduit le préfixe [1..12], qui porte déjà un remplacement
    // (alpha v1→v2) : il démarre à 1. La branche, elle, n'est nourrie que par le
    // flux de son kernel — la re-matérialisation à N n'émet aucun remplacement,
    // donc son compteur démarre à 0 (AD-38).
    expect(fork.trunk.store.state.value.replacements).toBe(1)
    expect(fork.branch.store.state.value.replacements).toBe(0)

    const alphaId = fork.branch.kernel
      .inspect()
      .components.find((n) => n.provides.includes(behaviourKey('alpha')))?.id
    expect(alphaId).toBeDefined()

    const made = await behaviourComponent(
      { name: 'alpha', version: 3, code: ALPHA_V3, author: 'test' },
      spawnVmWorker,
    )
    if (!('component' in made)) throw new Error('le remplacement aurait dû compiler')
    const fresh = await fork.branch.kernel.replace(alphaId as ComponentId, made.component)
    expect(fresh).toBeDefined()

    // La branche compte le remplacement ; le tronc ne bouge pas (AD-38).
    expect(fork.branch.store.state.value.replacements).toBe(1)
    expect(fork.trunk.store.state.value.replacements).toBe(1)
    // Et la nouvelle version, lue en direct du kernel de branche, répond avec
    // son propre code.
    const alpha = liveBehaviours(fork.branch.kernel).find((b) => b.name === 'alpha')
    expect(alpha?.version).toBe(3)
    const answer = await alpha?.call('salut')
    expect(answer?.output).toBe('alpha-v3:salut')

    await fork.branch.kernel.releaseAll()
  })

  it('cohérence du store de branche : population unique, narration + lastSequence vivants', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    const seqAfterFork = fork.branch.store.state.value.lastSequence
    // Le store de branche reflète la re-matérialisation à N : ses nœuds vivants
    // égalent ceux du kernel, sans doublon (une seule population, AD-38).
    const liveIds = (store: typeof fork.branch.store) =>
      store.state.value.nodes
        .filter((n) => n.state !== 'released' && n.state !== 'failed')
        .map((n) => n.id)
        .sort()
    const kernelIds = () =>
      fork.branch.kernel
        .inspect()
        .components.map((c) => c.id)
        .sort()
    expect(liveIds(fork.branch.store)).toEqual(kernelIds())

    // Un message sur la branche : la narration doit avancer vers lui.
    await fork.branch.kernel.load({
      name: 'talker',
      display: { role: 'parle sur la branche' },
      apply(context) {
        context.emit('coucou depuis la branche')
      },
    })
    const seqAfterMessage = fork.branch.store.state.value.lastSequence
    expect(fork.branch.store.state.value.narration?.message).toBe('coucou depuis la branche')
    expect(seqAfterMessage).toBeGreaterThan(seqAfterFork)

    // Un remplacement ensuite : lastSequence continue de croître (monotone),
    // aucun recul dû à un mélange de deux numérotations.
    const alphaId = fork.branch.kernel
      .inspect()
      .components.find((n) => n.provides.includes(behaviourKey('alpha')))?.id as ComponentId
    const made = await behaviourComponent(
      { name: 'alpha', version: 3, code: ALPHA_V3, author: 'test' },
      spawnVmWorker,
    )
    if (!('component' in made)) throw new Error('le remplacement aurait dû compiler')
    await fork.branch.kernel.replace(alphaId, made.component)
    const seqAfterReplace = fork.branch.store.state.value.lastSequence
    expect(seqAfterReplace).toBeGreaterThan(seqAfterMessage)

    // Toujours une seule population : les vivants du store == ceux du kernel.
    expect(liveIds(fork.branch.store)).toEqual(kernelIds())

    await fork.branch.kernel.releaseAll()
  })

  it('rejette un fork hors bornes (N < 1) et clampe un N au-delà de la fin', async () => {
    const pilot = forkPilot()

    // Rien sous le point demandé : on refuse plutôt que de forker un vide.
    await expect(pilot.fork(scenario(), 0)).rejects.toThrow(/fork point out of range: 0/)

    // Au-delà de la fin : on clampe au dernier événement. La branche reflète
    // l'état de fin (alpha v2), et `from` pointe la vraie borne (seq 12).
    const fork = await pilot.fork(scenario(), 999)
    expect(fork.branch.behaviours.map((b) => `${b.name}@v${b.version}`)).toEqual(['alpha@v2'])
    const first = fork.branch.stream()[0]
    if (first?.type !== 'branch-forked') throw new Error('pas de branch-forked')
    expect(first.from).toBe(12)
    expect(first.offset).toBe(11)

    await fork.branch.kernel.releaseAll()
  })

  it('deux forks du même N ont deux branchId distincts et opaques', async () => {
    const pilot = forkPilot()
    const first = await pilot.fork(scenario(), 12)
    const second = await pilot.fork(scenario(), 12)

    expect(first.branch.branchId).not.toBe(second.branch.branchId)
    // Opaque et indépendant de N : une identité mintée par le runtime (un UUID),
    // pas une chaîne dérivée de `sequence`/N comme « branch@12 ».
    const opaque = /^[0-9a-f-]{36}$/
    expect(first.branch.branchId).toMatch(opaque)
    expect(second.branch.branchId).toMatch(opaque)

    await first.branch.kernel.releaseAll()
    await second.branch.kernel.releaseAll()
  })

  it('forke à un N intermédiaire : alpha v1 et beta v1 vivants à N=6', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 6)

    expect(fork.branch.behaviours.map((b) => `${b.name}@v${b.version}`).sort()).toEqual([
      'alpha@v1',
      'beta@v1',
    ])
    // Le tronc à N=6 : alpha#1 et beta#1 vivants, aucun remplacement encore.
    const trunkLive = fork.trunk.store.state.value.nodes.filter(
      (n) => n.state !== 'released' && n.state !== 'failed',
    )
    expect(trunkLive.map((n) => n.name).sort()).toEqual(['alpha-v1', 'beta-v1'])
    expect(fork.trunk.store.state.value.replacements).toBe(0)

    await fork.branch.kernel.releaseAll()
  })

  it('branch.replace : remplace un comportement maison sur la branche, le tronc inchangé (CAP-5)', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    // API ergonomique : on remplace par nom + code, sans atteindre le kernel.
    const took = await fork.branch.replace('alpha', ALPHA_V3)
    expect(took).toBe(true)

    // La nouvelle version répond sur la branche...
    const alpha = liveBehaviours(fork.branch.kernel).find((b) => b.name === 'alpha')
    expect(alpha?.version).toBe(3)
    expect((await alpha?.call('salut'))?.output).toBe('alpha-v3:salut')
    // ...la branche compte le remplacement, le tronc ne bouge pas (AD-38).
    expect(fork.branch.store.state.value.replacements).toBe(1)
    expect(fork.trunk.store.state.value.replacements).toBe(1)

    await fork.branch.kernel.releaseAll()
  })

  it('branch.replace : refuse un nom inconnu (false), sans rien changer', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    expect(await fork.branch.replace('inexistant', ALPHA_V3)).toBe(false)
    expect(fork.branch.store.state.value.replacements).toBe(0)

    await fork.branch.kernel.releaseAll()
  })

  it('branch.replace : un code qui ne compile pas rend false, la version précédente sert encore', async () => {
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    expect(await fork.branch.replace('alpha', '(input) => (')).toBe(false)
    // v2 sert toujours : le remplacement n'a jamais atteint le kernel.
    const alpha = liveBehaviours(fork.branch.kernel).find((b) => b.name === 'alpha')
    expect(alpha?.version).toBe(2)
    expect((await alpha?.call('salut'))?.output).toBe('alpha-v2:salut')
    expect(fork.branch.store.state.value.replacements).toBe(0)

    await fork.branch.kernel.releaseAll()
  })

  it('enrichit le fork : comportements du tronc recompilés à N + écrans (story 6a)', async () => {
    const pilot = forkPilot()
    // Un run avec écran : alpha posé, écran posé, alpha vivant à N.
    const withScreen: RunArchive = {
      version: 1,
      brief: 'un run avec écran',
      events: stream(
        created('alpha#1', 'alpha-v1', [behaviourKey('alpha')]), // 1
        built('alpha#1', ALPHA_V1), // 2
        activated('alpha#1'), // 3
        () => ({
          type: 'screen-posted' as const,
          id: MASTER,
          markup: '<h1>Écran à N</h1>',
          revision: 1,
        }), // 4
      ),
    }
    const fork = await pilot.fork(withScreen, 4)

    // Le tronc : ses comportements recompilés à N répondent (un recording).
    const trunkAlpha = fork.trunk.behaviours.find((b) => b.name === 'alpha')
    expect(trunkAlpha?.version).toBe(1)
    expect((await trunkAlpha?.call('salut'))?.output).toBe('alpha-v1:salut')
    // L'écran du tronc à N, et celui de la branche réensemencé dessus.
    expect(fork.trunk.screen.revision).toBe(1)
    expect(fork.trunk.screen.markup).toContain('Écran à N')
    expect(fork.branch.screen).toEqual(fork.trunk.screen)

    await fork.branch.kernel.releaseAll()
  })

  it('rejeu inchangé : un flux sans branchId se réduit exactement comme avant', async () => {
    // Le tronc rejoue le préfixe (aucun événement n'a de branchId) et produit le
    // même read model qu'attendu : l'ajout de `branchId?` et de `BranchForked`
    // n'a rien changé à la réduction d'un flux existant.
    const pilot = forkPilot()
    const fork = await pilot.fork(scenario(), 12)

    const view = fork.trunk.store.state.value
    expect(view.replacements).toBe(1)
    expect(view.lastSequence).toBe(12)
    expect(view.nodes).toHaveLength(3)
    const live = view.nodes.filter((n) => n.state !== 'released' && n.state !== 'failed')
    expect(live.map((n) => n.name)).toEqual(['alpha-v2'])

    await fork.branch.kernel.releaseAll()
  })
})
