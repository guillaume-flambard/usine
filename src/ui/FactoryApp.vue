<script setup lang="ts">
// The shell: two panes, 100vh, the page never scrolls.
// Everything that makes the run live is in the pilot, outside this component:
// that is what makes the wiring testable without a browser.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPilot } from '../orchestration/pilot'
import { CONTACT, EXAMPLES } from '../examples'
import { DEMO_BRIEF, demoReasoner } from '../examples/demo'
import type { NodeView } from '../state/model'
import LiveGraph from './LiveGraph.vue'
import NodePanel from './NodePanel.vue'
import HumanGate from './HumanGate.vue'
import DeliveredProduct from './DeliveredProduct.vue'
import ModelSwitch, { type ModelSource } from './ModelSwitch.vue'
import { relayAvailable, relayReasoner } from '../runtime/reasoner/relay'
import type { ReasoningOrigin } from '../runtime/reasoner'
import { gateReached, newRun, payoffShown, runStarted, checkSubmitted } from '../telemetry'

const pilot = createPilot()
// With no model, the factory can invent nothing. Rather than a blank screen it
// replays prepared answers — and the screen never pretends otherwise.
pilot.connect(demoReasoner())
const state = pilot.store.state

const brief = ref(DEMO_BRIEF)

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
const mode = ref<ReasoningOrigin>(pilot.reasoningMode())
const source = ref<ModelSource>('none')
const relayReady = ref(false)

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

/** The run's product: a function published under a name nobody had chosen. */
const product = computed(() => {
  void state.value.lastSequence
  return pilot.product()
})

/** The agents this run brought into existence. None existed before the brief. */
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
  () => product.value !== undefined,
  (delivered) => {
    if (delivered) payoffShown()
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
  // Probe the relay once: if it carries a key, the visitor sees real reasoning
  // without having to supply anything.
  void relayAvailable().then((ready) => {
    relayReady.value = ready
    if (ready && source.value === 'none') connectSiteRelay()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  stopClock()
  void pilot.stop()
})
</script>

<template>
  <div class="app">
    <section class="controls">
      <header class="brand">
        <span class="brand-square" aria-hidden="true"></span>
        <span class="brand-name">Memo&nbsp;Labs</span>
        <span class="brand-lab">Lab · usine agentique</span>
      </header>

      <div class="mode">
        <span class="mode-dot" :data-connected="mode === 'llm'" aria-hidden="true"></span>
        <span>{{
          mode === 'llm'
            ? source === 'relay'
              ? 'Modèle du site — run vivant'
              : 'Modèle branché — run vivant'
            : 'Démonstration rejouée'
        }}</span>
        <button
          class="mode-help"
          :aria-expanded="modeHelp"
          aria-controls="mode-explanation"
          @click="modeHelp = !modeHelp"
        >
          {{ modeHelp ? 'masquer' : "qu'est-ce que ça veut dire ?" }}
        </button>
      </div>
      <p v-if="modeHelp" id="mode-explanation" class="mode-explanation">
        <template v-if="mode === 'llm'">
          Aucun agent n’est écrit d’avance. Un modèle{{
            source === 'relay' ? ' hébergé par le site, sans clé de votre part' : ''
          }}
          décide lesquels existent, ce qu’ils se demandent, et le code des outils qu’ils écrivent.
          Le graphe que vous voyez n’a jamais existé avant votre besoin.
        </template>
        <template v-else>
          Aucun modèle n’est branché. Les décisions des agents — qui existe, qui interroge qui, le
          code des outils — sont <strong>préparées d’avance</strong> et rejouées. Tout le reste est
          réel : les agents naissent, se parlent, et le code est évalué puis exécuté sur ce que vous
          taperez. Branchez un modèle pour un run que personne n’a préparé.
        </template>
      </p>
      <div class="mode-connect">
        <ModelSwitch
          :mode="mode"
          :source="source"
          :relay-ready="relayReady"
          @connect-key="connectKey"
          @connect-relay="connectSiteRelay"
          @disconnect="disconnectModel"
        />
      </div>

      <div class="pane">
        <h1 class="hidden-title">L'usine agentique — du besoin au produit</h1>
        <label class="eyebrow" for="brief">Le besoin — l'usine n'existe pas encore</label>
        <textarea id="brief" v-model="brief" class="brief-field"></textarea>
        <!-- A need the demo cannot replay will produce nothing: saying so
             before the click beats an empty graph. -->
        <p v-if="mode === 'demo' && !briefReplayable" class="worksite-summary">
          <span class="worksite-tag">Note</span>
          Ce besoin n’est pas celui de la démonstration. Sans modèle branché, l’usine n’aura rien à
          faire naître.
        </p>

        <div class="action-row">
          <button class="button" :disabled="starting" @click="restart">
            <span aria-hidden="true">▶</span>
            {{ started ? "Relancer l'usine" : "Lancer l'usine" }}
          </button>
          <select
            class="picker"
            value=""
            aria-label="Partir d'un exemple"
            @change="pickExample(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Partir d'un exemple…</option>
            <option v-for="example in EXAMPLES" :key="example.key" :value="example.key">
              {{ example.title }}
            </option>
          </select>
        </div>

        <p v-if="error" class="incident" role="alert">{{ error }}</p>
        <p v-else-if="state.incidents.length" class="incident" role="status">
          {{ state.incidents.length }} incident(s) —
          {{ state.incidents[state.incidents.length - 1]?.error.message }}
        </p>

        <p class="narration" :class="{ 'narration-empty': !state.narration }" aria-live="polite">
          {{ state.narration?.message ?? "L'usine attend un brief." }}
        </p>

        <!-- The worksite is the only thing that explains the graph: it did not
             exist before the brief, and it differs from one brief to the next. -->
        <p v-if="agentsCreated > 0" class="worksite-summary">
          <span class="worksite-tag">Chantier</span>
          {{ agentsCreated }} agents créés pendant ce run · aucun n'existait avant votre besoin
        </p>

        <div class="thread">
          <p
            v-for="message in [...state.log].reverse()"
            :key="message.sequence"
            class="thread-message"
          >
            <span class="thread-author">{{ message.author }}</span>
            <span class="thread-sequence">#{{ message.sequence }}</span>
            <br />
            {{ message.message }}
          </p>
        </div>
      </div>
    </section>

    <main class="live" aria-label="Le run en direct">
      <div class="counters">
        <div class="counter">
          <p class="counter-key">Agents</p>
          <p class="counter-value">{{ state.liveAgents }}</p>
        </div>
        <div class="counter">
          <p class="counter-key">Phase</p>
          <p class="counter-value small">{{ phase }}</p>
        </div>
        <div class="counter">
          <p class="counter-key">Tokens</p>
          <p class="counter-value">{{ state.tokens.input + state.tokens.output }}</p>
          <p class="counter-note">
            <!-- The label follows what was actually spent, not the current
                 mode: disconnecting after a run does not erase the spend. -->
            {{
              state.tokens.input + state.tokens.output > 0
                ? `${state.tokens.input} entrée · ${state.tokens.output} sortie`
                : mode === 'demo'
                  ? 'aucun, démonstration rejouée'
                  : 'aucun, aucun modèle branché'
            }}
          </p>
        </div>
        <div class="counter">
          <p class="counter-key">Temps</p>
          <p class="counter-value">{{ elapsed }}</p>
        </div>
      </div>

      <!-- The panel overlays the graph, never the counters: they stay readable
           while a node is inspected. An open panel eats the bottom of the
           screen, so the graph folds above it instead of being cut by it. -->
      <div class="zone" :data-panel="Boolean(product || (state.gate && !product))">
        <LiveGraph
          :state="state"
          :layout="layout"
          :selected="selected"
          :built="built"
          @select="selected = selected === $event ? undefined : $event"
        />

        <!-- Both occupy the same bottom of the screen: the delivered product
             takes the gate's place once the decision is made. -->
        <HumanGate
          v-if="state.gate && !product"
          :gate="state.gate"
          @approve="approve"
          @reject="reject"
        />

        <DeliveredProduct
          v-if="product"
          :run="product.run"
          :name="product.name"
          :contact="CONTACT"
          @submitted="checkSubmitted"
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
