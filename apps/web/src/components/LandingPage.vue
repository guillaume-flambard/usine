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
import { SIGN_IN_URL } from '../chat/session'

defineProps<{ unreachable?: boolean }>()
defineEmits<{ retry: [] }>()

const REPO = 'https://github.com/guillaume-flambard/usine'

/**
 * The three agents of the run of 16 November, in the supervisor's order. Each
 * line is an event of public/visite/run.json: the subtask the supervisor gave,
 * the GitHub tools the agent called, and its time. Each agent proposed an issue
 * and stopped at the gate: nothing was written.
 */
const LANES = [
  {
    thread: 'sky',
    name: 'Agent 1',
    task: 'lire deployment/README.md et en restituer l’essentiel',
    status: 'terminé en 25 s',
  },
  {
    thread: 'mag',
    name: 'Agent 2',
    task: 'expliquer pourquoi la production ne se mettait plus à jour',
    status: 'terminé en 26 s',
  },
  {
    thread: 'grn',
    name: 'Agent 3',
    task: 'rédiger une issue complète pour suivre le problème',
    status: 'terminé en 24 s',
  },
] as const

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
              <UIcon name="i-lucide-rotate-ccw" class="size-4" aria-hidden="true" />Réessayer
            </button>
          </div>
          <div v-else class="actions">
            <a class="btn btn-ink" href="/visite" data-visit-button>
              <UIcon name="i-lucide-play" class="size-4" aria-hidden="true" />Voir un vrai run, sans
              compte
            </a>
            <a class="btn btn-line" :href="SIGN_IN_URL" data-sign-in-button>
              <UIcon name="i-lucide-log-in" class="size-4" aria-hidden="true" />Se connecter
            </a>
          </div>
          <p v-if="!unreachable" class="door">
            La visite rejoue ce run en une minute, sans compte. L’atelier lui-même est réservé à mon
            compte.
          </p>
        </section>

        <section class="run" aria-labelledby="t-run" data-landing-run>
          <h2 id="t-run" class="question">
            Pourquoi la production ne se mettait plus à jour&nbsp;?
          </h2>
          <p class="caption">
            Le vrai run du 16 novembre 2026 sur
            <span class="mono">guillaume-flambard/usine</span>, résumé depuis son journal. En 22 s,
            le chef d’équipe a partagé la question entre trois agents, qui ont travaillé en même
            temps.
          </p>

          <div class="lanes">
            <section
              v-for="lane in LANES"
              :key="lane.name"
              class="lane"
              :data-thread="lane.thread"
              :aria-label="`${lane.name}, ${lane.status}`"
            >
              <h3 class="agent">{{ lane.name }}</h3>
              <p class="status">{{ lane.status }}</p>
              <ol class="trace">
                <li class="done">
                  <span>reçoit sa part : {{ lane.task }}</span>
                </li>
                <li class="done">
                  <span>lit le dépôt avec <span class="mono">get_file_contents</span></span>
                </li>
                <li>
                  <span>propose <span class="mono">issue_write</span>, arrêté à la porte</span>
                </li>
              </ol>
            </section>
          </div>

          <svg class="knot" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 0 C50 36 150 28 150 64" class="s-sky" />
            <path d="M150 0 L150 64" class="s-mag" />
            <path d="M250 0 C250 36 150 28 150 64" class="s-grn" />
          </svg>

          <section class="gate" aria-labelledby="t-gate">
            <h3 id="t-gate" class="gate-title">La porte</h3>
            <p class="gate-what">
              Trois propositions d’issue sur <span class="mono">guillaume-flambard/usine</span>
              attendent ici. La première, telle qu’elle partirait :
            </p>
            <dl class="payload">
              <dt>Titre</dt>
              <dd>Déploiement bloqué : verify.yml ne se déclenche plus sur push vers main</dd>
              <dt>Étiquettes</dt>
              <dd class="mono">bug, deployment, production, ci/cd</dd>
              <dt>Corps</dt>
              <dd>
                La production de usine.memolabs.dev ne se met plus à jour depuis le 2 novembre 2026.
                Le commit <span class="mono">f52872e</span>…
              </dd>
            </dl>
            <p class="rule">
              Une personne approuve, corrige ou rejette. Tant qu’elle n’a rien dit, rien ne part.
            </p>
            <a class="btn btn-on-ink" href="/visite">
              <UIcon name="i-lucide-play" class="size-4" aria-hidden="true" />Rejouer ce run
            </a>
          </section>
        </section>

        <section id="carnet" class="block" aria-labelledby="t-carnet">
          <h2 id="t-carnet">Carnet de mise en production</h2>
          <p class="intro">
            Le 16 novembre 2026, j’ai mis Usine en ligne et joué le parcours sur le vrai site. Les
            tests passaient, et pourtant voici ce qui a cassé. Chaque correction a son test.
          </p>
          <div class="entries">
            <article v-for="entry in ENTRIES" :key="entry.topic" class="entry">
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
}
@media (hover: hover) {
  .nav ul a:hover {
    background: var(--color-surface);
    color: var(--color-ink);
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
  margin: var(--space-sm) 0 var(--space-xl);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.lanes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}
.lane {
  position: relative;
  padding: var(--space-lg) var(--space-lg) var(--space-md);
  border-radius: var(--radius-in);
  background: var(--color-surface);
  box-shadow:
    var(--shadow-1),
    0 0 0 1px var(--color-rule);
}
/* The thread: the lane's top edge, in its agent's colour. */
.lane::before {
  content: '';
  position: absolute;
  top: 0;
  right: var(--space-lg);
  left: var(--space-lg);
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--t);
}
.agent {
  font: 400 var(--text-xl) / 1.15 var(--font-voice);
}
.status {
  margin: 2px 0 var(--space-md);
  color: var(--tt);
  font-size: var(--text-sm);
  font-weight: 500;
}
/* The thread runs down the trace: one knot per event, a dashed segment for
   what is still pending. */
.trace {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--color-rule);
  list-style: none;
}
.trace li {
  position: relative;
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-rule);
  font-size: var(--text-sm);
  line-height: 1.45;
}
.trace li:last-child {
  padding-bottom: var(--space-2xs);
  border-bottom: 0;
}
.trace li::before {
  content: '';
  position: relative;
  z-index: 1;
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border: 2px solid var(--t);
  border-radius: 50%;
  background: var(--color-surface);
}
.trace li.done::before {
  background: var(--t);
}
.trace li::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  background: var(--t);
}
.trace li:first-child::after {
  top: calc(var(--space-sm) + 10px);
}
.trace li:last-child::after {
  bottom: auto;
  height: calc(var(--space-sm) + 5px);
}
.trace li:not(.done)::after {
  background: repeating-linear-gradient(180deg, var(--t) 0 4px, transparent 4px 7px);
}
.trace .mono {
  color: var(--color-ink-2);
  font-size: 0.92em;
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
.btn-on-ink {
  border-color: oklch(45% 0.01 264);
  background: transparent;
  color: var(--color-on-ink);
}
@media (hover: hover) {
  .btn-on-ink:hover {
    background: var(--color-ink-hover);
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

@media (max-width: 60rem) {
  .lanes,
  .entries {
    grid-template-columns: 1fr;
  }
  .knot {
    display: none;
  }
  .gate {
    margin-top: var(--space-lg);
  }
}
@media (max-width: 40rem) {
  /* The primary action already leads to the visit: the nav keeps one line. */
  .wide-only {
    display: none;
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
