<script setup lang="ts">
/**
 * The scene (MEM-17): the run graph, drawn from the read model only.
 *
 * Each state is said in words and with a sign, never by colour alone. Nothing
 * is drawn ahead of an event: an edge appears once both of its ends exist.
 */
import { computed } from 'vue'
import { layoutRun, linkPath, NODE_HEIGHT, NODE_WIDTH } from '../run/layout'
import type { NodeState, RunNode, RunReadModel } from '../run/readModel'
import { nodeName } from '../run/names'

const props = defineProps<{ model: RunReadModel }>()
const emit = defineEmits<{ decide: [] }>()

const STATES: Record<NodeState, { sign: string; label: string }> = {
  running: { sign: '…', label: 'en cours' },
  waiting: { sign: '⏸', label: 'en attente' },
  finished: { sign: '✓', label: 'terminé' },
  failed: { sign: '✕', label: 'en erreur' },
}
const RUN_STATUS: Record<RunReadModel['status'], string> = {
  idle: 'Aucun run',
  running: 'Run en cours',
  waiting: 'En attente de votre décision',
  finished: 'Run terminé',
  failed: 'Run en erreur',
}

const ACTION_KINDS: Record<string, string> = {
  external_write: 'Écriture externe',
  send: 'Envoi',
  pull_request: 'Pull request',
}

const placed = computed(() => layoutRun(props.model.nodes, props.model.edges))

const frame = computed(() => ({
  width: Math.max(placed.value.width, NODE_WIDTH + 32),
  height: Math.max(placed.value.height, NODE_HEIGHT + 32),
}))

function title(node: RunNode): string {
  return nodeName(node.name)
}

function detail(node: RunNode): string {
  if (node.task) return node.task
  if (node.subtasks)
    return `${node.subtasks.length} sous-tâche${node.subtasks.length > 1 ? 's' : ''}`
  return ''
}

function short(text: string, max = 20): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function seconds(node: RunNode): string {
  if (node.finishedAt === undefined) return ''
  return `${(node.finishedAt - node.startedAt).toFixed(1)} s`
}

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
    .map((n) => `${title(n)}${n.task ? ` (${n.task})` : ''} : ${STATES[n.state].label}`)
    .join('. ')
  const tools = toolsUsed.value.length ? ` Outils appelés : ${toolsUsed.value.join(', ')}.` : ''
  return `${nodes}.${tools}`
})
</script>

<template>
  <section aria-label="Scène du run" class="flex flex-col gap-2" data-scene>
    <p class="text-sm text-muted" data-scene-status>
      {{ RUN_STATUS[model.status] }} · {{ model.nodes.length }} nœud{{
        model.nodes.length > 1 ? 's' : ''
      }}
      · {{ model.at.toFixed(1) }} s
    </p>
    <p v-if="toolsUsed.length" class="text-sm text-toned" data-tools>
      Outils appelés : {{ toolsUsed.join(', ') }}
    </p>
    <div
      v-if="model.gate && model.status === 'waiting'"
      class="flex flex-col gap-1 rounded-md border border-default p-3 text-sm"
      data-gate
    >
      <p class="font-medium">Action proposée, en attente de votre décision :</p>
      <ul class="list-disc pl-5">
        <li v-for="(action, index) in model.gate.actions" :key="index">
          {{ ACTION_KINDS[action.kind] ?? action.kind }} vers {{ action.target }} :
          {{ action.justification }}
        </li>
      </ul>
      <p class="text-toned" data-gate-notice>{{ model.gate.notice }}</p>
      <UButton
        class="self-start"
        color="primary"
        size="xl"
        label="Décider"
        :ui="{ base: 'min-h-11' }"
        data-gate-open
        @click="emit('decide')"
      />
    </div>
    <!-- Drawn at its real size and scrolled if needed: scaled down to fit the
         column, 14 px text fell to about 9 px (measured on 2026-11-14). -->
    <svg
      :width="frame.width"
      :height="frame.height"
      :viewBox="`0 0 ${frame.width} ${frame.height}`"
      role="group"
      aria-label="Graphe du run"
      aria-describedby="scene-description"
      class="scene-graph"
    >
      <desc id="scene-description">{{ description }}</desc>
      <path
        v-for="link in placed.links"
        :key="`${link.from}-${link.to}`"
        class="scene-link"
        :d="linkPath(link.points)"
      />
      <g
        v-for="node in model.nodes"
        :key="node.id"
        class="scene-node"
        :transform="`translate(${placed.boxes.get(node.id)?.x ?? 0}, ${placed.boxes.get(node.id)?.y ?? 0})`"
        :data-node="node.name"
        :data-node-state="node.state"
      >
        <title>{{ title(node) }}{{ node.task ? ` : ${node.task}` : '' }}</title>
        <rect :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="8" />
        <text x="12" y="22" class="scene-title">{{ title(node) }}</text>
        <text x="12" y="42" class="scene-state">
          {{ STATES[node.state].sign }} {{ STATES[node.state].label }}
        </text>
        <text :x="NODE_WIDTH - 12" y="42" text-anchor="end" class="scene-detail">
          {{ seconds(node) }}
        </text>
        <text x="12" y="60" class="scene-detail">
          {{ short(detail(node)) }}
          <template v-if="node.reasoning.started > 0">
            · réflexion {{ node.reasoning.settled }}/{{ node.reasoning.started }}
          </template>
        </text>
      </g>
    </svg>
  </section>
</template>
