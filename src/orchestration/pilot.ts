// The pilot: everything that makes a run live — the kernel, the store, the
// layout — outside any Vue component. This is what makes the wiring verifiable
// without a browser.
//
// There is no scenario to choose any more. There is a brief, and whatever the
// factory makes of it.

import { computed, shallowRef, type Ref } from 'vue'
import { liveLayout, topologySignature, type Layout } from '../state/layout'
import { createStore, type RunStore } from '../state/store'
import { createKernel, mintBranchId, type Kernel } from '../runtime/kernel'
import { hydrateKernel } from '../app/fork'
import { deterministicReasoner, type Reasoner, type ReasoningOrigin } from '../runtime/reasoner'
import type { Budget, Worksite } from '../agents/free-agent'
import type { SpawnWorker } from '../app/isolate'
import type { SourceFetcher } from '../app/sources'
import { liveBehaviours, startFactory } from './factory'
import { behaviourComponent, behaviourKey, type Behaviour } from '../app/behaviour'
import { createSession, type Interaction, type Session } from '../app/session'
import {
  archiveOf,
  behavioursFromArchive,
  replayInto,
  type RunArchive,
} from '../app/replay'
import type { RunEvent } from '../runtime/events'

export type RunPhase =
  | 'Au repos'
  | 'Amorçage'
  | 'Construction'
  | 'Décision'
  | 'Écarté'
  | 'Terminé'
  | 'Incident'
  | 'Libéré'

/**
 * Le tronc d'un fork : un *recording* sans kernel (AD-48).
 *
 * Son modèle de lecture est le préfixe `[1..N]` re-réduit dans son propre store
 * (AD-45) ; rien ne le fait bouger après le fork, il n'a pas de noyau vivant.
 */
export interface Trunk {
  readonly store: RunStore
}

/**
 * Une branche d'un fork : un kernel vivant hydraté à N, avec son propre store
 * (AD-38).
 *
 * Son store est nourri **uniquement** par le flux de son kernel : la
 * re-matérialisation des comportements vivants à N, puis la divergence — une
 * seule population d'événements, tous estampillés `branchId` (AD-44). Il ne
 * porte donc ni l'écran ni l'historique d'agents d'avant le fork (le préfixe
 * reste la vue du tronc) ; le panneau de branche réensemencera l'écran à N
 * (story 6). Un remplacement à chaud (AD-31) opère sur `kernel` sans jamais
 * toucher le modèle de lecture du tronc.
 */
export interface Branch {
  /** L'identité opaque de la branche, mintée par le runtime (AD-43). */
  readonly branchId: string
  readonly store: RunStore
  readonly kernel: Kernel
  /** Les comportements vivants à N, prêts à être appelés ou remplacés. */
  readonly behaviours: readonly Behaviour[]
  /**
   * Le flux propre de la branche, estampillé `branchId` : `branch-forked`
   * d'abord (AD-44), puis chaque événement que son kernel émet ensuite. C'est ce
   * qui rend l'archive d'une branche auto-descriptive — elle référence le tronc
   * par id + N sans recopier le préfixe.
   */
  stream(): readonly RunEvent[]
  /**
   * Remplace à chaud un comportement de la branche par une nouvelle version, à
   * partir de N (AD-31/37), sans jamais toucher le tronc. Rend `true` si la
   * nouvelle version a pris ; `false` si le nom est inconnu, si le code ne
   * compile pas, ou si le remplacement est retombé — auquel cas la version
   * précédente continue de servir (le rollback est celui, déjà éprouvé, du
   * kernel).
   */
  replace(name: string, code: string): Promise<boolean>
}

/** Ce que rend un fork : un tronc et une branche, deux read models isolés. */
export interface Fork {
  readonly trunk: Trunk
  readonly branch: Branch
}

export interface Pilot {
  readonly store: RunStore
  /** The layout of the graph as it stands. Recomputed as it grows. */
  readonly layout: Ref<Layout>
  phase(): RunPhase
  /** True when nothing will move any more without a human action. */
  isDone(): boolean
  error(): string | undefined
  start(brief: string): Promise<void>
  /**
   * Connects a real model to the agents that reason. Without this call the run
   * stays deterministic: no key, no token, no request.
   */
  connect(reasoner: Reasoner | undefined): void
  /** The reasoning mode in force for the next run. */
  reasoningMode(): ReasoningOrigin
  stop(): Promise<void>
  /** Approves the pending gate. Returns `false` if none waits. */
  approve(): boolean
  /**
   * Rejects the pending gate: delivery will not happen, and the built parts are
   * released so the graph shows the retraction.
   */
  reject(): Promise<boolean>
  /**
   * The application's live behaviours. Available **during** the run, not only
   * after a decision: the whole product rests on the visitor using what the
   * agents are still working on.
   */
  behaviours(): readonly Behaviour[]
  /** The screen as last posted by an agent, and its revision. */
  screen(): { markup: string; revision: number }
  /**
   * What the visitor did with the application. It belongs to the run, not to
   * a component: no replacement may cost it anything.
   */
  session(): Session
  /**
   * Hands a visitor interaction to the live run: it enters the stream as its
   * own event, and wakes whichever agent authored the behaviour so it can
   * answer — a replacement that is a response to what the visitor did, not the
   * agent's own schedule. A no-op on a replay: a replayed run reproduces the
   * recomposition from the stream, it must never mutate anew.
   */
  observe(interaction: Interaction): void
  /** The current run's kernel, for introspection. Absent at rest. */
  kernel(): Kernel | undefined
  /**
   * The run as it can be stored: its brief and its whole event stream. Absent
   * until something has happened.
   */
  archive(): RunArchive | undefined
  /**
   * Replays a stored run. No kernel, no model, no network — the same reducer,
   * the same views, and behaviours recompiled in the same isolated thread.
   */
  replay(archive: RunArchive, paceMs?: number): Promise<void>
  /**
   * Forke une archive maison au point `at` (le `sequence` N, AD-36) : rend un
   * tronc et une branche coexistants, deux read models isolés.
   *
   * Le tronc est un store sans kernel réduit sur `[1..N]` (AD-48) ; la branche
   * est un kernel hydraté à N (AD-49), estampillé d'un `branchId` opaque
   * (AD-43), dont le store est nourri uniquement par le flux de ce kernel
   * (AD-38) : la re-matérialisation à N puis la divergence. Le premier événement
   * de la branche est un `branch-forked` portant `{trunkId, from:N, offset}`
   * (AD-44/46). Lève si `at` ne désigne aucun événement (hors bornes).
   * N'utilise que des factories fraîches : ni le store ni le kernel du pilote ne
   * sont touchés (aucun singleton).
   */
  fork(archive: RunArchive, at: number): Promise<Fork>
  /**
   * Déclare les sources branchables, et comment on va les chercher.
   *
   * Appelé par la page après son sondage du service. Sans cet appel, un run
   * ne joint rien : c'est ce qui garde la promesse du mode déterministe.
   */
  connectSources(
    sources: readonly { name: string; description: string }[],
    fetcher?: SourceFetcher,
  ): void
  /** True while a replayed run is on screen. The page must say so. */
  isReplay(): boolean
  /**
   * Tours que le modèle a rendus illisibles malgré la forme demandée.
   *
   * Affiché plutôt que tu : un taux de non-conformité mesure ce que le
   * fournisseur et le prompt valent ensemble, et invisible il se découvre en
   * regardant un run au hasard.
   */
  malformedTurns(): number
  /**
   * Le code d'un comportement, tel qu'il a été chargé.
   *
   * Lu dans le flux plutôt que dans le runtime : un run rejoué doit pouvoir
   * être emporté comme un run vivant, et il n'a pas de runtime.
   */
  sourceOf(name: string): string | undefined
}

const EMPTY_LAYOUT: Layout = {
  boxes: new Map(),
  links: [],
  width: 0,
  height: 0,
}

export interface PilotOptions {
  /** What bounds a free run: agents, depth, turns, tokens. */
  budget?: Budget
  /** How an isolated thread is made. Absent in the product; supplied by tests. */
  spawnWorker?: SpawnWorker
  /** Comment on va chercher une source. Absent, le service s'en charge. */
  fetchSource?: SourceFetcher
  /** Les sources disponibles. Absentes, elles sont demandées au service. */
  sources?: readonly { name: string; description: string }[]
  /** How long a worksite may stay in motion. */
  settleTimeoutMs?: number
  /** The step between two settle checks. Tests shorten it. */
  stepMs?: number
}

export function createPilot(options: PilotOptions = {}): Pilot {
  const store = createStore()
  let currentKernel: Kernel | undefined
  let currentWorksite: Worksite | undefined
  let currentSession: Session = createSession()
  /** Everything the run emitted, kept so it can be stored and replayed. */
  let recorded: RunEvent[] = []
  let currentBrief = ''
  let replayed: readonly Behaviour[] | undefined
  let replayAbort: AbortController | undefined
  let disconnect: (() => void) | undefined
  let stopCounting: (() => void) | undefined
  let lastError: string | undefined
  let starting = false
  let currentReasoner: Reasoner = deterministicReasoner()
  let declaredSources: readonly { name: string; description: string }[] = []
  let declaredFetcher: SourceFetcher | undefined

  // The layout is only recomputed when the topology changes: a message or a
  // node state change has no reason to move a node.
  const latest = shallowRef<{ signature: string; layout: Layout }>({
    signature: '',
    layout: EMPTY_LAYOUT,
  })
  const layout = computed(() => {
    const { nodes, edges } = store.state.value
    if (nodes.length === 0) return EMPTY_LAYOUT
    const signature = topologySignature(nodes, edges)
    if (signature !== latest.value.signature) {
      latest.value = { signature, layout: liveLayout(nodes, edges) }
    }
    return latest.value.layout
  })

  const phase = (): RunPhase => {
    const nodes = store.state.value.nodes
    if (nodes.length === 0) return 'Au repos'
    if (nodes.every((n) => n.state === 'released')) return 'Libéré'
    const gate = store.state.value.gate
    // A pending gate halts the run: neither an end nor a breakdown.
    if (gate !== undefined && gate.decision === undefined) return 'Décision'
    // A rejected run is stopped, not running: calling it "Construction" would
    // suggest it is still working.
    if (gate?.decision === 'rejected') return 'Écarté'
    // Incidents come after the gate: while a decision is pending, saying
    // "Incident" and declaring the run done would leave live buttons on a run
    // announced as finished.
    if (nodes.some((n) => n.state === 'failed')) return 'Incident'
    // Finished *or* released. A hot replacement leaves the previous version
    // released in the graph — that is the trace it is supposed to leave — so
    // demanding that every node be finished would keep a completed run
    // announcing itself as still building, for ever.
    if (nodes.every((n) => n.state === 'finished' || n.state === 'released')) return 'Terminé'
    // While the master is alone, nothing has been created yet: saying
    // "Construction" would suggest agents are working.
    if (nodes.length > 1) return 'Construction'
    return 'Amorçage'
  }

  async function stop() {
    disconnect?.()
    disconnect = undefined
    stopCounting?.()
    stopCounting = undefined
    replayAbort?.abort()
    replayAbort = undefined
    replayed = undefined
    await currentKernel?.releaseAll()
    currentKernel = undefined
    currentWorksite = undefined
  }

  return {
    store,
    layout,
    phase,
    isDone: () => ['Terminé', 'Écarté', 'Libéré', 'Incident'].includes(phase()),
    error: () => lastError,
    kernel: () => currentKernel,
    behaviours() {
      // A replayed run has no kernel: its behaviours were recompiled from the
      // stream. Everything downstream — the frame, the counter, the session —
      // cannot tell the difference, and must not be able to.
      if (replayed !== undefined) return replayed
      // No gate condition. The application serves while it is being built —
      // that is the point, and making it wait for a decision would put the
      // product back where it was: at the end.
      //
      // A released run is the one exception: there is nothing left to call.
      if (currentKernel === undefined || phase() === 'Libéré') return []
      return liveBehaviours(currentKernel)
    },
    archive() {
      return recorded.length === 0 ? undefined : archiveOf(currentBrief, recorded)
    },
    connectSources(sources, fetcher) {
      declaredSources = sources
      declaredFetcher = fetcher
    },
    isReplay: () => replayed !== undefined,
    malformedTurns: () => currentWorksite?.malformed ?? 0,
    sourceOf(name) {
      // Le dernier « component-built » d'un composant portant ce nom : c'est
      // la version qui sert, les précédentes ayant été relâchées.
      // Par `behaviourKey`, jamais par une chaîne recomposée : la règle de
      // nommage vit à un seul endroit, sinon un changement de préfixe casserait
      // ici en silence.
      const key = behaviourKey(name)
      const holders = new Set(
        recorded
          .filter((event) => event.type === 'component-created')
          .filter((event) => event.provides.includes(key))
          .map((event) => event.id),
      )
      let found: string | undefined
      for (const event of recorded) {
        if (event.type !== 'component-built') continue
        if (!holders.has(event.id)) continue
        found = event.build.source
      }
      return found
    },
    async replay(archive, paceMs = 40) {
      await stop()
      store.reset()
      currentSession = createSession()
      currentBrief = archive.brief
      recorded = [...archive.events]
      lastError = undefined

      // The behaviours are rebuilt first: a visitor who reaches the end of the
      // replay must find the application ready, not still compiling.
      replayed = await behavioursFromArchive(archive)
      replayAbort = new AbortController()
      await replayInto(archive, store.receive, {
        paceMs,
        signal: replayAbort.signal,
      })
    },
    async fork(archive, at) {
      // Deux identités opaques, mintées par le runtime (AD-43) : l'une nomme le
      // recording (tronc) que la branche référence, l'autre estampe la branche.
      // Deux forks du même N obtiennent donc deux `branchId` distincts.
      const trunkId = mintBranchId()
      const branchId = mintBranchId()

      // La borne du fork : le dernier événement du préfixe `sequence <= N`. On la
      // cherche par `sequence` (robuste à un flux non trié, ou à un N qui tombe
      // entre deux `sequence`, ou au-delà de la fin — on clampe alors au dernier).
      let boundary: RunEvent | undefined
      for (const event of archive.events) {
        if (event.sequence > at) continue
        if (boundary === undefined || event.sequence > boundary.sequence) boundary = event
      }
      // Aucun événement sous le point demandé (N < 1, ou en deçà du premier) : il
      // n'y a rien à forker. On rejette plutôt que de deviner un point vide.
      if (boundary === undefined) throw new Error(`fork point out of range: ${at}`)
      // `from` et `offset` décrivent le même point réel : la vraie borne, pas le
      // `at` brut demandé. L'offset aligne les deux axes de temps (AD-46).
      const from = boundary.sequence
      const offset = boundary.at

      // Le tronc : un store sans kernel, nourri par le préfixe `[1..N]` (AD-48).
      const trunkStore = createStore()
      await replayInto(archive, trunkStore.receive, { stopAt: at })

      // La branche : un store nourri **uniquement** par le flux de son kernel
      // (AD-38). Il ne re-réduit pas le préfixe d'archive — sinon les composants
      // du préfixe et ceux que le kernel re-matérialise à N entreraient en
      // collision (ids doublés, `lastSequence` qui recule). Le store s'abonne
      // dans `onKernelReady`, avant les chargements : il capte donc la
      // re-matérialisation d'hydratation, puis la divergence, en une seule
      // population d'événements monotone.
      const branchStore = createStore()
      const branchStream: RunEvent[] = []
      const hydrated = await hydrateKernel(archive, {
        stopAt: at,
        branchId,
        onKernelReady: (kernel) => {
          kernel.subscribe((event) => branchStream.push(event))
          branchStore.connect(kernel)
          // Émis avant tout chargement : `branch-forked` est ainsi le premier
          // événement de la branche (AD-44), devant la re-matérialisation.
          kernel.noteFork({ trunkId, from, offset })
        },
        ...(options.spawnWorker !== undefined ? { spawnWorker: options.spawnWorker } : {}),
        ...(options.fetchSource !== undefined ? { fetchSource: options.fetchSource } : {}),
      })

      // La version vivante de chaque comportement de la branche, suivie ici : un
      // remplacement qui prend la fait monter d'un cran, comme pendant un run.
      const versions = new Map(hydrated.behaviours.map((live) => [live.name, live.version]))

      async function replaceOnBranch(name: string, code: string): Promise<boolean> {
        const current = versions.get(name)
        if (current === undefined) return false
        const version = current + 1
        // Compilé avant de toucher le kernel : un code qui ne s'évalue pas en
        // fonction est refusé ici, pas plus tard comme un composant tombé.
        const made = await behaviourComponent(
          { name, version, code, author: 'branche' },
          options.spawnWorker,
          options.fetchSource,
        )
        if (!('component' in made)) return false
        // Le composant vivant qui porte ce comportement, par sa clé de coeffet.
        const key = behaviourKey(name)
        const holder = hydrated.kernel
          .inspect()
          .components.find((component) => component.state === 'active' && component.provides.includes(key))
        if (holder === undefined) return false
        const id = await hydrated.kernel.replace(holder.id, made.component, {
          specification: `comportement : ${name}\nversion : ${version}\nbranche`,
          source: code,
          route: 'evaluation',
        })
        // `undefined` = la nouvelle version est retombée ; le kernel a remis la
        // précédente (AD-31). On ne fait pas monter le compteur de version.
        if (id === undefined) return false
        versions.set(name, version)
        return true
      }

      return {
        trunk: { store: trunkStore },
        branch: {
          branchId,
          store: branchStore,
          kernel: hydrated.kernel,
          behaviours: hydrated.behaviours,
          // Une copie : le flux interne continue de grandir, l'appelant en reçoit
          // un instantané figé qu'il ne peut pas muter.
          stream: () => [...branchStream],
          replace: replaceOnBranch,
        },
      }
    },
    screen() {
      // From the read model, not from the worksite: a replayed run has no
      // worksite, and the screen must come from the same place either way.
      return store.state.value.screen
    },
    session() {
      return currentSession
    },
    observe(interaction) {
      // A replay never re-mutates: it reproduces the recomposition from the
      // stream. And with no kernel there is no run to answer.
      if (replayed !== undefined || currentKernel === undefined) return
      // Minted first, synchronously: the interaction's sequence lands below any
      // component-replaced the reactive turn produces, so the stream shows the
      // cause before the effect.
      currentKernel.noteVisitorInteraction({
        name: interaction.name,
        input: interaction.input,
        ...(interaction.version !== undefined ? { version: interaction.version } : {}),
        ...(interaction.output !== undefined ? { output: interaction.output } : {}),
        ...(interaction.failure !== undefined ? { failure: interaction.failure } : {}),
      })
      currentWorksite?.observe(interaction)
    },
    stop,
    async start(brief: string) {
      // Two interleaved starts would share the same kernel.
      if (starting) return
      starting = true
      try {
        await stop()
        store.reset()
        // A new run is a new session. Keeping the previous one would inflate
        // the counter with interactions that belonged to another application.
        currentSession = createSession()
        recorded = []
        currentBrief = brief
        lastError = undefined
        currentKernel = createKernel()
        disconnect = store.connect(currentKernel)
        // The session counts replacements from the runtime's own event, not
        // from anything an agent says: a counter the agents could inflate
        // would be worth nothing.
        const session = currentSession
        stopCounting = currentKernel.subscribe((event) => {
          // Recorded before anything else looks at it: the archive must be the
          // stream, not a summary of it (AD-33).
          recorded.push(event)
          if (event.type === 'component-replaced') session.noteReplacement()
        })
        const launch = await startFactory(currentKernel, {
          brief,
          reasoner: currentReasoner,
          ...(options.budget !== undefined ? { budget: options.budget } : {}),
          ...(options.spawnWorker !== undefined ? { spawnWorker: options.spawnWorker } : {}),
          sources: options.sources ?? declaredSources,
          ...(options.fetchSource ?? declaredFetcher) !== undefined
            ? { fetchSource: (options.fetchSource ?? declaredFetcher) as SourceFetcher }
            : {},
          ...(options.settleTimeoutMs !== undefined
            ? { settleTimeoutMs: options.settleTimeoutMs }
            : {}),
          ...(options.stepMs !== undefined ? { stepMs: options.stepMs } : {}),
        })
        currentWorksite = launch.worksite
      } catch (cause) {
        lastError = cause instanceof Error ? cause.message : String(cause)
        await stop()
      } finally {
        starting = false
      }
    },
    approve() {
      const gate = store.state.value.gate
      if (gate === undefined || gate.decision !== undefined) return false
      return currentKernel?.decide(gate.id, 'approved') ?? false
    },
    async reject() {
      const gate = store.state.value.gate
      if (gate === undefined || gate.decision !== undefined) return false
      // The kernel is captured: if the user restarts during the retraction, the
      // remaining ids would target the new run.
      const kernel = currentKernel
      if (kernel === undefined) return false
      if (!kernel.decide(gate.id, 'rejected')) return false
      // Rejecting must be visible: built parts are released, and the graph
      // shows the retraction instead of freezing.
      for (const node of store.state.value.nodes) {
        if (currentKernel !== kernel) return true
        if (node.build === undefined || node.state === 'released') continue
        try {
          await kernel.release(node.id)
        } catch {
          // A release that fails does not interrupt the retraction of the
          // other parts.
        }
      }
      return true
    },
    connect(reasoner: Reasoner | undefined) {
      currentReasoner = reasoner ?? deterministicReasoner()
    },
    reasoningMode: () => currentReasoner.origin,
  }
}
