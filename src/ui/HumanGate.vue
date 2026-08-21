<script setup lang="ts">
// Two buttons of equal visual weight. The product does not nudge toward
// approval: a steered decision is worth nothing and turns the gate into
// decoration — exactly what we refuse.
import { nextTick, ref, watch } from 'vue'
import type { GateView } from '../state/model'

const props = defineProps<{
  gate: GateView
  /**
   * Whether an application is serving right now. The gate no longer decides
   * whether something appears — it decides the fate of something in use — so
   * what each gesture costs depends on this.
   */
  serving: boolean
}>()
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
      <!-- What each gesture costs, before the click and not after. Rejecting
           now destroys something the visitor has under their hands. -->
      <p v-if="serving" id="gate-cost" class="gate-cost">
        L’application vous sert déjà. <b>Emporter</b> la valide et vous la laisse.
        <b>Écarter</b> la retire : les composants sont relâchés et vous perdez ce qui tourne.
      </p>
    </div>
    <div v-if="gate.decision === undefined" class="gate-actions">
      <button
        ref="firstButton"
        class="button button-ghost"
        aria-describedby="gate-summary gate-objection gate-cost"
        @click="$emit('reject')"
      >
        Écarter
      </button>
      <button
        class="button button-ghost"
        aria-describedby="gate-summary gate-objection gate-cost"
        @click="$emit('approve')"
      >
        {{ serving ? 'Emporter' : 'Approuver' }}
      </button>
    </div>
    <p v-else class="gate-verdict">
      {{ gate.decision === 'approved' ? 'Emportée' : 'Écartée' }}
    </p>
  </section>
</template>

<style scoped>
.gate-cost {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted, #6b6560);
}
</style>
