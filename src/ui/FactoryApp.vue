<script setup lang="ts">
// The shell: two panes, 100vh, the page never scrolls.
// Everything that makes the run live is in the pilot, outside this component:
// that is what makes the wiring testable without a browser.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { fetchRun, linkFor, requestedRun, storeRun } from '../app/archive-client'
import { fetchEvaluation, formatEvaluation, type Evaluation } from '../app/eval-client'
import type { Interaction } from '../app/session'
import { takeawayHtml, takeawayOf } from '../app/takeaway'
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
        <UButton
          variant="link"
          color="neutral"
          :aria-expanded="modeHelp"
          aria-controls="status-detail"
          data-status-toggle
          @click="modeHelp = !modeHelp"
        >
          {{ modeHelp ? 'masquer' : 'détail' }}
        </UButton>

        <!-- La connexion vit dans la ligne de marque, pas dans une zone de plus.
             Anonyme : un lien « se connecter » ; connecté : l'email et « quitter ». -->
        <span v-if="session.authenticated" class="account">
          <UButton
            variant="link"
            color="neutral"
            :aria-expanded="runsOpen"
            aria-controls="my-runs"
            data-runs-toggle
            @click="toggleRuns"
          >
            mes runs
          </UButton>
          <span class="account-email">{{ session.email }}</span>
          <UButton variant="link" color="neutral" data-logout @click="signOut">quitter</UButton>
        </span>
        <UButton
          v-else
          variant="link"
          color="neutral"
          class="account-signin"
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
        class="signin"
        @submit.prevent="requestSignInLink"
      >
        <p v-if="signInSent" class="signin-sent" role="status">
          Lien envoyé. Ouvrez-le depuis votre email pour vous connecter.
        </p>
        <template v-else>
          <label class="hidden-title" for="signin-email">Votre email</label>
          <UInput
            id="signin-email"
            v-model="signInEmail"
            type="email"
            class="signin-field w-full"
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
      <div v-if="runsOpen && session.authenticated" id="my-runs" class="my-runs">
        <!-- Deux onglets, avec leur vrai contrat : chaque onglet nomme le
             panneau qu'il commande, un seul est tabulable, les flèches
             circulent. C'était un `role="tablist"` sans panneau ni
             `aria-controls`. -->
        <UTabs v-model="runsTab" :items="runsTabs" class="my-runs-tabs">
          <template #live>
            <ul class="my-runs-list">
              <li v-if="myRuns.length === 0" class="my-runs-empty">Aucun run conservé.</li>
              <li v-for="run in myRuns" :key="run.id" class="my-runs-row">
                <UButton variant="link" color="neutral" class="my-runs-open" data-run-open @click="openRun(run.id)">
                  {{ run.brief || 'run' }}
                </UButton>
                <span class="my-runs-meta">{{ run.events }} évts{{ run.shared ? ' · partagé' : '' }}</span>
                <span class="my-runs-actions">
                  <UButton variant="link" color="neutral" data-run-share @click="onToggleShare(run)">
                    {{ run.shared ? 'révoquer' : 'partager' }}
                  </UButton>
                  <UButton variant="link" color="neutral" :to="runExportUrl(run.id)" external data-run-export>
                    exporter
                  </UButton>
                  <UButton variant="link" color="neutral" data-run-trash @click="onTrashRun(run.id)">
                    corbeille
                  </UButton>
                </span>
              </li>
            </ul>
          </template>

          <template #trash>
            <ul class="my-runs-list">
              <li v-if="myTrash.length === 0" class="my-runs-empty">Corbeille vide.</li>
              <li v-for="run in myTrash" :key="run.id" class="my-runs-row">
                <span class="my-runs-open">{{ run.brief || 'run' }}</span>
                <span class="my-runs-actions">
                  <UButton variant="link" color="neutral" data-run-restore @click="onRestoreRun(run.id)">
                    restaurer
                  </UButton>
                  <UButton variant="link" color="neutral" data-run-purge @click="onPurgeRun(run.id)">
                    purger
                  </UButton>
                </span>
              </li>
            </ul>
          </template>
        </UTabs>

        <!-- Mes données (RGPD) : emporter ou effacer. L'effacement est
             irréversible et demande une confirmation explicite. -->
        <div class="my-data">
          <UButton variant="link" color="neutral" :to="accountExport" external data-account-export>
            exporter mes données
          </UButton>
          <template v-if="!eraseConfirm">
            <UButton
              variant="link"
              color="error"
              class="my-data-erase"
              data-account-erase
              @click="eraseConfirm = true"
            >
              supprimer mon compte
            </UButton>
          </template>
          <template v-else>
            <span class="my-data-warn">Effacer définitivement compte et runs ?</span>
            <UButton
              variant="link"
              color="error"
              class="my-data-erase"
              data-account-erase-confirm
              @click="eraseAccountForGood"
            >
              confirmer
            </UButton>
            <UButton variant="link" color="neutral" data-account-erase-cancel @click="eraseConfirm = false">
              annuler
            </UButton>
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
          @connect-relay="connectSiteRelay"
          @connect-key="connectKey"
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
        <UTextarea
          id="brief"
          v-model="brief"
          class="brief-field w-full"
          :rows="2"
          placeholder="Décrivez un besoin. L’usine n’existe pas encore."
          data-brief
          @keydown.meta.enter="restart"
          @keydown.ctrl.enter="restart"
        />
        <div class="composer-row">
          <!-- Le site sans clé ne peut rien inventer : une seule entrée rejoue
               le run enregistré, pour qu'il ne soit pas muet. Rien de jargon
               n'est exposé — le libellé du besoin reste caché. -->
          <UButton
            v-if="mode === 'demo' && !started"
            type="button"
            variant="outline"
            color="neutral"
            class="recorded-run"
            data-recorded-run
            @click="playRecordedRun"
          >
            Voir un run enregistré
          </UButton>
          <span class="composer-hint">
            {{ mode === 'demo' && brief.trim().length > 0 && !briefReplayable ? 'Sans modèle branché, ce besoin ne produira rien.' : '⌘↵' }}
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
          <UButton
            :disabled="starting || brief.trim().length === 0"
            data-launch
            @click="restart"
          >
            {{ started ? 'Relancer' : "Lancer l'usine" }}
          </UButton>
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
        @replace="replaceOnBranch"
        @reject="rejectBranch"
        @exit="exitFork"
      />

      <!-- Avant tout run, la scène n'est pas un vide blanc : elle dit ce que
           fait l'atelier, en trois temps. C'est du cadrage statique — pas un
           faux graphe, pas un squelette de progression — et il disparaît dès que
           le run démarre. -->
      <section v-else-if="!started" class="intro" aria-label="Ce que fait l'atelier">
        <p class="intro-eyebrow">L'atelier</p>
        <h2 class="intro-title">Rejoue la trajectoire d'un agent, forke-la, teste le correctif avant la prod.</h2>
        <ol class="intro-beats">
          <li class="intro-beat">
            <span class="intro-beat-num">1</span>
            <span class="intro-beat-text"><strong>Décris un besoin.</strong> Rien n'existe encore : des agents naissent, se parlent et écrivent l'application en direct.</span>
          </li>
          <li class="intro-beat">
            <span class="intro-beat-num">2</span>
            <span class="intro-beat-text"><strong>Regarde-la se faire.</strong> Le graphe montre qui existe et ce qui se remplace à chaud ; une porte humaine valide ou rejette.</span>
          </li>
          <li class="intro-beat">
            <span class="intro-beat-num">3</span>
            <span class="intro-beat-text"><strong>Forke la timeline.</strong> Change l'agent sur la branche et regarde deux futurs diverger côte à côte — pour tester un correctif sur la vraie trajectoire qui a planté.</span>
          </li>
        </ol>
        <p class="intro-honesty">Le retour arrière est intra-runtime : il prévient avant un effet externe, il ne le répare pas après.</p>
      </section>

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
