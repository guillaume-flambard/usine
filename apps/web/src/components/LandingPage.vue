<script setup lang="ts">
/**
 * The public page (MEM-83, drawn as "Le fil" in MEM-86): what a signed-out
 * visitor sees. The atelier itself is closed without a Pocket ID session; this
 * page calls no model and no authenticated route.
 *
 * The hero's threads and the journal are a static illustration of one real
 * run, the 2 November case (PRODUCT.md, "Operating Context"). The primary
 * action is the public visit (/visite), a recorded run replayed with no
 * account: visitors used to stop at the sign-in (16 November 2026).
 */
import { SIGN_IN_URL } from '../chat/session'

defineProps<{ unreachable?: boolean }>()
defineEmits<{ retry: [] }>()

const REPO = 'https://github.com/guillaume-flambard/usine'

interface Lane {
  thread: string
  icon: string
  name: string
  facts: string[]
  events: {
    at: string
    tool: string
    plain?: boolean
    text: string
    code?: string[]
    r?: string
    gated?: boolean
  }[]
}

/** The 2 November run, fil par fil: times from the start of the run. */
const LANES: Lane[] = [
  {
    thread: 'sup',
    icon: 'i-lucide-split',
    name: 'Superviseur',
    facts: ['3 transmissions', '1,2 s'],
    events: [
      {
        at: '00:00,4',
        tool: 'plan',
        plain: true,
        text: 'Trois pistes : la CI, la chaîne de déploiement, la configuration des services.',
      },
      {
        at: '00:01,2',
        tool: 'transmission',
        plain: true,
        text: 'Chaque piste part à son spécialiste, en parallèle.',
        r: '×3',
      },
    ],
  },
  {
    thread: 'sky',
    icon: 'i-lucide-circle-check',
    name: 'CI',
    facts: ['2 fichiers', '6 488 jetons', '9,8 s'],
    events: [
      {
        at: '00:01,9',
        tool: 'get_file_contents',
        text: '',
        code: ['.github/workflows/verify.yml'],
        r: 'ligne 7',
      },
      { at: '00:04,1', tool: 'get_file_contents', text: '', code: ['package.json'] },
      { at: '00:06,3', tool: 'list_issues', text: 'Issues ouvertes, aucune sur la CI.', r: '0' },
      {
        at: '00:11,7',
        tool: 'constat',
        plain: true,
        text: 'verify.yml ne se lance plus qu’à la main depuis f52872e.',
      },
    ],
  },
  {
    thread: 'mag',
    icon: 'i-lucide-package',
    name: 'Déploiement',
    facts: ['1 fichier', '1 recherche', '7,3 s'],
    events: [
      { at: '00:02,0', tool: 'get_file_contents', text: '', code: ['deployment/README.md'] },
      { at: '00:05,2', tool: 'search_issues', text: '« builder » dans le dépôt.', r: '0' },
      {
        at: '00:09,3',
        tool: 'constat',
        plain: true,
        text: 'Le builder ne construit main qu’après un run verify réussi, déclenché par un push.',
      },
    ],
  },
  {
    thread: 'grn',
    icon: 'i-lucide-sliders-horizontal',
    name: 'Configuration',
    facts: ['1 fichier', '6,1 s'],
    events: [
      { at: '00:02,1', tool: 'get_file_contents', text: '', code: ['compose.yaml'] },
      {
        at: '00:08,2',
        tool: 'constat',
        plain: true,
        text: 'Les services sont décrits comme avant : rien à corriger de ce côté.',
      },
    ],
  },
  {
    thread: 'amb',
    icon: 'i-lucide-merge',
    name: 'Synthèse',
    facts: ['1,6 s'],
    events: [
      {
        at: '00:12,4',
        tool: 'synthèse',
        plain: true,
        text: 'La CI ne part plus, le builder attend une CI qui ne viendra pas.',
      },
      { at: '00:14,0', tool: 'issue_write', text: 'Proposée, arrêtée avant l’envoi.', gated: true },
    ],
  },
]

/** The carnet: what real runs broke, and what was fixed. Each defect has its test. */
const ENTRIES = [
  {
    topic: 'client MCP',
    text: 'Le client MCP n’avait jamais parlé à un vrai serveur : il ne lisait pas les réponses SSE. Corrigé, testé contre un serveur qui parle comme GitHub.',
  },
  {
    topic: 'porte humaine',
    text: 'La porte humaine ne pouvait pas s’ouvrir sur un vrai run : aucun outil n’était marqué irréversible. Branchée sur issue_write.',
  },
  {
    topic: 'fork',
    text: 'Un fork pris après ma décision relançait l’action approuvée. Refusé désormais, test de non-régression ajouté.',
  },
  {
    topic: 'budget',
    text: 'Le budget d’un agent ne tenait pas la lecture d’un vrai fichier (6 488 jetons pour 4 000). Relevé, réponse toujours plafonnée.',
  },
]

const THREADS = [
  { thread: 'sky', name: 'CI', say: 'Ciel, le trait et le texte' },
  { thread: 'mag', name: 'Déploiement', say: 'Magenta, le trait et le texte' },
  { thread: 'grn', name: 'Configuration', say: 'Vert, le trait et le texte' },
  { thread: 'amb', name: 'Synthèse', say: 'Ambre, le trait et le texte' },
  { thread: 'ink', name: 'Porte', say: 'Encre, l’humain' },
]
</script>

<template>
  <div class="landing" data-landing>
    <svg width="0" height="0" class="defs" aria-hidden="true">
      <defs>
        <symbol id="usine-logo" viewBox="0 0 24 24">
          <path class="s-sky" d="M4.6 2.4C4.6 8.6 7.6 11.4 10.4 13.6" />
          <path class="s-mag" d="M12 2.4V13" />
          <path class="s-grn" d="M19.4 2.4C19.4 8.6 16.4 11.4 13.6 13.6" />
          <circle class="f-ink" cx="12" cy="16.4" r="4.6" />
          <path class="s-ink" d="M12 21v1.8" />
        </symbol>
      </defs>
    </svg>

    <div class="container">
      <header id="top">
        <nav class="nav" aria-label="Principale">
          <a class="brand" href="#top" aria-label="Usine, accueil">
            <svg width="28" height="28" aria-hidden="true"><use href="#usine-logo" /></svg>Usine
          </a>
          <ul>
            <li><a href="#journal">Comment ça marche</a></li>
            <li><a href="#carnet">Carnet</a></li>
            <li><a :href="REPO">Code source</a></li>
            <li><a :href="SIGN_IN_URL" data-nav-sign-in>Se connecter</a></li>
          </ul>
        </nav>
      </header>

      <main id="main">
        <section class="hero" aria-labelledby="t-hero">
          <div>
            <h1 id="t-hero">Mes agents enquêtent. <span class="voice">Je décide.</span></h1>
            <p class="lede">
              Usine, mon atelier d’agents ouvert&#8239;: rien n’en sort sans mon accord.
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
                <UIcon name="i-lucide-play" class="size-4" aria-hidden="true" />Voir un vrai run,
                sans compte
              </a>
              <a class="btn btn-line" :href="SIGN_IN_URL" data-sign-in-button>
                <UIcon name="i-lucide-log-in" class="size-4" aria-hidden="true" />Se connecter
              </a>
            </div>
            <p v-if="!unreachable" class="door">
              La visite rejoue un run réel, enregistré : rien n’en sort. L’atelier lui-même est
              réservé aux comptes du lab.
            </p>
          </div>
          <figure class="fil">
            <svg
              class="wide"
              viewBox="0 0 700 540"
              role="img"
              aria-label="Diagramme du run : les fils de quatre agents, CI, Déploiement, Configuration et Synthèse, se nouent dans un nœud noir, la porte humaine, qui demande : J’ouvre cette issue ?"
            >
              <text class="who who-sky" x="90" y="36" text-anchor="middle">CI</text>
              <text class="who who-mag" x="300" y="36" text-anchor="middle">Déploiement</text>
              <text class="who who-grn" x="510" y="36" text-anchor="middle">Configuration</text>
              <text class="who who-amb" x="150" y="262" text-anchor="end">Synthèse</text>
              <path class="thread s-sky" d="M90 52C90 250 280 250 290 400" />
              <path class="thread s-mag" d="M300 52V400" />
              <path class="thread s-grn" d="M510 52C510 250 320 250 310 400" />
              <path class="thread s-amb" d="M164 256C250 256 296 300 296 400" />
              <path class="pulse s-surface" pathLength="100" d="M90 52C90 250 280 250 290 400" />
              <path class="pulse s-surface d2" pathLength="100" d="M300 52V400" />
              <path
                class="pulse s-surface d3"
                pathLength="100"
                d="M510 52C510 250 320 250 310 400"
              />
              <path
                class="pulse s-surface d4"
                pathLength="100"
                d="M164 256C250 256 296 300 296 400"
              />
              <circle class="f-ink" cx="300" cy="424" r="30" />
              <path class="thread s-ink" d="M300 452V500" stroke-width="3" />
              <text class="q" x="352" y="438">J’ouvre cette issue&#8239;?</text>
              <text class="cap" x="354" y="476">Le run du 2 nov. 2026, 17:20.</text>
            </svg>
            <svg
              class="narrow"
              viewBox="0 0 343 270"
              role="img"
              aria-label="Diagramme du run : les fils de quatre agents, CI, Déploiement, Configuration et Synthèse, se nouent dans un nœud noir, la porte humaine, qui demande : J’ouvre cette issue ?"
            >
              <text class="who who-sky" x="22" y="18" text-anchor="middle">CI</text>
              <text class="who who-mag" x="150" y="18" text-anchor="middle">Déploiement</text>
              <text class="who who-grn" x="286" y="18" text-anchor="middle">Configuration</text>
              <text class="who who-amb" x="62" y="134" text-anchor="end">Synthèse</text>
              <path class="thread s-sky" d="M22 28C22 140 142 130 145 196" />
              <path class="thread s-mag" d="M150 28V196" />
              <path class="thread s-grn" d="M286 28C286 140 158 130 155 196" />
              <path class="thread s-amb" d="M70 129C120 129 148 156 148 196" />
              <circle class="f-ink" cx="150" cy="212" r="20" />
              <path class="thread s-ink" d="M150 230V262" stroke-width="3" />
              <text class="q q-s" x="182" y="208">J’ouvre</text>
              <text class="q q-s" x="182" y="236">cette issue&#8239;?</text>
            </svg>
          </figure>
        </section>

        <section id="journal" class="block" aria-labelledby="t-journal">
          <div class="head">
            <h2 id="t-journal">Le journal, fil par fil</h2>
            <p>
              Le 2 novembre, la production de l’usine a cessé de se mettre à jour. Voici le run qui
              a cherché pourquoi. Chaque agent garde son fil, et les temps sont comptés depuis le
              début du run, comme dans l’archive qui le rejoue.
            </p>
          </div>
          <div class="journal">
            <div class="jhead">
              <strong>Pourquoi la production ne bouge plus&#8239;?</strong>
              <span>lancé le 2 nov. 2026 à 17:20</span>
            </div>
            <div v-for="lane in LANES" :key="lane.name" class="lane" :data-thread="lane.thread">
              <div class="lane-h">
                <h3>
                  <UIcon :name="lane.icon" class="size-4" aria-hidden="true" />{{ lane.name }}
                </h3>
                <ul class="facts">
                  <li v-for="fact in lane.facts" :key="fact">{{ fact }}</li>
                </ul>
              </div>
              <ol>
                <li v-for="(ev, i) in lane.events" :key="i" class="ev">
                  <time>{{ ev.at }}</time>
                  <span class="tool" :class="{ plain: ev.plain }">{{ ev.tool }}</span>
                  <span class="txt">
                    <code v-for="c in ev.code ?? []" :key="c">{{ c }}</code>{{ ev.text }}
                  </span>
                  <span v-if="ev.gated" class="gated">
                    <UIcon name="i-lucide-lock" class="size-3" aria-hidden="true" />porte
                  </span>
                  <span v-else class="r">{{ ev.r ?? '' }}</span>
                </li>
              </ol>
            </div>
            <div class="lane human" data-thread="ink">
              <div class="lane-h">
                <h3>
                  <svg width="20" height="20" aria-hidden="true"><use href="#usine-logo" /></svg
                  >Porte humaine
                </h3>
              </div>
              <ol>
                <li class="ev">
                  <time>00:14,1</time>
                  <span class="tool plain">interrupt</span>
                  <span class="txt">J’ouvre cette issue&#8239;? Le graphe attend ma décision.</span>
                  <span class="r" />
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section id="carnet" class="block-l" aria-labelledby="t-carnet">
          <div class="carnet">
            <div class="carnet-intro">
              <h2 id="t-carnet">Carnet d’atelier</h2>
              <p>
                Ce que les vrais runs ont cassé, et ce que j’ai réparé. Chaque défaut a son test.
              </p>
              <p class="sig">Guillaume</p>
            </div>
            <div class="entries">
              <article v-for="entry in ENTRIES" :key="entry.topic" class="entry">
                <div class="when">
                  <time datetime="2026-11-16">16 nov. 2026</time><span>{{ entry.topic }}</span>
                </div>
                <p>{{ entry.text }}</p>
              </article>
            </div>
          </div>
        </section>
      </main>
    </div>

    <section class="band" aria-labelledby="t-sys">
      <div class="container">
        <div class="legend">
          <div class="legend-mark">
            <h2 id="t-sys">Le fil, en une feuille</h2>
            <p class="lede">
              Chaque agent possède un fil de couleur. Tous se nouent dans la porte, qui est noire
              parce que c’est moi.
            </p>
            <div class="knot-big">
              <svg
                width="240"
                height="240"
                role="img"
                aria-label="Le nœud, le logo d’Usine : trois fils de couleur noués dans un point noir"
              >
                <use href="#usine-logo" />
              </svg>
              <span class="lockup">Usine</span>
            </div>
          </div>
          <div>
            <h3 class="visually-hidden">Les fils</h3>
            <dl class="threads">
              <div v-for="t in THREADS" :key="t.thread" :data-thread="t.thread">
                <dt>{{ t.name }}</dt>
                <dd>{{ t.say }}</dd>
              </div>
            </dl>
            <div class="voices">
              <h3>Deux voix</h3>
              <dl>
                <div>
                  <dt>Onest<br /><span>interface, texte, les machines</span></dt>
                  <dd class="say-m">Chaque piste part à son spécialiste, en parallèle.</dd>
                </div>
                <div>
                  <dt>JetBrains Mono<br /><span>données seulement</span></dt>
                  <dd class="say-d"><code>get_file_contents, 6 488 jetons, 9,8 s</code></dd>
                </div>
                <div>
                  <dt>Instrument Serif<br /><span>ma voix, et elle seule</span></dt>
                  <dd class="say-h">Je décide.</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>

    <footer class="container">
      <div class="foot-row">
        <a class="brand" href="#top" aria-label="Usine, accueil">
          <svg width="20" height="20" aria-hidden="true"><use href="#usine-logo" /></svg>Usine
        </a>
        <span>L’atelier d’agents de Guillaume Flambard, Memo Labs</span>
        <ul aria-label="La pile">
          <li>LangGraph pour l’orchestration</li>
          <li>MCP GitHub sous liste blanche</li>
          <li>Langfuse pour chaque appel</li>
          <li>Vue 3 au front</li>
        </ul>
        <a :href="REPO">github.com/guillaume-flambard/usine</a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  background: var(--color-paper);
  color: var(--color-ink);
}
.defs {
  position: absolute;
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
.s-amb {
  stroke: var(--color-amb);
}
.s-ink {
  stroke: var(--color-ink);
}
.s-surface {
  stroke: var(--color-surface);
}
.f-ink {
  fill: var(--color-ink);
}
symbol path {
  fill: none;
  stroke-width: 2.3;
  stroke-linecap: round;
}
.container {
  width: 100%;
  max-width: var(--container);
  margin-inline: auto;
  padding-inline: var(--gutter);
}
a:not(.btn) {
  color: inherit;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.16em;
}
h1,
h2,
h3 {
  margin: 0;
  overflow-wrap: break-word;
  text-wrap: balance;
}
p {
  margin: 0;
  text-wrap: pretty;
}

/* nav */
.nav {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  min-height: 76px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  border-radius: var(--radius-key);
  color: var(--color-ink);
  font: 600 1.25rem / 1 var(--font-sans);
  letter-spacing: -0.02em;
  text-decoration: none;
}
.nav ul {
  display: flex;
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
  white-space: nowrap;
  transition:
    background-color var(--dur-short) var(--ease-out),
    color var(--dur-short) var(--ease-out);
}
.nav ul a:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}

/* hero */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 11fr) minmax(0, 13fr);
  gap: var(--space-xl);
  align-items: center;
  min-height: calc(min(100svh, 1080px) - 76px);
}
h1 {
  max-width: 12ch;
  font: 600 var(--text-display) / 0.98 var(--font-sans);
  letter-spacing: var(--tracking-display);
}
h1 .voice {
  display: block;
  margin-top: var(--space-2xs);
  font: 400 1.12em / 1 var(--font-serif);
  letter-spacing: -0.01em;
}
.lede {
  max-width: 30ch;
  margin-top: var(--space-28);
  color: var(--color-ink-2);
  font-size: var(--text-lead);
  line-height: 1.5;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-xl);
}
.door {
  margin-top: var(--space-md);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.alert {
  flex-basis: 100%;
  color: var(--color-error);
}
.fil {
  margin: 0;
}
.fil svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.fil .thread {
  fill: none;
  stroke-width: 2.4;
  stroke-linecap: round;
}
.fil .pulse {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 8 100;
  stroke-dashoffset: 108;
  animation: pulse 1.6s var(--ease-in-out) 0.3s 1 both;
}
.fil .pulse.d2 {
  animation-delay: 0.4s;
}
.fil .pulse.d3 {
  animation-delay: 0.5s;
}
.fil .pulse.d4 {
  animation-delay: 1.3s;
}
@keyframes pulse {
  from {
    stroke-dashoffset: 108;
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  to {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}
.fil .who {
  font: 600 18px / 1 var(--font-sans);
}
.fil .who-sky {
  fill: var(--color-sky-ink);
}
.fil .who-mag {
  fill: var(--color-mag-ink);
}
.fil .who-grn {
  fill: var(--color-grn-ink);
}
.fil .who-amb {
  fill: var(--color-amb-ink);
}
.fil .q {
  fill: var(--color-ink);
  font: 400 44px / 1 var(--font-serif);
}
.fil .q-s {
  font-size: 26px;
}
.fil .cap {
  fill: var(--color-muted);
  font: 400 15px / 1 var(--font-sans);
}
.fil .narrow {
  display: none;
}

/* sections */
.block {
  margin-top: var(--section-gap-s);
}
.block-l {
  margin-top: var(--section-gap);
}
.head {
  margin-bottom: var(--space-xl);
}
h2 {
  max-width: 22ch;
  font: 600 var(--text-section) / 1.04 var(--font-sans);
  letter-spacing: -0.03em;
}
.head p {
  max-width: 60ch;
  margin-top: var(--space-md);
  color: var(--color-ink-2);
  font-size: var(--text-lg);
  line-height: 1.5;
}

/* journal */
.journal {
  padding: var(--space-sm) var(--space-sm) var(--space-md);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}
.jhead {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-xs) var(--space-md);
  padding: var(--space-sm) var(--space-sm) var(--space-md);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.jhead strong {
  color: var(--color-ink);
  font-weight: 500;
}
.lane {
  padding: var(--space-sm) var(--space-sm) var(--space-xs);
}
.lane-h {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}
.lane-h h3 {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--tt);
  font: 600 var(--text-md) / 1.2 var(--font-sans);
}
.facts {
  display: flex;
  margin: 0 0 0 auto;
  padding: 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  list-style: none;
}
.facts li {
  padding: 0 var(--space-sm);
  border-left: 1px solid var(--color-rule-2);
}
.facts li:first-child {
  border-left: 0;
}
.facts li:last-child {
  padding-right: 0;
}
.lane ol {
  position: relative;
  margin: 0 0 0 var(--space-3xs);
  padding: var(--space-3xs) 0 var(--space-3xs) var(--space-lg);
  list-style: none;
}
.lane ol::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 6px;
  width: 2px;
  border-radius: 2px;
  background: var(--t);
}
.ev {
  display: grid;
  grid-template-columns: 64px 168px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-md);
  min-height: 44px;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-in);
  font-size: var(--text-sm);
}
.ev:nth-child(odd) {
  background: var(--color-paper-2);
}
.ev time {
  color: var(--color-muted);
  font: 400 12px / 1 var(--font-mono);
}
.ev .tool {
  color: var(--color-ink);
  font: 500 12.5px / 1.2 var(--font-mono);
}
.ev .tool.plain {
  color: var(--color-ink-2);
  font-family: var(--font-sans);
}
.ev .txt {
  min-width: 0;
  color: var(--color-ink-2);
}
.ev .txt code {
  color: var(--color-ink);
  font-size: 0.86em;
  overflow-wrap: anywhere;
}
.ev .r {
  color: var(--color-muted);
  font: 400 12px / 1 var(--font-mono);
  white-space: nowrap;
}
.gated {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  min-height: 24px;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-key);
  background: var(--color-ink);
  color: var(--color-on-ink);
  font: 500 12px / 1 var(--font-sans);
}
.lane.human .ev .txt {
  color: var(--color-ink);
  font: 400 var(--text-lg) / 1.34 var(--font-serif);
}

/* carnet */
.carnet {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: var(--space-2xl);
  align-items: start;
}
.carnet-intro p {
  max-width: 34ch;
  margin-top: var(--space-md);
  color: var(--color-ink-2);
  font-size: var(--text-lg);
  line-height: 1.5;
}
.carnet-intro .sig {
  margin-top: var(--space-lg);
  color: var(--color-ink);
  font: 400 var(--text-2xl) / 1 var(--font-serif);
}
.entries {
  border-top: 1px solid var(--color-rule-2);
}
.entry {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  gap: var(--space-lg);
  padding: var(--space-28) 0;
  border-bottom: 1px solid var(--color-rule-2);
}
.entry .when {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2xs);
  padding-top: var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-xs);
}
.entry .when time {
  color: var(--color-ink-2);
}
.entry p {
  max-width: 44ch;
  color: var(--color-ink);
  font: 400 var(--text-voice) / 1.34 var(--font-serif);
}

/* legend */
.band {
  margin-top: var(--section-gap-s);
  padding: var(--space-3xl) 0;
  background: var(--color-surface);
}
.legend {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: var(--space-2xl);
  align-items: start;
}
.legend-mark {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.legend-mark .lede {
  margin-top: 0;
}
.knot-big {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
}
.knot-big > svg {
  width: min(240px, 60%);
  height: auto;
}
.lockup {
  font: 600 var(--text-xl) / 1 var(--font-sans);
  letter-spacing: -0.02em;
}
.threads {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-lg);
  margin: 0;
}
.threads > div {
  position: relative;
  padding-bottom: var(--space-xs);
  padding-left: var(--space-md);
}
.threads > div::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--t);
}
.threads dt {
  color: var(--tt);
  font-weight: 600;
}
.threads dd {
  margin: var(--space-xs) 0 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: 1.45;
}
.voices {
  margin-top: var(--space-2xl);
  padding-top: var(--space-xl);
  border-top: 1px solid var(--color-rule);
}
.voices h3 {
  margin-bottom: var(--space-sm);
  font: 600 var(--text-md) / 1.2 var(--font-sans);
}
.voices dl {
  margin: 0;
}
.voices dl > div {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 9fr);
  gap: var(--space-lg);
  align-items: baseline;
  padding: var(--space-md) 0;
  border-top: 1px solid var(--color-rule);
}
.voices dl > div:first-child {
  border-top: 0;
}
.voices dt {
  font-size: var(--text-sm);
  font-weight: 500;
}
.voices dt span {
  color: var(--color-muted);
  font-weight: 400;
}
.voices dd {
  margin: 0;
}
.say-m {
  font: 600 var(--text-xl) / 1.2 var(--font-sans);
  letter-spacing: -0.02em;
}
.say-d code {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.say-h {
  font: 400 var(--text-2xl) / 1.1 var(--font-serif);
}

/* footer */
footer {
  padding: var(--space-xl) var(--gutter) var(--space-2xl);
}
.foot-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm) var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-rule-2);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.foot-row .brand {
  font-size: var(--text-md);
}
.foot-row ul {
  display: flex;
  flex: 1 1 100%;
  flex-wrap: wrap;
  order: 3;
  gap: var(--space-2xs) var(--space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}
.foot-row a:not(.brand) {
  color: var(--color-ink-2);
}
.foot-row a:hover {
  color: var(--color-ink);
}

@media (max-width: 77.5rem) {
  .threads {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 60rem) {
  .nav ul li:not(:last-child) {
    display: none;
  }
  .hero {
    grid-template-columns: minmax(0, 1fr);
    min-height: calc(100svh - 76px);
    padding: var(--space-xl) 0 var(--space-2xl);
  }
  .carnet,
  .legend {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-xl);
  }
  .ev {
    grid-template-columns: 56px minmax(0, 1fr) auto;
    grid-template-areas: 't tool r' 't txt txt';
  }
  .ev time {
    grid-area: t;
    align-self: start;
    padding-top: var(--space-2xs);
  }
  .ev .tool {
    grid-area: tool;
  }
  .ev .txt {
    grid-area: txt;
  }
  .ev .r,
  .ev .gated {
    grid-area: r;
  }
}
@media (max-width: 47.5rem) {
  .journal {
    padding: var(--space-xs) var(--space-2xs) var(--space-sm);
  }
  .lane {
    padding: var(--space-sm) var(--space-xs);
  }
  .lane ol {
    padding-left: var(--space-md);
  }
  .facts {
    flex-basis: 100%;
    margin-left: var(--space-sm);
  }
  .facts li:first-child {
    padding-left: 0;
  }
  .ev {
    grid-template-columns: 52px minmax(0, 1fr);
    grid-template-areas: 't tool' 't txt';
    gap: var(--space-2xs) var(--space-sm);
  }
  .ev .r,
  .ev .gated {
    grid-area: auto;
    grid-column: 2;
    justify-self: start;
  }
  .entry {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-sm);
    padding: var(--space-lg) 0;
  }
  .entry .when {
    flex-direction: row;
    align-items: baseline;
    gap: var(--space-sm);
    padding: 0;
  }
  .threads {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .voices dl > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-xs);
  }
  .knot-big > svg {
    width: 140px;
  }
  .band {
    padding: var(--space-2xl) 0;
  }
}
@media (max-width: 40rem) {
  .fil .wide {
    display: none;
  }
  .fil .narrow {
    display: block;
  }
  .fil .who {
    font-size: 14px;
  }
  .hero {
    gap: var(--space-lg);
    padding-top: var(--space-lg);
  }
  .lede {
    margin-top: var(--space-md);
  }
  .actions {
    margin-top: var(--space-lg);
  }
  .actions .btn {
    flex: 1 1 auto;
    justify-content: center;
  }
  .btn {
    padding: 0 var(--space-md);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fil .pulse {
    animation: none;
    opacity: 0;
  }
  .nav ul a {
    transition: none;
  }
}
</style>
