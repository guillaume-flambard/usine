<script setup lang="ts">
// The graph is a PROJECTION: no node and no edge is created here. Everything
// comes from the reducer, and the layout follows the live topology.
import { computed, ref } from 'vue'
import type { Box, Layout } from '../state/layout'
import { linkPath } from '../state/layout'
import type { NodeView, RunState } from '../state/model'
import GraphNode from './GraphNode.vue'

const props = defineProps<{
  state: RunState
  layout: Layout
  selected?: string
  built: readonly string[]
}>()

const emit = defineEmits<{ select: [id: NodeView['id']] }>()

const hovered = ref<{ node: NodeView; box: Box } | undefined>()

const placedNodes = computed(() =>
  props.state.nodes
    .map((node) => ({ node, box: props.layout.boxes.get(node.name) }))
    .filter((pair): pair is { node: NodeView; box: Box } => pair.box !== undefined),
)

const nameById = computed(() => new Map(props.state.nodes.map((node) => [node.id, node.name])))

const presentNames = computed(() => new Set(props.state.nodes.map((node) => node.name)))

/** Live components no declared place accommodates. */
const orphans = computed(() =>
  props.state.nodes.filter((node) => !props.layout.boxes.has(node.name)),
)

/**
 * The drawing frame. A size floor keeps a single-node graph from being shown
 * in close-up at the first instant of the run.
 */
const frame = computed(() => ({
  width: Math.max(props.layout.width, 900),
  height: Math.max(props.layout.height + (orphans.value.length ? 96 : 0), 420),
}))

const lastTransit = computed(() =>
  props.state.edges.reduce((max, edge) => Math.max(max, edge.lastTransit ?? 0), 0),
)

const links = computed(() => {
  const names = nameById.value
  const present = presentNames.value
  return (
    props.layout.links
      // A link is only drawn once BOTH its ends really exist. Otherwise the
      // graph would show a skeleton of edges before a single node — exactly
      // the stage set this product refuses.
      .filter((link) => present.has(link.from) && present.has(link.to))
      .map((link) => {
        const view = props.state.edges.find(
          (edge) =>
            edge.name === link.name &&
            names.get(edge.from) === link.from &&
            names.get(edge.to) === link.to,
        )
        return {
          key: `${link.from}-${link.name}-${link.to}`,
          path: linkPath(link.points),
          hasTransited: view?.hasTransited === true,
          parenthood: view?.kind === 'parenthood',
          recent:
            view?.lastTransit !== undefined &&
            view.lastTransit === lastTransit.value &&
            props.state.lastSequence - view.lastTransit < 6,
        }
      })
  )
})

const descriptionId = 'graph-description'

const STATE_LABELS: Record<NodeView['state'], string> = {
  idle: 'inactif',
  'waiting-for-dependency': 'en attente de dépendance',
  working: 'en cours',
  finished: 'terminé',
  failed: 'en erreur',
  released: 'libéré',
}

const description = computed(() => {
  if (props.state.nodes.length === 0) return 'Le graphe est vide. Aucun composant chargé.'
  const perState = props.state.nodes.map((n) => `${n.name} : ${STATE_LABELS[n.state]}`)
  return `${props.state.nodes.length} composants. ${perState.join('. ')}.`
})
</script>

<template>
  <div class="canvas">
    <!-- The graph has no size known in advance: it grows during the run. A
         `viewBox` keeps it whole inside the frame instead of letting it run
         off the right edge by the third wave. -->
    <svg
      :viewBox="`0 0 ${frame.width} ${frame.height}`"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Graphe du run"
      :aria-describedby="descriptionId"
    >
      <!-- `role="img"` would make the whole subtree presentational and the
           focusable nodes would stop existing for a screen reader. -->
      <desc :id="descriptionId">{{ description }}</desc>
      <g>
        <path
          v-for="link in links"
          :key="link.key"
          class="link"
          :d="link.path"
          :data-transited="link.hasTransited"
          :data-recent="link.recent"
          :data-parenthood="link.parenthood"
        />
      </g>
      <GraphNode
        v-for="pair in placedNodes"
        :key="pair.node.id"
        :node="pair.node"
        :box="pair.box"
        :selected="selected === pair.node.id"
        :built="built.includes(pair.node.name)"
        @select="emit('select', $event)"
        @hover="hovered = $event"
      />
      <!-- A live component with no declared place is rendered anyway, in an
           overflow lane: hiding it would break the invariant that the graph is
           the real topology. -->
      <g v-for="(orphan, index) in orphans" :key="orphan.id" class="orphan">
        <rect
          class="node-frame"
          :x="24 + index * 160"
          :y="layout.height + 16"
          :width="140"
          :height="56"
        />
        <text class="node-label" :x="38 + index * 160" :y="layout.height + 40">
          {{ orphan.display.label ?? orphan.name }}
        </text>
      </g>
    </svg>

    <div
      v-if="hovered"
      class="hover-card"
      :style="{
        left: `${hovered.box.x}px`,
        top: `${hovered.box.y + hovered.box.height + 8}px`,
      }"
    >
      <p class="hover-role">{{ hovered.node.display.role }}</p>
      <p v-if="hovered.node.needs.length" class="hover-detail">
        Dépend de : {{ hovered.node.needs.join(', ') }}
      </p>
      <p v-if="hovered.node.display.technology" class="hover-detail">
        {{ hovered.node.display.technology }}
      </p>
    </div>
  </div>
</template>
