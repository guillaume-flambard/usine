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
    class="gate flex flex-wrap items-start gap-x-8 gap-y-4 p-6"
    data-gate
    :aria-label="gate.decision === undefined ? 'Décision requise' : 'Décision prise'"
  >
    <div class="min-w-0 flex-1">
      <p class="text-[11px] uppercase tracking-wide text-primary">
        {{ gate.decision === undefined ? 'Décision requise' : 'Décision prise' }}
      </p>
      <p id="gate-summary" class="mt-1.5 max-w-[68ch] text-base text-highlighted">{{ gate.subject.summary }}</p>
      <p
        id="gate-objection"
        class="mt-3 max-w-[68ch] border-l-2 border-accented pl-3 text-sm text-muted"
      >
        <b>Sceptique —</b> {{ gate.subject.objection }}
      </p>
      <!-- What each gesture costs, before the click and not after. Rejecting
           now destroys something the visitor has under their hands. -->
      <p v-if="serving" id="gate-cost" class="mt-3 max-w-[68ch] text-sm text-toned">
        L’application vous sert déjà. <b>Emporter</b> la valide et vous la laisse.
        <b>Écarter</b> la retire : les composants sont relâchés et vous perdez ce qui tourne.
      </p>
    </div>
    <div v-if="gate.decision === undefined" class="flex shrink-0 gap-2.5">
      <UButton
        ref="firstButton"
        variant="outline"
        color="neutral"
        size="lg"
        class="min-w-[132px] justify-center"
        data-gate-action="reject"
        aria-describedby="gate-summary gate-objection gate-cost"
        @click="$emit('reject')"
      >
        Écarter
      </UButton>
      <UButton
        variant="outline"
        color="neutral"
        size="lg"
        class="min-w-[132px] justify-center"
        data-gate-action="approve"
        aria-describedby="gate-summary gate-objection gate-cost"
        @click="$emit('approve')"
      >
        {{ serving ? 'Emporter' : 'Approuver' }}
      </UButton>
    </div>
    <p v-else class="shrink-0 pt-3 text-xs uppercase tracking-widest text-muted">
      {{ gate.decision === 'approved' ? 'Emportée' : 'Écartée' }}
    </p>
  </section>
</template>
