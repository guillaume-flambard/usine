<script setup lang="ts">
/**
 * The public page: what a signed-out visitor sees (MEM-83, rewritten on
 * 16 November 2026).
 *
 * One story everywhere. The page used to tell an illustrated run "of
 * 2 November" with named agents and figures, while the visit told the real run
 * of 16 November and the atelier used other words: three stories, and the
 * illustration presented itself as real. Now the page says what the tool does
 * in the visit's words, and sends to the visit, the recorded real run. The
 * carnet lists what production really broke the day it went live, each fix
 * with its test. The page calls no model and no authenticated route.
 */
import { SIGN_IN_URL } from '../chat/session'

defineProps<{ unreachable?: boolean }>()
defineEmits<{ retry: [] }>()

const REPO = 'https://github.com/guillaume-flambard/usine'

/** The visit's four steps, in its own words. */
const STEPS = [
  {
    title: 'La question',
    text: 'On lui écrit comme à un collègue : pourquoi mon site ne se met plus à jour ?',
  },
  {
    title: 'Le travail réparti',
    text: 'Un agent chef découpe la tâche, trois agents travaillent en même temps.',
  },
  {
    title: 'Les faits',
    text: 'Ils lisent le vrai projet sur GitHub, en lecture seule. Ils ne devinent pas.',
  },
  {
    title: 'Votre accord',
    text: 'Ils proposent un ticket, lisible. Rien ne part sur GitHub sans accord humain.',
  },
]

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
  <div class="landing" data-landing>
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
            <li><a href="/visite">La visite</a></li>
            <li><a :href="REPO">Le code</a></li>
            <li><a :href="SIGN_IN_URL" data-nav-sign-in>Se connecter</a></li>
          </ul>
        </nav>
      </header>

      <main id="main">
        <section class="hero" aria-labelledby="t-hero">
          <p class="kicker">Usine, par Guillaume Flambard</p>
          <h1 id="t-hero">
            Un assistant qui enquête sur votre projet, et vous demande avant d’agir.
          </h1>
          <p class="lede">
            J’ai construit Usine pour montrer comment je fais travailler des agents IA dans une
            interface Vue : ils lisent un vrai projet avec de vrais outils, et rien d’irréversible
            ne part sans accord humain.
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
            La visite dure une minute et rejoue un vrai run, enregistré le 16 novembre 2026 : rien
            n’en sort. L’atelier lui-même est réservé à mon compte.
          </p>
        </section>

        <section class="block" aria-labelledby="t-steps">
          <h2 id="t-steps">Ce que vous verrez</h2>
          <ol class="steps">
            <li v-for="(s, i) in STEPS" :key="s.title">
              <span class="num" :class="{ ink: i === STEPS.length - 1 }">{{ i + 1 }}</span>
              <h3>{{ s.title }}</h3>
              <p>{{ s.text }}</p>
            </li>
          </ol>
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
  background: var(--color-paper);
  color: var(--color-ink);
}
.container {
  width: 100%;
  max-width: 64rem;
  margin-inline: auto;
  padding-inline: var(--space-20);
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
.nav ul a:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 46rem;
  padding: var(--space-2xl) 0 var(--space-xl);
}
.kicker {
  color: var(--color-muted);
  font-size: var(--text-sm);
}
h1 {
  font: 600 var(--text-2xl) / 1.12 var(--font-sans);
}
.lede {
  color: var(--color-ink-2);
  font-size: var(--text-md);
  line-height: 1.55;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
}
.door {
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.alert {
  width: 100%;
  color: var(--color-error);
}
.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-xl) 0;
  border-top: 1px solid var(--color-rule);
}
.block h2 {
  font: 600 var(--text-lg) / 1.3 var(--font-sans);
}
.steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}
.steps li {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}
.num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-paper-3);
  font: 600 var(--text-sm) / 1 var(--font-sans);
}
.num.ink {
  background: var(--color-ink);
  color: var(--color-on-ink);
}
.steps h3,
.entry h3 {
  font: 600 var(--text-md) / 1.3 var(--font-sans);
}
.steps p,
.entry p,
.intro {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: 1.55;
}
.intro {
  max-width: 46rem;
}
.entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: var(--space-sm);
}
.entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-left: 2px solid var(--color-ink);
  background: var(--color-surface);
}
.foot {
  padding: var(--space-lg) 0;
  border-top: 1px solid var(--color-rule);
  color: var(--color-muted);
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
</style>
