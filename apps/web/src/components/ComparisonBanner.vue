<script setup lang="ts">
/**
 * Bandeau de comparaison (MEM-25) : ce qui differe entre la branche originale
 * et sa branche forcee, affiche au-dessus des deux panneaux.
 *
 * Le premier point de divergence est le premier noeud dont le nom, l'etat ou la
 * tache differe entre les deux lectures. Les sorties sont les reponses finales
 * de chaque branche. Le cout, la latence et le score d'eval viennent de M6 :
 * tant que ce jalon n'est pas livre, ils sont indicates comme indisponibles,
 * jamais inventes.
 */
import { computed } from 'vue'
import type { RunReadModel } from '../run/readModel'

const props = defineProps<{
  left: RunReadModel
  right: RunReadModel
}>()

const DIVERGENCE_LABELS = {
  none: 'Les deux branches sont identiques.',
  node: (name: string) => `Premier point de divergence : "${name}".`,
  state: (name: string, state: string) => `"${name}" diverge : etat ${state} sur la branche.`,
}

function firstDivergence(
  left: RunReadModel,
  right: RunReadModel,
): { kind: 'node' | 'state'; name: string; state?: string } | null {
  const leftById = new Map(left.nodes.map((n) => [n.id, n]))
  const rightById = new Map(right.nodes.map((n) => [n.id, n]))

  for (const node of left.nodes) {
    const other = rightById.get(node.id)
    if (!other) return { kind: 'node', name: node.name }
    if (node.name !== other.name) return { kind: 'node', name: node.name }
    if (node.state !== other.state) return { kind: 'state', name: node.name, state: other.state }
    if (node.task !== other.task) return { kind: 'node', name: node.name }
  }
  for (const node of right.nodes) {
    if (!leftById.has(node.id)) return { kind: 'node', name: node.name }
  }
  return null
}

const divergence = computed(() => firstDivergence(props.left, props.right))

const divergenceText = computed(() => {
  const d = divergence.value
  if (!d) return DIVERGENCE_LABELS.none
  if (d.kind === 'state' && d.state) return DIVERGENCE_LABELS.state(d.name, d.state)
  return DIVERGENCE_LABELS.node(d.name)
})

const leftFinished = computed(() => props.left.status === 'finished')
const rightFinished = computed(() => props.right.status === 'finished')

const leftDuration = computed(() => props.left.at.toFixed(1))
const rightDuration = computed(() => props.right.at.toFixed(1))
</script>

<template>
  <section class="flex flex-col gap-3 px-4 py-3" data-comparison-banner>
    <div class="rounded-md border border-default bg-elevated p-3 text-sm" data-divergence>
      <p class="font-medium">Comparaison des deux branches</p>
      <p data-divergence-text>{{ divergenceText }}</p>
      <div class="flex flex-col sm:flex-row gap-3 pt-2">
        <div class="flex flex-col gap-1">
          <span class="text-toned text-xs uppercase tracking-wider">Originale</span>
          <span
            class="text-sm"
            :class="{
              'text-success': leftFinished,
              'text-error': props.left.status === 'failed',
            }"
          >
            {{
              leftFinished
                ? 'Terminee'
                : props.left.status === 'waiting'
                  ? 'En attente'
                  : 'En cours'
            }}
            · {{ leftDuration }} s
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-toned text-xs uppercase tracking-wider">Branche</span>
          <span
            class="text-sm"
            :class="{
              'text-success': rightFinished,
              'text-error': props.right.status === 'failed',
            }"
          >
            {{
              rightFinished
                ? 'Terminee'
                : props.right.status === 'waiting'
                  ? 'En attente'
                  : 'En cours'
            }}
            · {{ rightDuration }} s
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-toned text-xs uppercase tracking-wider">Cout / latence / eval</span>
          <span class="text-sm text-muted">M6 — non disponible</span>
        </div>
      </div>
    </div>
  </section>
</template>
