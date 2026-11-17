<script setup lang="ts">
/**
 * The daily triage, read as a list (ADR 0003). The run scene drew one card per
 * repository, 35 side by side, each saying « judge » and opening on nothing
 * (owner, 17 November 2026). Here each repository is one row: what its agent
 * decided, and, opened, the items it read with their links. The decision itself
 * stays in the gate (« Votre accord »), which the banner leads to.
 */
import { computed } from 'vue'
import type { RunNode, RunReadModel, TriageItem } from '../run/readModel'
import { secondsText } from '../run/gate'

const props = defineProps<{ model: RunReadModel }>()
const emit = defineEmits<{ decide: [] }>()

const DECISIONS: Record<TriageItem['decision'], string> = {
  close: 'à fermer',
  keep: 'gardé',
  nudge: 'à relancer',
}
const MOTIFS: Record<string, string> = {
  resolu: 'résolue',
  doublon: 'doublon',
  depasse: 'remplacée',
  abandonne: 'abandonnée',
}

const pretriage = computed(() => props.model.nodes.find((n) => n.name === 'pretriage'))
const judges = computed(() =>
  props.model.nodes
    .filter((n) => n.name === 'judge')
    .sort(
      (a, b) =>
        (b.triage?.counts.close ?? 0) - (a.triage?.counts.close ?? 0) ||
        Number(Boolean(b.failure)) - Number(Boolean(a.failure)) ||
        (a.task ?? '').localeCompare(b.task ?? ''),
    ),
)
const proposals = computed(() =>
  props.model.status === 'waiting' ? (props.model.gate?.actions.length ?? 0) : 0,
)
const failed = computed(() => judges.value.filter((n) => n.failure).length)

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function verdict(node: RunNode): string {
  if (node.state === 'running') return 'lecture en cours'
  const c = node.triage?.counts ?? {}
  const parts = [
    c.close ? `${c.close} à fermer` : '',
    c.nudge ? `${c.nudge} à relancer` : '',
    c.keep ? plural(c.keep, 'gardé', 'gardés') : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'rien à proposer'
}

function repoName(node: RunNode): string {
  return node.triage?.repo || node.task || 'dépôt inconnu'
}

function duration(node: RunNode): string {
  return node.finishedAt === undefined ? '' : secondsText(node.finishedAt - node.startedAt)
}

const intro = computed(() => {
  const t = pretriage.value?.triage
  if (!t) return pretriage.value ? 'Lecture de GitHub en cours.' : ''
  const c = t.counts
  return [
    plural(t.read ?? 0, 'élément lu', 'éléments lus'),
    `${c.close ?? 0} fermé${(c.close ?? 0) > 1 ? 's' : ''} par une règle`,
    `${c.judge ?? 0} confié${(c.judge ?? 0) > 1 ? 's' : ''} aux agents`,
  ].join(' · ')
})
</script>

<template>
  <section class="board" aria-label="Tri du jour" data-triage>
    <div v-if="proposals > 0" class="banner" data-triage-banner>
      <p>
        <b>{{ plural(proposals, 'proposition attend', 'propositions attendent') }} votre accord.</b>
        Rien n’est commenté ni fermé avant.
      </p>
      <button type="button" class="btn btn-on-ink" data-triage-open-gate @click="emit('decide')">
        Voir la liste à cocher
      </button>
    </div>

    <header class="head">
      <h2>Tri du jour</h2>
      <p class="intro" data-triage-intro>{{ intro }}</p>
      <p v-for="(gap, i) in pretriage?.triage?.incomplete ?? []" :key="i" class="gap">
        Lecture incomplète : {{ gap }}
      </p>
      <p v-if="failed" class="gap" data-triage-failed>
        {{ plural(failed, 'agent n’a pas abouti', 'agents n’ont pas abouti') }} : leurs éléments
        sont gardés, rien n’est proposé pour eux.
      </p>
    </header>

    <ul class="repos" aria-label="Par dépôt">
      <li v-for="node in judges" :key="node.id" :data-triage-repo="repoName(node)">
        <details :class="{ failed: Boolean(node.failure) }">
          <summary>
            <span class="repo mono">{{ repoName(node) }}</span>
            <span class="verdict">{{ verdict(node) }}</span>
            <span class="state">
              <template v-if="node.failure">en erreur</template>
              <template v-else-if="node.state === 'running'">en cours</template>
              <template v-else>{{ duration(node) }}</template>
            </span>
            <UIcon name="i-lucide-chevron-down" class="chev size-4" aria-hidden="true" />
          </summary>
          <p v-if="node.failure" class="why" data-triage-why>{{ node.failure }}</p>
          <ul v-if="node.triage?.items.length" class="items">
            <li
              v-for="item in node.triage.items"
              :key="item.number"
              :data-decision="item.decision"
              data-triage-item
            >
              <p class="item-head">
                <a :href="item.url" target="_blank" rel="noopener noreferrer" class="mono"
                  >#{{ item.number }}</a
                >
                <span class="kind">{{ item.kind === 'pr' ? 'PR' : 'issue' }}</span>
                <span class="decision">{{ DECISIONS[item.decision] }}</span>
              </p>
              <p class="item-title">{{ item.title }}</p>
              <p v-if="item.decision === 'close'" class="item-why">
                {{ MOTIFS[item.motif ?? ''] ?? item.motif }},
                <a v-if="item.proof" :href="item.proof" target="_blank" rel="noopener noreferrer"
                  >preuve</a
                >
              </p>
              <p v-if="item.comment" class="item-comment">{{ item.comment }}</p>
            </li>
          </ul>
          <p v-else-if="!node.failure" class="why">Aucun élément.</p>
        </details>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
  max-width: 56rem;
  margin-inline: auto;
  padding: var(--space-md);
}
.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-20);
  border-radius: var(--radius-card);
  background: var(--color-ink);
  color: var(--color-on-ink);
}
.banner p {
  max-width: 60ch;
  color: var(--color-on-ink-2);
  font-size: var(--text-sm);
}
.banner b {
  display: block;
  color: var(--color-on-ink);
  font: 400 var(--text-lg) / 1.25 var(--font-serif);
}
.btn-on-ink {
  min-height: 44px;
  padding: 0 var(--space-md);
  border: 0;
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  font: 500 var(--text-sm) / 1 var(--font-sans);
  cursor: pointer;
  transition: transform var(--dur-press, 120ms) var(--ease-out);
}
.btn-on-ink:active {
  transform: scale(0.97);
}
.head h2 {
  font: 400 var(--text-question) / 1.05 var(--font-serif);
}
.intro {
  margin-top: var(--space-2xs);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.gap {
  margin-top: var(--space-2xs);
  max-width: 72ch;
  color: var(--color-muted);
  font-size: var(--text-xs);
}
.repos {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-rule);
}
.repos > li {
  border-bottom: 1px solid var(--color-rule);
}
summary {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.6fr) auto auto;
  align-items: center;
  gap: var(--space-sm);
  min-height: 48px;
  padding: var(--space-xs) var(--space-2xs);
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
@media (hover: hover) and (pointer: fine) {
  summary:hover {
    background: var(--color-paper-2);
  }
}
summary:focus-visible {
  outline: 2px solid var(--color-ink);
  outline-offset: 2px;
}
.repo {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.verdict {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.state {
  color: var(--color-muted);
  font: 400 12px / 1 var(--font-mono);
  white-space: nowrap;
}
.failed .state {
  color: var(--color-error, var(--color-ink));
  font-family: var(--font-sans);
}
.chev {
  color: var(--color-muted);
  transition: transform var(--dur-menu, 200ms) var(--ease-out);
}
details[open] .chev {
  transform: rotate(180deg);
}
.why {
  padding: 0 var(--space-2xs) var(--space-sm);
  max-width: 72ch;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.items {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0 var(--space-2xs) var(--space-md) var(--space-md);
  list-style: none;
}
.items > li {
  max-width: 72ch;
}
.item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-xs);
}
.kind,
.decision {
  color: var(--color-muted);
}
[data-decision='close'] .decision {
  color: var(--color-ink);
  font-weight: 600;
}
.item-title {
  font: 500 var(--text-sm) / 1.35 var(--font-sans);
  overflow-wrap: anywhere;
}
.item-why,
.item-comment {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.board a {
  color: inherit;
  text-decoration-line: underline;
  text-decoration-color: var(--color-muted);
  text-underline-offset: 3px;
}
@media (max-width: 40rem) {
  summary {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .verdict {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .state {
    display: none;
  }
  .failed .state {
    display: inline;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chev,
  .btn-on-ink {
    transition: none;
  }
}
</style>
