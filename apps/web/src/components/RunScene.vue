<script setup lang="ts">
/**
 * The scene (MEM-17), drawn as "Le fil" (MEM-86): each agent a card on its own
 * coloured thread, every thread tied into the black knot of the human gate.
 *
 * Drawn from the read model only. Each state is said in words, never by colour
 * alone, and nothing is drawn ahead of an event: an edge appears once both of
 * its ends exist. In a narrow column (a phone, a branch panel) the graph reads
 * as a list, each card on its thread.
 */
import { computed, useId } from 'vue'
import { layoutRun, sizeOf } from '../run/layout'
import type { NodeState, RunNode, RunReadModel } from '../run/readModel'
import { nodeName } from '../run/names'
import { threadsOf, type Thread } from '../run/threads'
import { gateQuestion, secondsText, toolOf } from '../run/gate'

const props = defineProps<{ model: RunReadModel }>()
const emit = defineEmits<{ decide: [] }>()
// Two scenes can share a page (the comparison): each needs its own id.
const descriptionId = useId()

const STATES: Record<NodeState, string> = {
  running: 'en cours',
  waiting: 'en attente',
  finished: 'terminé',
  failed: 'en erreur',
}
const RUN_STATUS: Record<RunReadModel['status'], string> = {
  idle: 'Aucun run',
  running: 'Run en cours',
  waiting: 'En attente de votre décision',
  finished: 'Run terminé',
  failed: 'Run en erreur',
}

const placed = computed(() => layoutRun(props.model.nodes, props.model.edges))
const threads = computed(() => threadsOf(props.model.nodes))
const thread = (node: RunNode): Thread => threads.value.get(node.id) ?? 'sup'

/** Specialists are numbered in start order, the way their threads are. */
const specialistRank = computed(() => {
  const ranks = new Map<string, number>()
  for (const node of props.model.nodes.filter((n) => n.name === 'specialist')) {
    ranks.set(node.id, ranks.size + 1)
  }
  return ranks
})

function title(node: RunNode): string {
  const rank = specialistRank.value.get(node.id)
  return rank ? `${nodeName(node.name)} ${rank}` : nodeName(node.name)
}

function task(node: RunNode): string {
  if (node.task) return node.task
  if (node.subtasks) {
    const n = node.subtasks.length
    return `Découpe le brief en ${n} sous-tâche${n > 1 ? 's' : ''}`
  }
  return ''
}

/** What the node used: framework, tools (with a count), reasoning. Data only. */
function meta(node: RunNode): string[] {
  const lines: string[] = []
  for (const specialist of node.specialists ?? []) {
    lines.push(specialist.framework)
    const counts = new Map<string, number>()
    for (const tool of specialist.tools ?? []) counts.set(tool, (counts.get(tool) ?? 0) + 1)
    for (const [tool, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(count > 1 ? `${tool} ×${count}` : tool)
    }
  }
  if (node.name === 'synthesize' && props.model.gate?.actions[0]) {
    lines.push(`propose ${toolOf(props.model.gate.actions[0])}`)
  }
  if (node.reasoning.started > 0) {
    lines.push(`réflexion ${node.reasoning.settled}/${node.reasoning.started}`)
  }
  return lines
}

function duration(node: RunNode): string {
  return node.finishedAt === undefined ? '' : secondsText(node.finishedAt - node.startedAt)
}

const byId = computed(() => new Map(props.model.nodes.map((n) => [n.id, n])))

/** A link carries the thread of the agent it leads to, or comes from. */
const links = computed(() =>
  placed.value.links.map((link) => {
    const from = byId.value.get(link.from)
    const to = byId.value.get(link.to)
    const owner = from && from.name !== 'supervisor' ? from : to
    return {
      ...link,
      thread: owner ? thread(owner) : 'sup',
      // The dash flows along the thread while the node it feeds is working.
      flowing: to?.state === 'running',
    }
  }),
)

/** The tool calls the run made, by name (MEM-38): a trace says what it did. */
const toolsUsed = computed(() => {
  const names = new Set<string>()
  for (const node of props.model.nodes) {
    for (const specialist of node.specialists ?? []) {
      for (const tool of specialist.tools ?? []) names.add(tool)
    }
  }
  return [...names].sort()
})

const description = computed(() => {
  const nodes = props.model.nodes
    .map((n) => `${nodeName(n.name)}${n.task ? ` (${n.task})` : ''} : ${STATES[n.state]}`)
    .join('. ')
  const tools = toolsUsed.value.length ? ` Outils appelés : ${toolsUsed.value.join(', ')}.` : ''
  return `${nodes}.${tools}`
})

const statusLine = computed(() => {
  const n = props.model.nodes.length
  return `${RUN_STATUS[props.model.status]}, ${n} nœud${n > 1 ? 's' : ''}, ${secondsText(props.model.at)}`
})

const question = computed(() => gateQuestion(props.model.gate))
const approved = computed(() => {
  const decision = props.model.gate?.decision
  return decision === 'approve' || decision === 'edit'
})

function place(node: RunNode) {
  const box = placed.value.boxes.get(node.id)
  return {
    '--x': `${box?.x ?? 0}px`,
    '--y': `${box?.y ?? 0}px`,
    '--nh': `${box?.height ?? sizeOf(node).height}px`,
  }
}
</script>

<template>
  <section aria-label="Scène du run" class="scene" data-scene>
    <div class="scene-top">
      <p class="scene-status" data-scene-status>{{ statusLine }}</p>
      <p v-if="toolsUsed.length" class="scene-tools" data-tools>
        Outils appelés : {{ toolsUsed.join(', ') }}
      </p>
    </div>
    <div
      class="scene-graph"
      role="group"
      aria-label="Graphe du run"
      :aria-describedby="descriptionId"
      :style="{ '--w': `${placed.width}px`, '--h': `${placed.height}px` }"
    >
      <p :id="descriptionId" class="visually-hidden" data-scene-description>{{ description }}</p>
      <svg
        class="scene-edges"
        :width="placed.width"
        :height="placed.height"
        :viewBox="`0 0 ${placed.width} ${placed.height}`"
        aria-hidden="true"
      >
        <g v-for="link in links" :key="`${link.from}-${link.to}`" :data-thread="link.thread">
          <path class="scene-link" :d="link.d" />
          <path v-if="link.flowing" class="scene-flow" :d="link.d" pathLength="100" data-flowing />
        </g>
      </svg>
      <template v-for="node in model.nodes" :key="node.id">
        <button
          v-if="node.name === 'human_gate'"
          type="button"
          class="scene-node gate-node"
          :class="{ tight: approved }"
          :style="place(node)"
          :data-node="node.name"
          :data-node-state="node.state"
          data-thread="ink"
          data-gate-open
          @click="emit('decide')"
        >
          <svg class="knot-art" viewBox="0 0 44 44" aria-hidden="true">
            <g class="pull" fill="none" stroke-width="2.4" stroke-linecap="round">
              <path class="s-sky" d="M8 4C8 14 15 19 19 23" />
              <path class="s-mag" d="M22 4V22" />
              <path class="s-grn" d="M36 4C36 14 29 19 25 23" />
            </g>
            <g class="core">
              <circle class="f-surface" cx="22" cy="30" r="8.5" />
              <path class="s-surface" d="M22 38.5V43" stroke-width="2.4" stroke-linecap="round" />
            </g>
          </svg>
          <span class="gate-text">
            <b>Porte humaine, {{ STATES[node.state] }}</b>
            <i>{{ question }}</i>
          </span>
        </button>
        <article
          v-else
          class="scene-node card"
          :class="{ working: node.state === 'running', failed: Boolean(node.failure) }"
          :style="place(node)"
          :data-node="node.name"
          :data-node-state="node.state"
          :data-thread="thread(node)"
          :title="task(node) || undefined"
        >
          <h3 class="card-head">{{ title(node) }}</h3>
          <p v-if="task(node)" class="card-task">{{ task(node) }}</p>
          <p v-if="node.failure" class="card-failure text-error" data-node-failure>
            {{ node.failure }}
          </p>
          <p v-if="meta(node).length && !node.failure" class="card-meta">
            <template v-for="(line, i) in meta(node)" :key="i"
              >{{ line }}<br v-if="i < meta(node).length - 1"
            /></template>
          </p>
          <div class="card-foot">
            <span>{{ STATES[node.state] }}</span>
            <span class="mono">{{ duration(node) }}</span>
          </div>
        </article>
      </template>
    </div>
  </section>
</template>

<style scoped>
.scene {
  container: scene / inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}
.scene-top {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs) var(--space-md);
  padding: 0 var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-xs);
}
.scene-tools {
  font-family: var(--font-mono);
  color: var(--color-ink-2);
}
.scene-graph {
  position: relative;
  width: var(--w);
  height: var(--h);
  margin-inline: auto;
}
.scene-edges {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}
.scene-link {
  fill: none;
  stroke: var(--t);
  stroke-width: 2;
  stroke-linecap: round;
}
.scene-flow {
  fill: none;
  stroke: var(--color-surface);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-dasharray: 9 100;
  animation: flow 1.1s linear infinite;
}
@keyframes flow {
  from {
    stroke-dashoffset: 109;
  }
  to {
    stroke-dashoffset: 0;
  }
}
.scene-node {
  position: absolute;
  left: var(--x);
  top: var(--y);
}
.card {
  display: flex;
  flex-direction: column;
  width: 206px;
  height: var(--nh);
  overflow: hidden;
  padding: var(--space-md) var(--space-md) var(--space-sm);
  border-radius: 18px;
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
  transition: box-shadow var(--dur-long) var(--ease-out);
}
.card.working {
  box-shadow:
    var(--shadow-2),
    0 0 0 2px var(--t);
}
.card-head {
  margin: 0;
  color: var(--tt);
  font: 600 var(--text-sm) / 1.2 var(--font-sans);
}
/* Every line in the card keeps its height: a fixed-height flex column would
   otherwise squeeze a clamped paragraph and cut a line in half (16 November
   2026, a failed specialist's reason). A failed card trades its meta (framework,
   tools) for the reason, and its task takes two lines instead of three. */
.card > * {
  flex-shrink: 0;
}
.card.failed .card-task {
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.card-failure {
  display: -webkit-box;
  margin-top: var(--space-xs);
  overflow: hidden;
  font: 500 var(--text-xs) / 1.35 var(--font-sans);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.card-task {
  display: -webkit-box;
  margin-top: var(--space-xs);
  overflow: hidden;
  font: 500 var(--text-sm) / 1.35 var(--font-sans);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}
.card-meta {
  display: -webkit-box;
  margin-top: var(--space-2xs);
  overflow: hidden;
  color: var(--color-muted);
  font: 400 12px / 1.5 var(--font-mono);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.card-foot {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  padding-top: var(--space-xs);
  border-top: 1px solid var(--color-rule);
  color: var(--color-muted);
  font-size: var(--text-xs);
}
.gate-node {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 232px;
  height: 72px;
  padding: var(--space-sm) var(--space-md) var(--space-sm) var(--space-sm);
  border: 0;
  border-radius: 20px;
  background: var(--color-ink);
  color: var(--color-on-ink);
  box-shadow: var(--shadow-ink);
  text-align: left;
  cursor: pointer;
}
.gate-node:hover {
  background: var(--color-ink-hover);
}
.gate-text {
  min-width: 0;
}
.gate-text b {
  display: block;
  font: 500 var(--text-sm) / 1.2 var(--font-sans);
}
.gate-text i {
  display: block;
  margin-top: var(--space-3xs);
  overflow: hidden;
  color: var(--color-on-ink-2);
  font: 400 var(--text-lg) / 1.2 var(--font-serif);
  font-style: normal;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.knot-art {
  flex: none;
  width: 44px;
  height: 44px;
}
.knot-art .pull,
.knot-art .core {
  transform-origin: 22px 30px;
  transition: transform 0.7s var(--ease-out);
}
.tight .knot-art .pull {
  transform: scaleX(0.55) translateY(3px);
}
.tight .knot-art .core {
  transform: scale(0.92);
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
.s-surface {
  stroke: var(--color-surface);
}
.f-surface {
  fill: var(--color-surface);
}

/* A narrow column: the graph becomes a list, each card on its thread. */
@container scene (max-width: 34rem) {
  .scene-graph {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: auto;
    height: auto;
    margin: 0;
    padding: var(--space-xs) 0 var(--space-xs) var(--space-32);
  }
  .scene-edges {
    display: none;
  }
  .scene-node {
    position: relative;
    left: auto;
    top: auto;
  }
  .card {
    width: auto;
    height: auto;
  }
  .card-task,
  .card-meta {
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }
  .gate-node {
    width: auto;
    height: auto;
  }
  .scene-node::before {
    content: '';
    position: absolute;
    left: -18px;
    top: -12px;
    bottom: -12px;
    width: 2px;
    background: var(--t);
  }
  .gate-node::before {
    bottom: auto;
    height: 30px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-flow {
    animation: none;
    stroke-dasharray: none;
    opacity: 0;
  }
  .knot-art .pull,
  .knot-art .core,
  .card {
    transition: none;
  }
}
</style>
