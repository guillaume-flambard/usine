<script setup lang="ts">
// The shell: two panes, 100vh, the page never scrolls.
// Everything that makes the run live is in the pilot, outside this component:
// that is what makes the wiring testable without a browser.
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPilot } from '../orchestration/pilot'
import { CONTACT, EXAMPLES } from '../examples'
import { demoReasoner } from '../examples/demo'
import type { NodeView } from '../state/model'
import LiveGraph from './LiveGraph.vue'
import NodePanel from './NodePanel.vue'
import HumanGate from './HumanGate.vue'
import LiveApplication from './LiveApplication.vue'
import ForkView from './ForkView.vue'
import type { Fork } from '../orchestration/pilot'
import type { RunArchive } from '../app/replay'
import ModelSwitch, { type ModelSource } from './ModelSwitch.vue'
import { relayReasoner, relayState, type RelayState } from '../runtime/reasoner/relay'
import { fetchRun, linkFor, requestedRun, storeRun } from '../app/archive-client'
import { importTrace, isImportError } from '../app/import'
import { measureRun } from '../app/measure'
import { logout, requestLink, sessionStatus, type SessionStatus } from '../app/auth-client'
import {
  exportUrl,
  listRuns,
  purgeRun,
  restoreRun,
  revokeRunById,
  shareRunById,
  trashRun,
  type RunSummary,
} from '../app/runs-client'
import { accountExportUrl, eraseAccount } from '../app/account-client'
import { fetchEvaluation, formatEvaluation, type Evaluation } from '../app/eval-client'
import { availableSources, serviceFetcher } from '../app/sources'
import type { Interaction } from '../app/session'
import { takeawayHtml, takeawayOf } from '../app/takeaway'
import type { ReasoningOrigin } from '../runtime/reasoner'
import { gateReached, newRun, productServed, runStarted, checkSubmitted } from '../telemetry'

const pilot = createPilot()
// With no model, the factory can invent nothing. Rather than a blank screen it
// replays prepared answers — and the screen never pretends otherwise.
pilot.connect(demoReasoner())
const state = pilot.store.state

// The visitor used the live application. Two things follow: the telemetry note,
// and — the point of the product — the interaction goes back to the run, where
// the agent that wrote the behaviour may answer by recomposing it.
function onVisitorInteraction(interaction: Interaction): void {
  checkSubmitted()
  pilot.observe(interaction)
}

// Empty, deliberately. A prefilled brief submitted as it stands would ruin
// the only proof the visitor has that nothing was recorded in advance: the
// examples write into the field, visibly, and the visitor still submits.
const brief = ref('')

/** The demo only knows how to replay one need; the screen does not hide it. */
const briefReplayable = computed(
  () =>
    ['allégation', 'santé', 'complément', 'conformité'].filter((word) =>
      brief.value.includes(word),
    ).length >= 2,
)
// The layout follows the graph: it is no longer a snapshot taken before the
// run, it is recomputed whenever the factory brings an agent into existence.
const layout = pilot.layout
const started = ref(false)
const starting = ref(false)
const error = ref<string | undefined>()
const selected = ref<string | undefined>()
const modeHelp = ref(false)

/**
 * Le rapport d'éval, lu une fois au montage. Undefined tant que le service
 * n'a pas répondu — et il le reste s'il est absent : l'éval n'est montrée que
 * si elle est payée par des runs réellement conservés.
 */
const evaluation = ref<Evaluation | undefined>()

/**
 * La ligne de mesures, ou rien. Le signal recruteur n°1 rendu visible : une
 * ligne dans le repli d'état, jamais un tableau de bord. Rien à montrer tant
 * qu'aucun run n'a été conservé (`runs === 0`) — pas de zéros décoratifs.
 */
const measurements = computed(() => formatEvaluation(evaluation.value))
/**
 * Whether the graph is unfolded. It starts open — during the build it is the
 * only thing to look at — and folds itself the first time the application
 * serves, because from then on the application deserves the room.
 */
const threadEl = ref<HTMLElement | null>(null)
const graphOpen = ref(true)
let graphFoldedOnce = false

/** Le lien de partage, une fois le run conservé. */
const shareLink = ref<string | undefined>()
const sharing = ref(false)

/**
 * Conserve le run et rend son lien.
 *
 * C'est ce qui transforme une démonstration en pièce à conviction : le
 * destinataire du lien rejoue le run à l'identique et **se sert de
 * l'application**, sans clé et sans modèle.
 */
/**
 * Emporte l'application : un fichier autonome qui s'ouvre hors ligne.
 *
 * C'est le geste qui transforme une démonstration en livrable. Le fichier
 * reprend l'isolement du produit — ses comportements tournent dans un Worker,
 * pas dans le document — parce qu'un fichier qui exécuterait le code d'un
 * modèle dans sa propre page serait un cadeau empoisonné.
 */
function takeAway() {
  const made = takeawayOf(brief.value, screen.value.markup, behaviours.value, pilot.sourceOf)
  if (made === undefined) {
    error.value = "Il n'y a pas encore d'application à emporter."
    return
  }
  const file = new Blob([takeawayHtml(made)], { type: 'text/html;charset=utf-8' })
  const address = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = address
  link.download = 'application-usine.html'
  link.click()
  URL.revokeObjectURL(address)
}

async function shareRun() {
  const archive = pilot.archive()
  if (archive === undefined || sharing.value) return
  // Conserver/partager exige une identité (un run appartient à une org). On le
  // dit et on ouvre la connexion, plutôt que de laisser le service répondre 401.
  if (!session.value.authenticated) {
    signInOpen.value = true
    error.value = 'Connectez-vous pour conserver et partager un run.'
    return
  }
  sharing.value = true
  try {
    const id = await storeRun(archive)
    shareLink.value = id === undefined ? undefined : linkFor(id)
    if (id === undefined) error.value = "Le run n'a pas pu être conservé."
  } finally {
    sharing.value = false
  }
}
const mode = ref<ReasoningOrigin>(pilot.reasoningMode())
const source = ref<ModelSource>('none')
const relayReady = ref(false)
/** Les sources que le service sert. Vide tant qu'il n'a pas répondu. */
const wired = ref<readonly { name: string; description: string }[]>([])
/**
 * What the relay says is left, in runs. Undefined until the probe answers —
 * not zero: "your capacity is spent" and "we have not asked yet" are
 * different facts, and telling the second as the first is a lie.
 */
const capacity = ref<RelayState['runs'] | undefined>()

// L'authentification. Un visiteur anonyme fait tourner la démo et ouvre les
// liens partagés ; se connecter par lien magique débloque conserver/partager.
const session = ref<SessionStatus>({ authenticated: false })
const signInOpen = ref(false)
const signInEmail = ref('')
const signInSent = ref(false)

async function onRequestLink() {
  const email = signInEmail.value.trim()
  if (email.length === 0) return
  const ok = await requestLink(email)
  signInSent.value = ok
  error.value = ok ? undefined : "Le lien n'a pas pu être envoyé."
}

async function onLogout() {
  await logout()
  session.value = { authenticated: false }
  signInSent.value = false
  runsOpen.value = false
}

// La vue « mes runs » : sans elle, un visiteur connecté ne verrait aucun de ses
// runs (la tenancy les rend privés).
const runsOpen = ref(false)
const runsTab = ref<'live' | 'trash'>('live')
const myRuns = ref<RunSummary[]>([])
const myTrash = ref<RunSummary[]>([])
const runExportUrl = exportUrl

async function refreshRuns() {
  ;[myRuns.value, myTrash.value] = await Promise.all([listRuns(false), listRuns(true)])
}

async function toggleRuns() {
  runsOpen.value = !runsOpen.value
  if (runsOpen.value) await refreshRuns()
}

function openRun(id: string) {
  // Rejouer ce run, par le chemin de rejeu existant (?run=<id>).
  window.location.search = `?run=${encodeURIComponent(id)}`
}

async function onTrashRun(id: string) {
  if (await trashRun(id)) await refreshRuns()
}
async function onRestoreRun(id: string) {
  if (await restoreRun(id)) await refreshRuns()
}
async function onPurgeRun(id: string) {
  if (await purgeRun(id)) await refreshRuns()
}
async function onToggleShare(run: RunSummary) {
  const done = run.shared ? await revokeRunById(run.id) : await shareRunById(run.id)
  if (done) await refreshRuns()
}

// Mes données (RGPD) : exporter tout, ou effacer son compte (irréversible).
const accountExport = accountExportUrl()
const eraseConfirm = ref(false)

async function onEraseAccount() {
  if (await eraseAccount()) {
    session.value = { authenticated: false }
    runsOpen.value = false
    eraseConfirm.value = false
  }
}

/**
 * What the visitor is told before clicking. Capacity is not a technical
 * detail here: a run that dies halfway because the day is spent is worse than
 * a replay that says what it is.
 */
/**
 * Why the page is replaying rather than running live. A replay announced with
 * no reason reads as a limitation of the product; the reason is usually that
 * the day's capacity is spent, which is a different thing entirely.
 */
const replayReason = computed(() => {
  if (source.value === 'key' || source.value === 'relay') return 'Le modèle n’a pas répondu.'
  if (capacity.value === undefined) return 'Aucun modèle n’est branché.'
  if (capacity.value.visitor <= 0) return 'Votre capacité du jour est atteinte.'
  if (capacity.value.site <= 0) return 'La capacité du jour du site est atteinte.'
  return 'Aucun modèle n’est branché.'
})


/**
 * The site's model. The key is not here: it lives on the relay, and the
 * browser only ever sees a same-origin route. With no relay configured we stay
 * on the demo without announcing anything false.
 */
function connectSiteRelay() {
  pilot.connect(relayReasoner())
  source.value = 'relay'
  mode.value = pilot.reasoningMode()
  error.value = undefined
}

async function connectKey(key: string) {
  try {
    // Dynamic import: with nothing connected, the SDK is never loaded and the
    // default bundle carries not a line of it.
    const { claudeReasoner } = await import('../runtime/reasoner/claude')
    pilot.connect(claudeReasoner({ key }))
    source.value = 'key'
    error.value = undefined
  } catch (cause) {
    // A chunk that fails to load must say so, not let the screen announce a
    // mode that is not its own.
    error.value = `Le modèle n'a pas pu être branché : ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
  mode.value = pilot.reasoningMode()
}

function disconnectModel() {
  // Disconnecting does not make the page inert: it falls back to the replayed
  // demo, which announces itself as such.
  pilot.connect(demoReasoner())
  source.value = 'none'
  mode.value = pilot.reasoningMode()
}

const startedAt = ref(0)
const now = ref(0)
let clock: ReturnType<typeof setInterval> | undefined

// The "built" badge comes from what actually happened, never from a
// declaration.
const built = computed(() =>
  state.value.nodes.filter((node) => node.build !== undefined).map((node) => node.name),
)

const elapsedMs = computed(() => (startedAt.value === 0 ? 0 : now.value - startedAt.value))

/** Under a second we show milliseconds: it is more honest. */
const elapsed = computed(() =>
  elapsedMs.value < 1000 ? `${elapsedMs.value}ms` : `${Math.round(elapsedMs.value / 1000)}s`,
)

const phase = computed(() => {
  void state.value.lastSequence
  return pilot.phase()
})

/**
 * The application's live behaviours. Read on every event, because a
 * replacement changes what answers without changing anything else on screen.
 */
const behaviours = computed(() => {
  void state.value.lastSequence
  return pilot.behaviours()
})

/** The screen an agent posted, if one exists yet. */
const screen = computed(() => {
  void state.value.lastSequence
  return pilot.screen()
})

/**
 * The application exists as soon as it can answer something: a screen and at
 * least one behaviour. Showing the frame before that would be a promise the
 * run has not yet kept.
 */
const product = computed(
  () => screen.value.revision > 0 && behaviours.value.length > 0,
)

/** The agents this run brought into existence. None existed before the brief. */
const malformed = computed(() => {
  void state.value.lastSequence
  return pilot.malformedTurns()
})

const agentsCreated = computed(
  () => state.value.nodes.filter((node) => node.name !== 'master-agent').length,
)

const selectedNode = computed<NodeView | undefined>(
  () => state.value.nodes.find((node) => node.id === selected.value) as NodeView | undefined,
)

const selectedMessages = computed(() =>
  state.value.log.filter((message) => message.id === selected.value),
)

function stopClock() {
  if (clock !== undefined) clearInterval(clock)
  clock = undefined
  // Freezes the real duration: a run shorter than the clock step would
  // otherwise show zero seconds although it lasted something.
  if (startedAt.value !== 0) now.value = Date.now()
}

// The four measured facts derive from the state, never from content.
watch(
  () => state.value.gate !== undefined,
  (reached) => {
    if (reached) gateReached()
  },
)

watch(
  () => product.value,
  (serving) => {
    if (!serving) return
    productServed()
    // Folded once, and once only: a visitor who reopens the graph keeps it
    // open, and no later event snatches it back.
    if (!graphFoldedOnce) {
      graphFoldedOnce = true
      graphOpen.value = false
    }
  },
)

// Time freezes at the end of the run, and during deliberation: a counter
// climbing on a stopped factory is a false signal.
watch(
  () => phase.value,
  (value) => {
    // Human deliberation is not factory time: the clock also stops at the gate.
    if (pilot.isDone() || value === 'Décision') stopClock()
  },
)

async function restart() {
  if (starting.value) return
  starting.value = true
  selected.value = undefined
  started.value = true
  startedAt.value = Date.now()
  now.value = startedAt.value
  stopClock()
  clock = setInterval(() => (now.value = Date.now()), 500)
  runStarted()
  await pilot.start(brief.value)
  error.value = pilot.error()
  if (error.value !== undefined) stopClock()
  starting.value = false
}

function approve() {
  if (!pilot.approve()) return
  // The decision restarts the run: time resumes where it stopped.
  startedAt.value = Date.now() - elapsedMs.value
  clock = setInterval(() => (now.value = Date.now()), 500)
}

async function reject() {
  await pilot.reject()
}

// Le fork courant : tronc + branche, deux futurs côte à côte. Absent hors fork
// — la scène normale ne bouge alors pas d'un pixel.
const fork = ref<Fork | undefined>()
// L'archive forkée et le point N, figés au moment du fork : le bandeau mesure le
// préfixe du tronc contre le flux de la branche.
const forkArchive = ref<RunArchive | undefined>()
const forkAt = ref(0)
// Le verdict du dernier remplacement de branche : rien si la version a pris, un
// mot si le code n'a pas compilé (la précédente sert toujours).
const branchNotice = ref<string | undefined>()

// La mesure d'une trace importée, lue sur son seul flux (AD-40) : les mêmes
// chiffres que le bandeau de fork, ici pour dire ce que la trace étrangère a
// fait. Absent hors import. Dépend de `lastSequence` pour se recalculer au fil
// du rejeu.
const foreignMeasure = computed(() => {
  void state.value.lastSequence
  const archive = pilot.archive()
  return archive?.origin === 'foreign' ? measureRun(archive) : undefined
})

// Forkable seulement pour un run interne. Une trace importée (`origin: 'foreign'`)
// ne porte aucun `build.source` : rien n'est recompilable, donc rien à forker ni
// à hot-swap (AD-49). On masque la porte en amont pour ne rien promettre (AD-41).
const forkable = computed(() => {
  const archive = pilot.archive()
  return archive !== undefined && archive.origin !== 'foreign'
})

// Importer une trace étrangère : la lire, la traduire, la rejouer. On ne joint
// personne — le fichier est lu côté client — et on refuse proprement ce qu'on ne
// reconnaît pas plutôt que d'afficher un run à moitié inventé.
async function onImportTrace(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // Réarmer : réimporter le même fichier doit relancer l'événement.
  if (file === undefined) return
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    error.value = "Ce fichier n'est pas un JSON lisible."
    return
  }
  const result = importTrace(parsed)
  if (isImportError(result)) {
    error.value = `Trace non importée : ${result.reason}.`
    return
  }
  error.value = undefined
  brief.value = result.brief
  started.value = true
  await pilot.replay(result)
}

async function onFork() {
  const archive = pilot.archive()
  if (archive === undefined || fork.value !== undefined) return
  try {
    forkArchive.value = archive
    forkAt.value = state.value.lastSequence
    branchNotice.value = undefined
    // `markRaw` : le Fork porte des objets vivants (kernels, stores qui gèrent
    // leur propre réactivité par des refs internes). Le rendre réactif ferait
    // « déballer » ces refs imbriquées — `branch.store.state` cesserait d'être
    // un ref et `.value` deviendrait undefined. On le garde brut.
    fork.value = markRaw(await pilot.fork(archive, forkAt.value))
  } catch (cause) {
    // Le fork n'a pas pu rendre les deux applications : on le dit plutôt que de
    // montrer un panneau vide (Block If de la story).
    error.value = `Le fork a échoué : ${cause instanceof Error ? cause.message : String(cause)}`
    fork.value = undefined
    forkArchive.value = undefined
  }
}

// L'autorité qui applique le remplacement (AD-31) : la branche seule bouge, le
// tronc jamais. Le verdict revient à ForkView par `branchNotice`.
async function onBranchReplace(edit: { name: string; code: string }) {
  const current = fork.value
  if (current === undefined) return
  const took = await current.branch.replace(edit.name, edit.code)
  branchNotice.value = took
    ? undefined
    : 'Ce code n’a pas compilé — la version précédente de la branche sert toujours.'
}

// Rejeter la branche : un teardown entier (kernel + store + session), distinct
// du rollback d'un remplacement (AD-47). Le run et le tronc restent intacts.
async function onBranchReject() {
  const current = fork.value
  fork.value = undefined
  forkArchive.value = undefined
  branchNotice.value = undefined
  await current?.branch.kernel.releaseAll()
}

// Revenir au run : on referme la vue fork, la scène normale revient.
function onForkExit() {
  fork.value = undefined
  forkArchive.value = undefined
  branchNotice.value = undefined
}

async function pickExample(key: string) {
  const found = EXAMPLES.find((example) => example.key === key)
  if (found === undefined) return
  await pilot.stop()
  brief.value = found.brief
  selected.value = undefined
  error.value = undefined
  started.value = false
  // Starting from another brief closes the current run, measurement included.
  newRun()
  pilot.store.reset()
  stopClock()
  startedAt.value = 0
  now.value = 0
}

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') selected.value = undefined
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
  // Qui l'on est, une fois. Silencieux : un service absent laisse anonyme.
  void sessionStatus().then((status) => (session.value = status))
  // Le rapport d'éval, une fois : il porte sur l'ensemble des runs conservés,
  // pas sur un run précis. On ne le lit donc PAS quand la page rejoue un run
  // partagé — le visiteur est venu voir *ce* run, pas une moyenne d'atelier —
  // sinon on afficherait des chiffres qui n'ont rien à voir avec ce qu'il
  // regarde. Silencieux aussi si le service est absent.
  if (requestedRun() === undefined) {
    void fetchEvaluation().then((report) => (evaluation.value = report))
  }
  // Probe the relay once: if it carries a key, the visitor sees real reasoning
  // without having to supply anything.
  // Un lien de rejeu prime sur tout : le visiteur est venu voir *ce* run.
  const asked = requestedRun()
  if (asked !== undefined) {
    void fetchRun(asked).then(async (archive) => {
      if (archive === undefined) {
        error.value = "Ce run n'existe plus, ou son lien est invalide."
        return
      }
      brief.value = archive.brief
      started.value = true
      await pilot.replay(archive)
    })
    return
  }

  void relayState().then((state) => {
    // Only a relay that answered can say anything about capacity. An absent
    // relay leaves it unknown rather than reporting zero, which would blame
    // the visitor for a run they never made.
    if (state.ready) capacity.value = state.runs
    const usable = state.ready && state.runs.visitor > 0 && state.runs.site > 0
    relayReady.value = usable
    if (usable && source.value === 'none') connectSiteRelay()
    // Les sources ne sont demandées que si le service répond. Sondées de
    // toute façon, elles feraient partir une requête là où la page promet de
    // ne joindre personne.
    if (!state.ready) return
    void availableSources().then((sources) => {
      wired.value = sources
      pilot.connectSources(sources, serviceFetcher())
    })
  })
})

// Le fil suit ce qui arrive : sans ça, la dernière chose dite sort de l'écran
// et il faut faire défiler pour lire un run en cours.
watch(
  () => state.value.lastSequence,
  async () => {
    await nextTick()
    const thread = threadEl.value
    if (thread !== null) thread.scrollTop = thread.scrollHeight
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  stopClock()
  void pilot.stop()
})
</script>

<template>
  <div class="app">
    <!--
      Une colonne, une conversation.
      La version d'avant empilait quatorze blocs : mode, aide au mode, connexion
      du modèle, capacité, sources, lancement, exemples, partage, lien, suite,
      incident, narration, chantier, journal. Chaque fonctionnalité s'était vu
      attribuer sa boîte, et l'écran ne disait plus quoi regarder.
      Ce qui reste : ce que les agents disent, et de quoi les faire parler. Tout
      le reste est une ligne d'état qui se déplie si on la lui demande.
    -->
    <section class="controls">
      <header class="brand">
        <span class="brand-square" aria-hidden="true"></span>
        <span class="brand-name">Memo&nbsp;Labs</span>
        <span class="brand-lab">usine agentique</span>
        <button
          class="status-toggle"
          :aria-expanded="modeHelp"
          aria-controls="status-detail"
          @click="modeHelp = !modeHelp"
        >
          {{ modeHelp ? 'masquer' : 'détail' }}
        </button>

        <!-- La connexion vit dans la ligne de marque, pas dans une zone de plus.
             Anonyme : un lien « se connecter » ; connecté : l'email et « quitter ». -->
        <span v-if="session.authenticated" class="account">
          <button class="status-toggle" :aria-expanded="runsOpen" aria-controls="my-runs" @click="toggleRuns">
            mes runs
          </button>
          <span class="account-email">{{ session.email }}</span>
          <button class="status-toggle" @click="onLogout">quitter</button>
        </span>
        <button
          v-else
          class="status-toggle account-signin"
          :aria-expanded="signInOpen"
          aria-controls="signin-panel"
          @click="signInOpen = !signInOpen"
        >
          se connecter
        </button>
      </header>

      <!-- Le panneau de connexion : un email, un lien magique. Aucun mot de passe. -->
      <form
        v-if="signInOpen && !session.authenticated"
        id="signin-panel"
        class="signin"
        @submit.prevent="onRequestLink"
      >
        <p v-if="signInSent" class="signin-sent" role="status">
          Lien envoyé. Ouvrez-le depuis votre email pour vous connecter.
        </p>
        <template v-else>
          <label class="hidden-title" for="signin-email">Votre email</label>
          <input
            id="signin-email"
            v-model="signInEmail"
            type="email"
            class="brief-field signin-field"
            placeholder="vous@equipe.co"
            autocomplete="email"
          />
          <button class="button" type="submit" :disabled="signInEmail.trim().length === 0">
            Recevoir un lien
          </button>
        </template>
      </form>

      <!-- Mes runs : lister, ouvrir, partager, mettre à la corbeille, restaurer. -->
      <div v-if="runsOpen && session.authenticated" id="my-runs" class="my-runs">
        <div class="my-runs-tabs" role="tablist">
          <button
            class="status-toggle"
            role="tab"
            :aria-selected="runsTab === 'live'"
            @click="runsTab = 'live'"
          >
            actifs ({{ myRuns.length }})
          </button>
          <button
            class="status-toggle"
            role="tab"
            :aria-selected="runsTab === 'trash'"
            @click="runsTab = 'trash'"
          >
            corbeille ({{ myTrash.length }})
          </button>
        </div>

        <ul v-if="runsTab === 'live'" class="my-runs-list">
          <li v-if="myRuns.length === 0" class="my-runs-empty">Aucun run conservé.</li>
          <li v-for="run in myRuns" :key="run.id" class="my-runs-row">
            <button class="my-runs-open" @click="openRun(run.id)">{{ run.brief || 'run' }}</button>
            <span class="my-runs-meta">{{ run.events }} évts{{ run.shared ? ' · partagé' : '' }}</span>
            <span class="my-runs-actions">
              <button class="status-toggle" @click="onToggleShare(run)">
                {{ run.shared ? 'révoquer' : 'partager' }}
              </button>
              <a class="status-toggle" :href="runExportUrl(run.id)">exporter</a>
              <button class="status-toggle" @click="onTrashRun(run.id)">corbeille</button>
            </span>
          </li>
        </ul>

        <ul v-else class="my-runs-list">
          <li v-if="myTrash.length === 0" class="my-runs-empty">Corbeille vide.</li>
          <li v-for="run in myTrash" :key="run.id" class="my-runs-row">
            <span class="my-runs-open">{{ run.brief || 'run' }}</span>
            <span class="my-runs-actions">
              <button class="status-toggle" @click="onRestoreRun(run.id)">restaurer</button>
              <button class="status-toggle" @click="onPurgeRun(run.id)">purger</button>
            </span>
          </li>
        </ul>

        <!-- Mes données (RGPD) : emporter ou effacer. L'effacement est
             irréversible et demande une confirmation explicite. -->
        <div class="my-data">
          <a class="status-toggle" :href="accountExport">exporter mes données</a>
          <template v-if="!eraseConfirm">
            <button class="status-toggle my-data-erase" @click="eraseConfirm = true">
              supprimer mon compte
            </button>
          </template>
          <template v-else>
            <span class="my-data-warn">Effacer définitivement compte et runs ?</span>
            <button class="status-toggle my-data-erase" @click="onEraseAccount">confirmer</button>
            <button class="status-toggle" @click="eraseConfirm = false">annuler</button>
          </template>
        </div>
      </div>

      <!-- Une ligne, pas cinq boîtes. Chaque fait y est un mot, et le point
           coloré dit le mode sans avoir à le lire. -->
      <p class="status" aria-live="polite">
        <span class="mode-dot" :data-connected="mode === 'llm'" aria-hidden="true"></span>
        <span>{{ mode === 'llm' ? (source === 'relay' ? 'modèle du site' : 'modèle branché') : 'run rejoué' }}</span>
        <template v-if="started">
          <span class="status-sep" aria-hidden="true">·</span>
          <span>{{ phase.toLowerCase() }}</span>
          <span class="status-sep" aria-hidden="true">·</span>
          <span>{{ state.liveAgents }} agents</span>
          <span class="status-sep" aria-hidden="true">·</span>
          <span>{{ elapsed }}</span>
          <template v-if="state.tokens.input + state.tokens.output > 0">
            <span class="status-sep" aria-hidden="true">·</span>
            <span>{{ state.tokens.input + state.tokens.output }} tokens</span>
          </template>
        </template>
        <template v-else-if="capacity">
          <span class="status-sep" aria-hidden="true">·</span>
          <span>{{ capacity.visitor }} run(s) pour vous</span>
        </template>
      </p>

      <div v-if="modeHelp" id="status-detail" class="status-detail">
        <p v-if="mode === 'llm'">
          Aucun agent n’est écrit d’avance. Un modèle{{ source === 'relay' ? ' hébergé par le site, sans clé de votre part' : '' }}
          décide lesquels existent, ce qu’ils se demandent, et le code qu’ils écrivent — puis
          l’application qu’ils posent se refait autour de ce que vous en faites, sans vous faire
          perdre votre place.
        </p>
        <p v-else>
          {{ replayReason }} Les décisions sont enregistrées et rejouées ; tout le reste est réel —
          le code est évalué dans un fil isolé, remplacé à chaud, et exécuté sur ce que vous taperez.
        </p>
        <p v-if="wired.length > 0">
          Sources branchables : {{ wired.map((s) => s.name).join(', ') }}.
        </p>
        <p v-if="malformed > 0">{{ malformed }} tour(s) rendus hors forme par le modèle.</p>
        <p v-if="measurements" class="status-eval">{{ measurements }}</p>
        <ModelSwitch
          :mode="mode"
          :source="source"
          :relay-ready="relayReady"
          @use-relay="connectSiteRelay"
          @use-key="connectKey"
          @disconnect="disconnectModel"
        />
      </div>

      <!-- La conversation. Du plus ancien au plus récent, comme on lit. -->
      <div ref="threadEl" class="thread" aria-live="polite">
        <p v-if="state.log.length === 0" class="thread-empty">
          Écrivez un besoin. Rien n’existe encore : les agents, leurs outils et l’application
          naîtront de ce que vous taperez — puis se referont autour de ce que vous en ferez.
        </p>
        <p v-for="message in state.log" :key="message.sequence" class="thread-message">
          <span class="thread-author">{{ message.author }}</span>
          {{ message.message }}
        </p>
        <p v-if="error" class="thread-incident" role="alert">{{ error }}</p>
        <p v-else-if="state.incidents.length" class="thread-incident" role="status">
          {{ state.incidents.length }} incident(s) — {{ state.incidents.at(-1)?.error.message }}
        </p>
      </div>

      <!-- Le composeur, en bas, là où l'on écrit. -->
      <div class="composer">
        <h1 class="hidden-title">L'usine agentique — l'application qui se refait sous vous</h1>
        <label class="hidden-title" for="brief">Le besoin</label>
        <textarea
          id="brief"
          v-model="brief"
          class="brief-field"
          rows="2"
          placeholder="Décrivez un besoin. L’usine n’existe pas encore."
          @keydown.meta.enter="restart"
          @keydown.ctrl.enter="restart"
        ></textarea>
        <div class="composer-row">
          <span v-if="brief.trim().length === 0 && !started" class="examples">
            <button
              v-for="example in EXAMPLES"
              :key="example.key"
              type="button"
              class="picker"
              @click="pickExample(example.key)"
            >
              {{ example.title }}
            </button>
          </span>
          <span v-else class="composer-hint">
            {{ mode === 'demo' && !briefReplayable ? 'Sans modèle branché, ce besoin ne produira rien.' : '⌘↵' }}
          </span>
          <!-- Importer une trace d'un agent étranger (LangGraph, OTLP) : elle est
               rejouée et mesurée, mais non forkable. -->
          <label class="picker import-trace">
            Importer une trace
            <input
              type="file"
              accept="application/json,.json"
              class="hidden-title"
              aria-label="Importer une trace d'agent (LangGraph ou OTLP, JSON)"
              @change="onImportTrace"
            />
          </label>
          <button class="button" :disabled="starting || brief.trim().length === 0" @click="restart">
            {{ started ? 'Relancer' : "Lancer l'usine" }}
          </button>
        </div>
      </div>
    </section>

    <main class="live" aria-label="Le run en direct">
      <!-- Deux futurs côte à côte prennent toute la scène : la vue fork vit
           dans la zone scène, jamais dans une cinquième zone. Hors fork, la
           scène normale est inchangée. -->
      <ForkView
        v-if="fork && forkArchive"
        :fork="fork"
        :archive="forkArchive"
        :at="forkAt"
        :notice="branchNotice"
        @replace="onBranchReplace"
        @reject="onBranchReject"
        @exit="onForkExit"
      />

      <!-- The panel overlays the graph, never the counters: they stay readable
           while a node is inspected. An open panel eats the bottom of the
           screen, so the graph folds above it instead of being cut by it. -->
      <div v-else class="zone" :data-panel="Boolean(product || (state.gate && !product))">
        <!-- Trace importée : on la rejoue et on la mesure, mais elle ne porte
             aucun comportement recompilable — donc pas de fork, et on le dit
             plutôt que de le laisser deviner (AD-41/AD-49). -->
        <p v-if="foreignMeasure" class="foreign-banner" role="status">
          <span class="worksite-tag">Trace importée</span>
          {{ foreignMeasure.events }} événements · {{ foreignMeasure.agents }} agents ·
          {{ foreignMeasure.served ? 'a servi une application' : "n'a pas servi d'application" }}
          — rejouable et mesurable, non forkable (agent étranger, non ré-exécutable).
        </p>

        <!-- The application is the protagonist; the graph is the evidence.
             A graph fascinates for twenty seconds, an application is used —
             so once something serves, the graph folds to the one line that
             says what it proved, and unfolds on demand. -->
        <button
          v-if="product"
          class="graph-summary"
          :aria-expanded="graphOpen"
          aria-controls="live-graph"
          @click="graphOpen = !graphOpen"
        >
          <span class="worksite-tag">Chantier</span>
          {{ agentsCreated }} agents · {{ state.replacements }} remplacement(s) à chaud ·
          {{ state.restarts }} redémarrage
          <span class="graph-summary-more">{{ graphOpen ? 'replier' : 'voir le graphe' }}</span>
        </button>

        <LiveGraph
          v-show="graphOpen"
          id="live-graph"
          :state="state"
          :layout="layout"
          :selected="selected"
          :built="built"
          @select="selected = selected === $event ? undefined : $event"
        />

        <!-- The two now coexist, and they must. The gate used to replace the
             product because the product only existed after a decision; since
             the application serves during the run, hiding the gate behind it
             would make the decision unreachable. The gate sits above what it
             decides the fate of. -->
        <HumanGate
          v-if="state.gate && state.gate.decision === undefined"
          :gate="state.gate"
          :serving="product"
          @approve="approve"
          @reject="reject"
        />

        <LiveApplication
          v-if="product"
          :archive="Boolean(pilot.archive())"
          :replay="pilot.isReplay()"
          :forkable="forkable"
          :sharing="sharing"
          :share-link="shareLink"
          @share="shareRun"
          @take-away="takeAway"
          @fork="onFork"
          :behaviours="behaviours"
          :screen="screen"
          :session="pilot.session()"
          :pulse="state.lastSequence"
          :contact="CONTACT"
          @interaction="onVisitorInteraction"
        />

        <NodePanel
          v-if="selectedNode"
          :node="selectedNode"
          :messages="selectedMessages"
          @close="selected = undefined"
        />
      </div>
    </main>
  </div>
</template>
