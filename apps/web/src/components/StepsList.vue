<script setup lang="ts">
/**
 * "Étapes, une par checkpoint" (MEM-86): the checkpoints LangGraph saved for
 * the open run, in order, each on the thread of the node it would run next.
 * They are what a fork can start from. Read again when the run moves on.
 */
import { computed, ref, watch } from 'vue'
import { checkpointLabel, fetchCheckpoints, type Checkpoint } from '../chat/forks'
import { threadOfName } from '../run/threads'

const props = defineProps<{ threadId: string; refresh?: number }>()

const checkpoints = ref<Checkpoint[]>([])
const failure = ref('')

async function load() {
  failure.value = ''
  try {
    const points = await fetchCheckpoints(props.threadId)
    checkpoints.value = Array.isArray(points) ? points : []
  } catch (error) {
    failure.value = (error as Error).message
  }
}

watch([() => props.threadId, () => props.refresh], load, { immediate: true })

const steps = computed(() =>
  [...checkpoints.value]
    .sort((a, b) => (a.step ?? Infinity) - (b.step ?? Infinity))
    .map((checkpoint) => ({
      id: checkpoint.checkpoint_id,
      label: checkpointLabel(checkpoint),
      thread: checkpoint.next[0] ? threadOfName(checkpoint.next[0]) : 'ink',
    })),
)
</script>

<template>
  <div v-if="steps.length || failure" class="steps-block" data-steps>
    <h3>Étapes, une par checkpoint</h3>
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    <ol class="steps">
      <li v-for="step in steps" :key="step.id" :data-thread="step.thread" data-step>
        <span class="thr" aria-hidden="true" />{{ step.label }}
      </li>
    </ol>
  </div>
</template>

<style scoped>
h3 {
  margin: 0 var(--space-xs) var(--space-xs);
  color: var(--color-ink-2);
  font: 600 var(--text-sm) / 1.2 var(--font-sans);
}
.steps {
  margin: 0;
  padding: 0;
  list-style: none;
}
.steps li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-xs);
  border-radius: var(--radius-in);
  font-size: var(--text-sm);
  line-height: 1.35;
}
.steps li:last-child {
  background: var(--color-paper-2);
}
.thr {
  flex: none;
  width: 2px;
  height: 18px;
  border-radius: 2px;
  background: var(--t);
}
.failure {
  margin: 0 var(--space-xs);
  color: var(--color-error);
  font-size: var(--text-sm);
}
</style>
