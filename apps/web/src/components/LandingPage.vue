<script setup lang="ts">
/**
 * The public page: what a signed-out visitor sees (MEM-83, rewritten on
 * 16 November 2026, redrawn on 17 November 2026 with the design system in
 * DESIGN.md).
 *
 * The first screen shows the product at work instead of describing it: the
 * real run of 16 November, summed up as three agents on their threads that
 * knot into the gate, on the colour-field ground. Every line comes from that
 * run (public/visite/run.json); the visit replays it in full. Below, the carnet
 * lists what production really broke the day it went live, each fix with its
 * test. The page calls no model and no authenticated route.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SIGN_IN_URL } from '../chat/session'
import AgentLane from './AgentLane.vue'

defineProps<{ unreachable?: boolean }>()
defineEmits<{ retry: [] }>()

/*
 * Motion (standard-2026, micro-motion). One expressive moment: when the run
 * comes into view, each thread draws, each agent's steps arrive one by one (the
 * three agents in parallel, as in the real run), the threads knot, the gate
 * settles. The carnet's entries rise into place as they are reached. Without
 * JavaScript, an IntersectionObserver or with reduced motion, everything is
 * simply there: the motion only ever starts from a visible page.
 */
const runEl = ref<HTMLElement | null>(null)
const carnetEl = ref<HTMLElement | null>(null)
const motion = ref(false)
const playing = ref(false)
let observer: IntersectionObserver | undefined

onMounted(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof IntersectionObserver === 'undefined') return
  motion.value = true
  observer = new IntersectionObserver(
    (seen) => {
      for (const entry of seen) {
        if (!entry.isIntersecting) continue
        if (entry.target === runEl.value) playing.value = true
        else entry.target.classList.add('is-visible')
        observer?.unobserve(entry.target)
      }
    },
    { threshold: 0.25 },
  )
  if (runEl.value) observer.observe(runEl.value)
  carnetEl.value?.querySelectorAll('.entry').forEach((el) => observer?.observe(el))
})
onBeforeUnmount(() => observer?.disconnect())

const REPO = 'https://github.com/guillaume-flambard/usine'

/**
 * The three agents of the run of 17 November 2026 (thread WkkmutTlh5Aaqgfd), in
 * the supervisor's order. Every line is an event of public/visite/run.json: the
 * part the supervisor gave, the GitHub calls the agent made, its time. Two
 * agents read and report; the third finds no contribution guide and proposes
 * one ticket, which stops at the gate: nothing was written.
 */
const LANES = [
  {
    thread: 'sky',
    name: 'Agent 1',
    status: 'terminé en 10 s',
    seconds: 10.2,
    steps: [
      { text: 'reçoit sa part : lire le README pour un nouveau contributeur', done: true },
      { text: 'lit', code: 'README.md', after: 'avec get_file_contents', done: true },
      { text: 'rend l’installation et les commandes, sans rien proposer', done: true },
    ],
  },
  {
    thread: 'mag',
    name: 'Agent 2',
    status: 'terminé en 11 s',
    seconds: 10.7,
    steps: [
      { text: 'reçoit sa part : lire la configuration de la CI', done: true },
      { text: 'lit', code: '.github/workflows/verify.yml', done: true },
      { text: 'rend les déclencheurs et les étapes, sans rien proposer', done: true },
    ],
  },
  {
    thread: 'grn',
    name: 'Agent 3',
    status: 'terminé en 22 s',
    seconds: 22.4,
    steps: [
      { text: 'reçoit sa part : chercher un guide de contribution', done: true },
      { text: 'lit trois fois le dépôt : aucun', code: 'CONTRIBUTING.md', done: true },
      { text: 'propose', code: 'issue_write', after: ', arrêté à la porte', done: false },
    ],
  },
] as const
/**
 * The animation keeps the log's timing (checklist L6): the three agents start
 * together, and each one's last step lands in the order they really finished,
 * one second of the run played as 40 ms.
 */
const FIRST_DONE = Math.min(...LANES.map((lane) => lane.seconds))
const finishDelay = (seconds: number) => `${Math.round((seconds - FIRST_DONE) * 40)}ms`

const RUN_LOG = '/visite/run.json'
const README = `${REPO}/blob/main/README.md`
const CI = `${REPO}/blob/main/.github/workflows/verify.yml`

/** What the day of going live really broke, and the fix. Each has its test. */
const ENTRIES = [
  {
    topic: 'Les outils',
    text: 'En production, l’agent ne trouvait pas sa liste d’outils autorisés : elle était cherchée au mauvais endroit dans l’image. Corrigé, et un test vérifie le chemin.',
  },
  {
    topic: 'Le démarrage',
    text: 'Le correctif a fait tomber le service : l’image ne pouvait pas lire sa propre configuration. Retour arrière en une commande, puis droits corrigés et testés.',
  },
  {
    topic: 'La lecture',
    text: 'GitHub renvoie un fichier dans un format que l’agent jetait : il disait le fichier illisible. Il le lit maintenant, et un test le prouve.',
  },
  {
    topic: 'Les pannes',
    text: 'Un seul appel trop lent arrêtait tout le travail. Un agent en panne dit maintenant pourquoi, et les autres continuent.',
  },
]
</script>

<template>
  <div class="landing ground-field" data-landing>
    <div class="container">
      <header id="top">
        <nav class="nav" aria-label="Principale">
          <a class="brand" href="#top" aria-label="Usine, accueil">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <path class="s-sky" d="M4.6 2.4C4.6 8.6 7.6 11.4 10.4 13.6" />
              <path class="s-mag" d="M12 2.4V13" />
              <path class="s-grn" d="M19.4 2.4C19.4 8.6 16.4 11.4 13.6 13.6" />
              <circle class="f-ink" cx="12" cy="16.4" r="4.6" />
              <path class="s-ink" d="M12 21v1.8" />
            </svg>
            Usine
          </a>
          <ul>
            <li class="wide-only"><a href="/visite">La visite</a></li>
            <li><a :href="REPO">Le code</a></li>
            <li><a :href="SIGN_IN_URL" data-nav-sign-in>Se connecter</a></li>
          </ul>
        </nav>
      </header>

      <main id="main">
        <section class="hero" aria-labelledby="t-hero">
          <h1 id="t-hero">Trois agents enquêtent. Rien ne part sans vous.</h1>
          <p class="lede">
            Usine est mon atelier d’agents IA, en Vue. Ils lisent un vrai projet avec de vrais
            outils, et une personne décide avant toute action qui sort.
          </p>
          <div v-if="unreachable" class="actions">
            <p class="alert" role="alert" data-sign-in-error>
              Le service ne répond pas pour l’instant.
            </p>
            <button type="button" class="btn btn-line" data-retry @click="$emit('retry')">
              <UIcon
                name="i-lucide-rotate-ccw"
                class="size-4 nudge-spin"
                aria-hidden="true"
              />Réessayer
            </button>
          </div>
          <div v-else class="actions">
            <a class="btn btn-ink" href="/visite" data-visit-button>
              <UIcon name="i-lucide-play" class="size-4 nudge-x" aria-hidden="true" />Voir un vrai
              run, sans compte
            </a>
            <a class="btn btn-line" :href="SIGN_IN_URL" data-sign-in-button>
              <UIcon name="i-lucide-log-in" class="size-4 nudge-x" aria-hidden="true" />Se connecter
            </a>
          </div>
          <p v-if="!unreachable" class="door">
            La visite rejoue ce run en une minute, sans compte. L’atelier lui-même est réservé à mon
            compte.
          </p>
        </section>

        <section
          ref="runEl"
          class="run"
          :class="{ 'is-playing': playing }"
          :data-motion="motion || undefined"
          aria-labelledby="t-run"
          data-landing-run
        >
          <h2 id="t-run" class="question">
            Un nouveau contributeur peut-il démarrer sur ce dépôt&nbsp;?
          </h2>
          <p class="caption">
            Le vrai run du 17 novembre 2026 sur
            <span class="mono">guillaume-flambard/usine</span>, résumé depuis son journal. En 13 s,
            le chef d’équipe a partagé la question entre trois agents, qui ont travaillé en même
            temps, chacun sur sa source.
          </p>

          <div class="lanes">
            <AgentLane
              v-for="lane in LANES"
              :key="lane.name"
              :thread="lane.thread"
              :name="lane.name"
              :status="lane.status"
              :steps="[...lane.steps]"
              :style="{ '--finish': finishDelay(lane.seconds) }"
            />
          </div>

          <svg class="knot" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 0 C50 36 150 28 150 64" class="s-sky" pathLength="1" />
            <path d="M150 0 L150 64" class="s-mag" pathLength="1" />
            <path d="M250 0 C250 36 150 28 150 64" class="s-grn" pathLength="1" />
          </svg>

          <section class="gate" aria-labelledby="t-gate">
            <h3 id="t-gate" class="gate-title">La porte</h3>
            <p class="gate-what">
              Une seule proposition attend ici : ouvrir un ticket sur
              <span class="mono">guillaume-flambard/usine</span>. Telle qu’elle partirait :
            </p>
            <dl class="payload">
              <dt>Titre</dt>
              <dd>Ajouter un guide de contribution (CONTRIBUTING.md)</dd>
              <dt>Corps</dt>
              <dd>
                Le dépôt ne dispose actuellement d’aucun guide de contribution : aucun fichier
                <span class="mono">CONTRIBUTING.md</span> à la racine, aucune documentation dédiée
                dans <span class="mono">docs/</span>, aucune section « Contribuer » dans le README…
              </dd>
            </dl>
            <p class="rule">
              <strong>Irréversible à partir d’ici.</strong> Une personne approuve, corrige ou
              rejette ; tant qu’elle n’a rien dit, rien ne part. Revenir en arrière restaure l’état
              du run, pas le monde : un ticket publié ne se retire pas.
            </p>
            <a class="btn btn-on-ink" href="/visite">
              <UIcon name="i-lucide-play" class="size-4 nudge-x" aria-hidden="true" />Rejouer ce run
            </a>
          </section>

          <dl class="ledger" aria-label="Ce que ce run établit">
            <div>
              <dt>Vérifié</dt>
              <dd>
                le README et la CI ont été lus par l’outil GitHub, et le dépôt n’a pas de
                <span class="mono">CONTRIBUTING.md</span>
              </dd>
            </div>
            <div>
              <dt>Supposé</dt>
              <dd>ce qu’un guide devrait contenir : le ticket le propose, une personne le relit</dd>
            </div>
            <div>
              <dt>Non fait</dt>
              <dd>aucun ticket n’a été ouvert : le run s’est arrêté à la porte</dd>
            </div>
          </dl>
          <p class="proof">
            Les preuves :
            <a :href="README">le README</a>, <a :href="CI">la CI</a>,
            <a :href="RUN_LOG">le journal du run</a>
            (<span class="mono">WkkmutTlh5Aaqgfd</span>), <a :href="REPO">le code</a>.
          </p>
        </section>

        <section
          id="carnet"
          ref="carnetEl"
          class="block"
          :data-motion="motion || undefined"
          aria-labelledby="t-carnet"
        >
          <h2 id="t-carnet">Carnet de mise en production</h2>
          <p class="intro">
            Le 16 novembre 2026, j’ai mis Usine en ligne et joué le parcours sur le vrai site. Les
            tests passaient, et pourtant voici ce qui a cassé. Chaque correction a son test.
          </p>
          <div class="entries">
            <article
              v-for="(entry, i) in ENTRIES"
              :key="entry.topic"
              class="entry"
              :style="{ '--i': i }"
            >
              <h3>{{ entry.topic }}</h3>
              <p>{{ entry.text }}</p>
            </article>
          </div>
        </section>
      </main>
    </div>

    <footer class="foot">
      <div class="container foot-row">
        <span>Usine, l’atelier d’agents de Guillaume Flambard, Memo Labs</span>
        <span>Vue 3, Nuxt UI, LangGraph, serveur MCP de GitHub</span>
        <a :href="REPO">github.com/guillaume-flambard/usine</a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  color: var(--color-ink);
}
.container {
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding-inline: var(--gutter);
}
.s-sky {
  stroke: var(--color-sky);
}
.s-mag {
  stroke: var(--color-mag);
}
.s-grn {
  stroke: var(--color-grn);
}
.s-ink {
  stroke: var(--color-ink);
}
.f-ink {
  fill: var(--color-ink);
}
.brand path {
  fill: none;
  stroke-width: 2.3;
  stroke-linecap: round;
}
h1,
h2,
h3 {
  margin: 0;
  text-wrap: balance;
}
p {
  margin: 0;
  text-wrap: pretty;
}

/* Navigation */
.nav {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-height: 72px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 44px;
  color: var(--color-ink);
  font: 600 var(--text-lg) / 1 var(--font-sans);
  text-decoration: none;
}
.nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
}
.nav ul a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-pill);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  text-decoration: none;
  transition:
    background-color var(--dur-short) var(--ease-out),
    color var(--dur-short) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .nav ul a:hover {
    background: var(--color-surface);
    color: var(--color-ink);
  }
}
.brand svg {
  transition: transform var(--dur-short) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .brand:hover svg {
    transform: rotate(-8deg);
  }
}

/* Hero: short headline, one line, one action. */
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 44rem;
  padding: var(--space-2xl) 0 var(--space-xl);
}
h1 {
  font: 600 clamp(2.25rem, 3.4vw + 1rem, 3.75rem) / 1.05 var(--font-sans);
  letter-spacing: var(--tracking-display);
}
.lede {
  max-width: 38rem;
  color: var(--color-ink-2);
  font-size: var(--text-lead);
  line-height: 1.5;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}
.door {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.alert {
  width: 100%;
  color: var(--color-error);
}

/* The run: three lanes, their threads knotting into the gate. */
.run {
  padding: clamp(24px, 4vw, 56px);
  border-radius: var(--radius-card);
  background: oklch(100% 0 0 / 0.42);
  box-shadow:
    var(--shadow-2),
    0 0 0 1px oklch(100% 0 0 / 0.6);
}
.question {
  max-width: 26ch;
  font: 400 var(--text-question) / 1.1 var(--font-voice);
  letter-spacing: -0.01em;
}
.caption {
  max-width: 68ch;
  margin: var(--space-sm) 0 var(--space-xl);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.lanes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}
.knot {
  display: block;
  width: 100%;
  height: 64px;
  overflow: visible;
}
.knot path {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.gate {
  max-width: 46rem;
  margin: 0 auto;
  padding: var(--space-xl) clamp(20px, 3vw, 40px) clamp(20px, 3vw, 32px);
  border-radius: var(--radius-card);
  background: var(--color-ink);
  color: var(--color-on-ink);
  box-shadow: var(--shadow-ink);
}
.gate-title {
  font: 400 var(--text-2xl) / 1.1 var(--font-voice);
}
.gate-what {
  margin: var(--space-xs) 0 var(--space-lg);
  color: var(--color-on-ink-2);
  font-size: var(--text-sm);
}
.payload {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-xs) var(--space-lg);
  margin: 0;
  font-size: var(--text-sm);
}
.payload dt {
  color: var(--color-on-ink-2);
}
.payload dd {
  margin: 0;
}
.payload .mono {
  font-size: 0.86rem;
}
.rule {
  margin: var(--space-lg) 0 var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid oklch(40% 0.01 264);
  color: var(--color-on-ink-2);
  font-size: var(--text-sm);
}
.rule strong {
  color: var(--color-on-ink);
  font-weight: 600;
}
/* Its border must read on the ink: 3:1 at least (checklist D2). */
.btn-on-ink {
  border-color: oklch(70% 0.01 264);
  background: transparent;
  color: var(--color-on-ink);
}
@media (hover: hover) and (pointer: fine) {
  .btn-on-ink:hover {
    background: var(--color-ink-hover);
    border-color: oklch(85% 0.006 264);
  }
}

/* What the run establishes, then the proof as links (checklist L8, L9). */
.ledger {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
  max-width: 46rem;
  margin: var(--space-xl) auto 0;
  font-size: var(--text-sm);
}
.ledger div {
  padding-top: var(--space-sm);
  border-top: 1px solid oklch(80% 0.012 240);
}
.ledger dt {
  font-weight: 600;
}
.ledger dd {
  margin: var(--space-2xs) 0 0;
  color: var(--color-ink-2);
  line-height: 1.5;
}
.proof {
  max-width: 46rem;
  margin: var(--space-lg) auto 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.proof a {
  color: var(--color-ink);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  transition: text-decoration-color var(--dur-short) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .proof a:hover {
    text-decoration-color: var(--color-sky);
  }
}
.gate :focus-visible {
  outline-color: var(--color-on-ink);
}

/* Carnet */
.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-3xl) 0 var(--space-2xl);
}
.block h2 {
  font: 600 var(--text-xl) / 1.2 var(--font-sans);
  letter-spacing: -0.02em;
}
.intro {
  max-width: 44rem;
  color: var(--color-ink-2);
  line-height: 1.55;
}
.entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-xs);
}
.entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-lg);
  border-radius: var(--radius-in);
  background: var(--color-surface);
  box-shadow:
    var(--shadow-1),
    0 0 0 1px var(--color-rule);
}
.entry h3 {
  font: 600 var(--text-md) / 1.3 var(--font-sans);
}
.entry p {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.foot {
  padding: var(--space-lg) 0;
  border-top: 1px solid oklch(85% 0.012 240);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.foot-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-xs) var(--space-md);
}
.foot a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-ink);
}

/* The signature: the run tells itself once, when it comes into view, on the
   log's timing (checklist L6). The three threads draw together (the agents
   started together), their first two steps follow every 260 ms, each last step
   lands in the order the agents really finished (--finish), the threads knot
   at 1.5 s over --dur-signature, the gate settles at 1.9 s. Only clip-path,
   opacity, transform and stroke-dashoffset move. Before playing,
   [data-motion] holds the start state; without it (no JS, reduced motion)
   nothing is ever hidden. */
.run[data-motion] .lane::before {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 420ms var(--ease-out);
}
.run[data-motion] :deep(.trace li) {
  --at: calc(320ms + var(--step) * 260ms);
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 300ms var(--ease-out) var(--at),
    transform 300ms var(--ease-out) var(--at);
}
.run[data-motion] :deep(.trace li:last-child) {
  --at: calc(840ms + var(--finish));
}
.run[data-motion] :deep(.trace li)::after {
  clip-path: inset(0 0 100% 0);
  transition: clip-path 260ms var(--ease-out) var(--at);
}
.run[data-motion] .knot path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset var(--dur-signature) var(--ease-in-out) 1500ms;
}
.run[data-motion] .gate,
.run[data-motion] .ledger,
.run[data-motion] .proof {
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 400ms var(--ease-out) 1900ms,
    transform 400ms var(--ease-out) 1900ms;
}
.run[data-motion] .ledger,
.run[data-motion] .proof {
  transition-delay: 2100ms;
}
.run[data-motion].is-playing .lane::before,
.run[data-motion].is-playing :deep(.trace li)::after {
  clip-path: inset(0);
}
.run[data-motion].is-playing :deep(.trace li),
.run[data-motion].is-playing .gate,
.run[data-motion].is-playing .ledger,
.run[data-motion].is-playing .proof {
  opacity: 1;
  transform: none;
}
.run[data-motion].is-playing .knot path {
  stroke-dashoffset: 0;
}

/* The carnet's entries rise into place as they are reached, 60 ms apart. */
.block[data-motion] .entry {
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 360ms var(--ease-out) calc(var(--i) * 60ms),
    transform 360ms var(--ease-out) calc(var(--i) * 60ms);
}
.block[data-motion] .entry.is-visible {
  opacity: 1;
  transform: none;
}

@media (max-width: 60rem) {
  .lanes,
  .entries {
    grid-template-columns: 1fr;
  }
  /* One column on a phone: the three threads still knot into the gate,
     narrower, instead of disappearing (standard-2026, guided replay). */
  .knot {
    width: 40%;
    margin-inline: auto;
  }
}
@media (max-width: 40rem) {
  /* The primary action already leads to the visit: the nav keeps one line. */
  .wide-only {
    display: none;
  }
  /* Phone: the two actions stacked at full width (checklist L11). */
  .actions .btn {
    flex: 1 1 100%;
    justify-content: center;
  }
  .ledger {
    grid-template-columns: 1fr;
  }
  .payload {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .payload dd {
    margin-bottom: var(--space-xs);
  }
}
</style>
