<script setup lang="ts">
// Two buttons of equal visual weight. The product does not nudge toward
// approval: a steered decision is worth nothing and turns the gate into
// decoration — exactly what we refuse.
import { nextTick, ref, watch } from 'vue'
import type { GateView } from '../state/model'

const props = defineProps<{ gate: GateView }>()
defineEmits<{ approve: []; reject: [] }>()

const firstButton = ref<HTMLButtonElement | undefined>()

// Focus comes to the gate: otherwise you would have to tab through a dozen
// graph nodes to reach the decision, and pressing Enter out of habit would
// restart the run instead of settling it.
watch(
  () => props.gate.id,
  async () => {
    await nextTick()
    firstButton.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="gate"
    :aria-label="gate.decision === undefined ? 'Décision requise' : 'Décision prise'"
  >
    <div class="gate-body">
      <p class="eyebrow">
        {{ gate.decision === undefined ? 'Décision requise' : 'Décision prise' }}
      </p>
      <p id="gate-summary" class="gate-summary">{{ gate.subject.summary }}</p>
      <p id="gate-objection" class="gate-objection">
        <b>Sceptique —</b> {{ gate.subject.objection }}
      </p>
    </div>
    <div v-if="gate.decision === undefined" class="gate-actions">
      <button
        ref="firstButton"
        class="button button-ghost"
        aria-describedby="gate-summary gate-objection"
        @click="$emit('reject')"
      >
        Écarter
      </button>
      <button
        class="button button-ghost"
        aria-describedby="gate-summary gate-objection"
        @click="$emit('approve')"
      >
        Approuver
      </button>
    </div>
    <p v-else class="gate-verdict">
      {{ gate.decision === 'approved' ? 'Approuvée' : 'Écartée' }}
    </p>
  </section>
</template>
