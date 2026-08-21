<script setup lang="ts">
// A node's rendering, in one place. Every state carries a signal that is not
// colour: thin stroke, dashes, thicker stroke, tick, cross, struck-through
// label. In greyscale, everything stays readable.
import type { Box } from '../state/layout'
import type { NodeView } from '../state/model'

defineProps<{
  node: NodeView
  box: Box
  selected: boolean
  built: boolean
}>()

defineEmits<{
  select: [id: NodeView['id']]
  hover: [payload: { node: NodeView; box: Box } | undefined]
}>()

const STATE_LABELS: Record<NodeView['state'], string> = {
  idle: 'inactif',
  'waiting-for-dependency': 'en attente de dépendance',
  working: 'en cours',
  finished: 'terminé',
  failed: 'en erreur',
  released: 'libéré',
}
</script>

<template>
  <!-- Two groups: the position lives on the outer group's `transform`
       attribute, the animation on the inner group. A CSS `transform` property
       would override the attribute and stack every node at the origin — which
       is exactly what happened on the first render. -->
  <g
    class="node"
    :data-state="node.state"
    :data-selected="selected"
    :data-built="built"
    :transform="`translate(${box.x} ${box.y})`"
    tabindex="0"
    role="button"
    :aria-pressed="selected"
    :aria-label="`${node.display.label ?? node.name} — ${node.display.role} — ${STATE_LABELS[node.state]}${built ? ' — fabriqué pendant le run' : ''}`"
    @click="$emit('select', node.id)"
    @keydown.enter.prevent="$emit('select', node.id)"
    @keydown.space.prevent="$emit('select', node.id)"
    @mouseenter="$emit('hover', { node, box })"
    @mouseleave="$emit('hover', undefined)"
    @focus="$emit('hover', { node, box })"
    @blur="$emit('hover', undefined)"
  >
    <g class="appearing">
      <rect class="node-frame" :width="box.width" :height="box.height" />
      <rect
        v-if="built"
        class="node-double"
        x="4"
        y="4"
        :width="box.width - 8"
        :height="box.height - 8"
      />
      <text class="node-label" x="14" y="24">
        {{ node.display.label ?? node.name }}
      </text>
      <!-- Second line reserved for a technology actually executed. A node that
           executes none displays nothing. -->
      <text v-if="node.display.technology" class="node-tech" x="14" y="42">
        {{ node.display.technology }}
      </text>

      <!-- Shape signal, redundant with the colour. -->
      <path
        v-if="node.state === 'finished'"
        class="node-mark"
        :d="`M ${box.width - 26} 22 l 4 4 l 7 -8`"
      />
      <path
        v-else-if="node.state === 'failed'"
        class="node-mark"
        :d="`M ${box.width - 26} 18 l 10 10 M ${box.width - 16} 18 l -10 10`"
      />
      <g v-else-if="node.state === 'working'" class="node-mark">
        <line :x1="box.width - 26" y1="20" :x2="box.width - 26" y2="28" />
        <line :x1="box.width - 20" y1="17" :x2="box.width - 20" y2="31" />
        <line :x1="box.width - 14" y1="22" :x2="box.width - 14" y2="26" />
      </g>
    </g>
  </g>
</template>
