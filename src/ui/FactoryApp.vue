<script setup lang="ts">
// The shell: two panes, 100vh, the page never scrolls.
// Everything that makes the run live is in the pilot, outside this component:
// that is what makes the wiring testable without a browser.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPilot } from '../orchestration/pilot'
import { CONTACT } from '../examples'
import { demoReasoner, DEMO_BRIEF } from '../examples/demo'
import type { NodeView } from '../state/model'
import LiveGraph from './LiveGraph.vue'
import NodePanel from './NodePanel.vue'
import HumanGate from './HumanGate.vue'
import LiveApplication from './LiveApplication.vue'
import ForkView from './ForkView.vue'
import ModelSwitch from './ModelSwitch.vue'
import MyRuns from './MyRuns.vue'
import StatusLine from './StatusLine.vue'
import RunConversation from './RunConversation.vue'
import RunComposer from './RunComposer.vue'
import { fetchRun, linkFor, requestedRun, storeRun } from '../app/archive-client'
import { fetchEvaluation, formatEvaluation, type Evaluation } from '../app/eval-client'
import type { Interaction } from '../app/session'
import { takeawayHtml, takeawayOf } from '../app/takeaway'
import { count } from '../app/plural'
import { gateReached, productServed, runStarted, checkSubmitted } from '../telemetry'
import { useFork } from './composables/useFork'
import { useTraceImport } from './composables/useTraceImport'
import { useModelSource } from './composables/useModelSource'
import { useAccount } from './composables/useAccount'
import { useMyRuns } from './composables/useMyRuns'

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
// Trois blocs sortis du shell, chacun avec sa propre raison d'exister : d'où
// vient le raisonnement, qui est le visiteur, et ce qu'il a gardé. Ils ne se
// parlent que par la session — un compte qui se ferme vide la liste tout seul.
const {
  mode,
  source,
  relayReady,
  wired,
  capacity,
  replayReason,
  connectSiteRelay,
  connectKey,
  disconnectModel,
  probeRelay,
} = useModelSource(pilot, (message) => (error.value = message))

const {
  session,
  signInOpen,
  signInEmail,
  signInSent,
  accountExport,
  eraseConfirm,
  requestSignInLink,
  signOut,
  eraseAccountForGood,
  loadSession,
} = useAccount((message) => (error.value = message))

const {
  runsOpen,
  runsTab,
  myRuns,
  myTrash,
  runsTabs,
  runExportUrl,
  toggleRuns,
  openRun,
  trash: onTrashRun,
  restore: onRestoreRun,
  purge: onPurgeRun,
  toggleShare: onToggleShare,
} = useMyRuns(session)

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


const replacementsSaid = computed(() =>
  count(state.value.replacements, 'remplacement à chaud', 'remplacements à chaud'),
)

const restartsSaid = computed(() =>
  count(state.value.restarts, 'redémarrage', 'redémarrages'),
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

// Le fork et l'import de trace : deux blocs entiers, chacun avec ses propres
// modes d'échec, qui n'ont besoin que du pilote et d'un endroit où dire ce qui
// n'a pas marché.
const { fork, forkArchive, forkAt, branchNotice, startFork, replaceOnBranch, rejectBranch, exitFork } =
  useFork(pilot, (message) => (error.value = message))

const { foreignMeasure, forkable, importFromFileEvent } = useTraceImport(
  pilot,
  () => state.value.lastSequence,
  (message) => (error.value = message),
)

async function onImportTrace(event: Event) {
  const imported = await importFromFileEvent(event)
  if (imported === undefined) return
  brief.value = imported.brief
  started.value = true
}

async function onFork() {
  await startFork(state.value.lastSequence)
}

// Le site sans clé n'a rien à taper qui produise un run : le modèle est ce qui
// fait naître les agents. Plutôt qu'un champ mort, une seule entrée rejoue le
// run enregistré — le seul besoin que la démo sait rejouer — sans exposer au
// visiteur le libellé jargon qui le déclenche.
async function playRecordedRun() {
  brief.value = DEMO_BRIEF
  await restart()
}

onMounted(() => {
  void loadSession()
  // Le rapport d'éval, une fois : il porte sur l'ensemble des runs conservés,
  // pas sur un run précis. On ne le lit donc PAS quand la page rejoue un run
  // partagé — le visiteur est venu voir *ce* run, pas une moyenne d'atelier —
  // sinon on afficherait des chiffres qui n'ont rien à voir avec ce qu'il
  // regarde. Silencieux aussi si le service est absent.
  if (requestedRun() === undefined) {
    void fetchEvaluation().then((report) => (evaluation.value = report))
  }
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

  // Probe the relay once: if it carries a key, the visitor sees real reasoning
  // without having to supply anything.
  void probeRelay()
})

onBeforeUnmount(() => {
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
      <header class="flex items-center gap-2 px-5 py-4">
        <span class="size-4 shrink-0 rounded-sm bg-primary" aria-hidden="true"></span>
        <span class="shrink-0 text-sm font-semibold text-highlighted">Memo&nbsp;Labs</span>
        <span class="hidden whitespace-nowrap text-sm text-muted lg:inline">usine agentique</span>
        <UButton
          variant="link"
          color="neutral"
          size="xs"
          class="ml-auto shrink-0"
          :aria-expanded="modeHelp"
          aria-controls="status-detail"
          data-status-toggle
          @click="modeHelp = !modeHelp"
        >
          {{ modeHelp ? 'masquer' : 'détail' }}
        </UButton>

        <!-- La connexion vit dans la ligne de marque, pas dans une zone de plus.
             Anonyme : un lien « se connecter » ; connecté : l'email et « quitter ». -->
        <span v-if="session.authenticated" class="account flex shrink-0 items-center gap-1">
          <UButton
            variant="link"
            color="neutral"
            size="xs"
            :aria-expanded="runsOpen"
            aria-controls="my-runs"
            data-runs-toggle
            @click="toggleRuns"
          >
            mes runs
          </UButton>
          <span class="account-email truncate text-xs text-muted">{{ session.email }}</span>
          <UButton variant="link" color="neutral" size="xs" data-logout @click="signOut">quitter</UButton>
        </span>
        <UButton
          v-else
          variant="link"
          color="neutral"
          class="account-signin shrink-0"
          size="xs"
          :aria-expanded="signInOpen"
          aria-controls="signin-panel"
          data-signin-toggle
          @click="signInOpen = !signInOpen"
        >
          se connecter
        </UButton>
      </header>

      <!-- Le panneau de connexion : un email, un lien magique. Aucun mot de passe. -->
      <form
        v-if="signInOpen && !session.authenticated"
        id="signin-panel"
        class="signin flex flex-col gap-2 border-b border-default px-5 pb-4"
        @submit.prevent="requestSignInLink"
      >
        <p v-if="signInSent" class="text-sm text-muted" role="status">
          Lien envoyé. Ouvrez-le depuis votre email pour vous connecter.
        </p>
        <template v-else>
          <label class="hidden-title" for="signin-email">Votre email</label>
          <UInput
            id="signin-email"
            v-model="signInEmail"
            type="email"
            class="w-full"
            placeholder="vous@equipe.co"
            autocomplete="email"
            data-signin-email
          />
          <UButton type="submit" :disabled="signInEmail.trim().length === 0" data-signin-submit>
            Recevoir un lien
          </UButton>
        </template>
      </form>

      <!-- Mes runs : lister, ouvrir, partager, mettre à la corbeille, restaurer. -->
      <MyRuns
        v-if="runsOpen && session.authenticated"
        v-model:tab="runsTab"
        :runs="myRuns"
        :trash="myTrash"
        :tabs="runsTabs"
        :export-url-for="runExportUrl"
        :account-export="accountExport"
        :erase-confirm="eraseConfirm"
        @open="openRun"
        @share="onToggleShare"
        @trash-run="onTrashRun"
        @restore="onRestoreRun"
        @purge="onPurgeRun"
        @erase="eraseAccountForGood"
        @update:erase-confirm="eraseConfirm = $event"
      />

      <StatusLine
        :mode="mode"
        :source="source"
        :started="started"
        :phase="phase"
        :live-agents="state.liveAgents"
        :elapsed="elapsed"
        :tokens="state.tokens.input + state.tokens.output"
        :capacity="capacity"
        :open="modeHelp"
        :replay-reason="replayReason"
        :wired="wired"
        :malformed="malformed"
        :measurements="measurements"
      >
        <template #model>
          <ModelSwitch
            :mode="mode"
            :source="source"
            :relay-ready="relayReady"
            @connect-relay="connectSiteRelay"
            @connect-key="connectKey"
            @disconnect="disconnectModel"
          />
        </template>
      </StatusLine>

      <!-- La conversation. Du plus ancien au plus récent, comme on lit. -->
      <RunConversation
        :log="state.log"
        :incidents="state.incidents"
        :error="error"
        :last-sequence="state.lastSequence"
      />

      <!-- Le composeur, en bas, là où l'on écrit. -->
      <RunComposer
        v-model="brief"
        :mode="mode"
        :started="started"
        :starting="starting"
        :replayable="briefReplayable"
        @launch="restart"
        @play-recorded="playRecordedRun"
        @import-trace="onImportTrace"
      />
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
        @replace="replaceOnBranch"
        @reject="rejectBranch"
        @exit="exitFork"
      />

      <!-- Avant tout run, la scène n'est pas un vide blanc : elle dit ce que
           fait l'atelier, en trois temps. C'est du cadrage statique — pas un
           faux graphe, pas un squelette de progression — et il disparaît dès que
           le run démarre. -->
      <section
        v-else-if="!started"
        class="intro mx-auto flex h-full max-w-[54ch] flex-col justify-center gap-5 px-8 py-12"
        aria-label="Ce que fait l'atelier"
      >
        <p class="text-xs uppercase tracking-wide text-muted">L'atelier</p>
        <h2 class="text-3xl/tight font-semibold tracking-tight text-highlighted text-balance">Rejoue la trajectoire d'un agent, forke-la, teste le correctif avant la prod.</h2>
        <ol class="flex flex-col gap-4">
          <li class="grid grid-cols-[1.5rem_1fr] items-start gap-3">
            <span class="flex size-6 items-center justify-center rounded-full bg-elevated text-xs text-toned">1</span>
            <span class="text-toned"><strong>Décris un besoin.</strong> Rien n'existe encore : des agents naissent, se parlent et écrivent l'application en direct.</span>
          </li>
          <li class="grid grid-cols-[1.5rem_1fr] items-start gap-3">
            <span class="flex size-6 items-center justify-center rounded-full bg-elevated text-xs text-toned">2</span>
            <span class="text-toned"><strong>Regarde-la se faire.</strong> Le graphe montre qui existe et ce qui se remplace à chaud ; une porte humaine valide ou rejette.</span>
          </li>
          <li class="grid grid-cols-[1.5rem_1fr] items-start gap-3">
            <span class="flex size-6 items-center justify-center rounded-full bg-elevated text-xs text-toned">3</span>
            <span class="text-toned"><strong>Forke la timeline.</strong> Change l'agent sur la branche et regarde deux futurs diverger côte à côte — pour tester un correctif sur la vraie trajectoire qui a planté.</span>
          </li>
        </ol>
        <p class="mt-1 border-t border-default pt-4 text-sm text-muted">Le retour arrière est intra-runtime : il prévient avant un effet externe, il ne le répare pas après.</p>
      </section>

      <!-- The panel overlays the graph, never the counters: they stay readable
           while a node is inspected. An open panel eats the bottom of the
           screen, so the graph folds above it instead of being cut by it. -->
      <div v-else class="zone" :data-panel="Boolean(product || (state.gate && !product))">
        <!-- Trace importée : on la rejoue et on la mesure, mais elle ne porte
             aucun comportement recompilable — donc pas de fork, et on le dit
             plutôt que de le laisser deviner (AD-41/AD-49). -->
        <p
          v-if="foreignMeasure"
          class="flex flex-wrap items-center gap-2 border-b border-default px-5 py-3 text-xs text-muted"
          data-foreign-banner
          role="status"
        >
          <span class="text-xs uppercase tracking-wide text-muted">Trace importée</span>
          <span class="text-dimmed" aria-hidden="true">·</span>
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
          class="flex w-full flex-wrap items-center gap-2 border-b border-default px-5 py-2 text-left text-xs text-muted tabular-nums hover:bg-muted"
          data-graph-summary
          :aria-expanded="graphOpen"
          aria-controls="live-graph"
          @click="graphOpen = !graphOpen"
        >
          <span class="text-xs uppercase tracking-wide text-muted">Chantier</span>
          <span class="text-dimmed" aria-hidden="true">·</span>
          {{ replacementsSaid }} · {{ restartsSaid }}
          <span class="ml-auto text-primary">{{ graphOpen ? 'replier' : 'voir le graphe' }}</span>
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
        <Transition name="sheet">
          <HumanGate
            v-if="state.gate && state.gate.decision === undefined"
          :gate="state.gate"
            :serving="product"
            @approve="approve"
            @reject="reject"
          />
        </Transition>

        <Transition name="sheet">
          <LiveApplication
            v-if="product"
          :archive="Boolean(pilot.archive())"
          :replay="pilot.isReplay()"
          :forkable="forkable"
          :docked="!graphOpen"
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
        </Transition>

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
