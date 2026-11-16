<script setup lang="ts">
/**
 * Bandeau de comparaison (MEM-25) : ce qui diffère entre le run original et
 * sa branche, affiché au-dessus des deux panneaux.
 *
 * Le premier point de divergence est le premier nœud dont le nom, l'état ou la
 * tâche diffère entre les deux lectures. Le coût et le score d'évaluation
 * viennent de M6 : tant que ce jalon n'est pas livré, le bandeau n'en montre
 * pas, plutôt que de les inventer. La durée, elle, est mesurée.
 */
import { computed } from 'vue'
import type { RunReadModel } from '../run/readModel'
import { firstDivergence } from '../run/divergence'
import { nodeName } from '../run/names'
import { secondsText } from '../run/gate'

const props = defineProps<{
  left: RunReadModel
  right: RunReadModel
}>()

const STATE_LABELS: Record<string, string> = {
  running: 'en cours',
  waiting: 'en attente',
  finished: 'terminé',
  failed: 'en erreur',
}

const RUN_LABELS: Record<RunReadModel['status'], string> = {
  idle: 'Chargement',
  running: 'En cours',
  waiting: 'En attente de décision',
  finished: 'Terminé',
  failed: 'En erreur',
}

const DIVERGENCE_LABELS = {
  none: 'Les deux branches sont identiques.',
  node: (name: string) => `Premier point de divergence : ${nodeName(name)}.`,
  state: (name: string, state: string) =>
    `Premier point de divergence : ${nodeName(name)}, ${STATE_LABELS[state] ?? state} sur la branche.`,
}

const divergence = computed(() => firstDivergence(props.left, props.right))

const divergenceText = computed(() => {
  const d = divergence.value
  if (!d) return DIVERGENCE_LABELS.none
  if (d.kind === 'state' && d.state) return DIVERGENCE_LABELS.state(d.name, d.state)
  return DIVERGENCE_LABELS.node(d.name)
})

const sides = computed(() => [
  { key: 'left', title: 'Run original', model: props.left },
  { key: 'right', title: 'Branche', model: props.right },
])
</script>

<template>
  <section class="banner" data-comparison-banner>
    <div class="box" data-divergence>
      <p class="text" data-divergence-text>{{ divergenceText }}</p>
      <dl class="sides">
        <div v-for="side in sides" :key="side.key">
          <dt>{{ side.title }}</dt>
          <dd
            :class="{
              ok: side.model.status === 'finished',
              bad: side.model.status === 'failed',
            }"
          >
            {{ RUN_LABELS[side.model.status] }}, {{ secondsText(side.model.at) }}
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.banner {
  padding: var(--space-md) var(--space-20);
}
.box {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm) var(--space-xl);
  padding: var(--space-md) var(--space-20);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}
.text {
  font: 400 var(--text-voice) / 1.3 var(--font-serif);
}
.sides {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-xl);
  margin: 0;
}
dt {
  color: var(--color-muted);
  font-size: var(--text-xs);
}
dd {
  margin: 0;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
.ok {
  color: var(--color-success);
}
.bad {
  color: var(--color-error);
}
@media (max-width: 40rem) {
  .banner {
    padding-inline: var(--space-sm);
  }
}
</style>
