<script setup lang="ts">
// Two buttons of equal visual weight. The product does not nudge toward
// approval: a steered decision is worth nothing and turns the gate into
// decoration — exactly what we refuse. Equal weight is enforced by giving both
// the same variant, colour and size, and by a test that compares them.
//
// The gate stays a sheet in the scene rather than a dialog: it demands a
// decision, it does not offer a dismissal.
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

const firstButton = ref<{ $el?: HTMLElement } | HTMLElement | undefined>()

// Focus comes to the gate: otherwise you would have to tab through a dozen
// graph nodes to reach the decision, and pressing Enter out of habit would
// restart the run instead of settling it.
watch(
  () => props.gate.id,
  async () => {
    await nextTick()
    const held = firstButton.value
    const element = held instanceof HTMLElement ? held : held?.$el
    // The library renders a component here, so the button is inside it; a plain
    // element would be the button itself.
    const button = element?.querySelector?.('button') ?? element
    button?.focus?.()
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="gate"
    data-gate
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
      <UButton
        ref="firstButton"
        block
        variant="outline"
        color="neutral"
        size="lg"
        data-gate-action="reject"
        aria-describedby="gate-summary gate-objection gate-cost"
        @click="$emit('reject')"
      >
        Écarter
      </UButton>
      <UButton
        block
        variant="outline"
        color="neutral"
        size="lg"
        data-gate-action="approve"
        aria-describedby="gate-summary gate-objection gate-cost"
        @click="$emit('approve')"
      >
        {{ serving ? 'Emporter' : 'Approuver' }}
      </UButton>
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
