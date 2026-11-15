<script setup lang="ts">
/**
 * The human gate (MEM-21): approve, reject with a reason, or edit then approve.
 *
 * A real dialog (UModal on reka-ui: role="dialog", focus trapped, Escape closes)
 * and `inert` on the rest of the page while it is open, the debt noted in v1.
 * The decision goes to POST /api/runs/{id}/gate (MEM-20) through the chat.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { GateView } from '../run/readModel'

export interface GateDecisionInput {
  decision: 'approve' | 'reject' | 'edit'
  reason?: string
  actions?: GateView['actions']
}

const props = defineProps<{ gate: GateView }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ decide: [decision: GateDecisionInput] }>()

const mode = ref<'choose' | 'reject' | 'edit'>('choose')
const reason = ref('')
const previews = ref<string[]>([])

const KINDS: Record<string, string> = {
  external_write: 'Écriture externe',
  send: 'Envoi',
  pull_request: 'Pull request',
}

// The rest of the page cannot be reached while the decision is open. The gate
// usually opens by itself the moment the run announces it (the component then
// mounts already open), so the attribute is set on mount too, and cleared if
// the dialog goes away while still open.
function setInert(value: boolean) {
  document.querySelector('[data-shell]')?.toggleAttribute('inert', value)
}

watch(
  open,
  (value) => {
    setInert(value)
    if (value) {
      mode.value = 'choose'
      reason.value = ''
      previews.value = props.gate.actions.map((a) => a.preview)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => setInert(false))

const canReject = computed(() => reason.value.trim().length > 0)

function decide(decision: GateDecisionInput) {
  emit('decide', decision)
  open.value = false
}

function approveEdited() {
  decide({
    decision: 'edit',
    actions: props.gate.actions.map((a, i) => ({ ...a, preview: previews.value[i] ?? a.preview })),
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Porte humaine"
    description="Une action irréversible attend votre décision."
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4" data-gate-dialog :data-gate-mode="mode">
        <section
          v-for="(action, index) in gate.actions"
          :key="`${action.kind}-${action.target}`"
          class="flex flex-col gap-1"
        >
          <h3 class="font-medium">
            {{ KINDS[action.kind] ?? action.kind }} vers {{ action.target }}
          </h3>
          <p class="text-sm text-toned">Justification de l'agent : {{ action.justification }}</p>
          <UFormField
            v-if="mode === 'edit'"
            :label="`Aperçu modifié (${index + 1})`"
            :name="`preview-${index}`"
          >
            <UTextarea
              v-model="previews[index]"
              :rows="4"
              autoresize
              class="w-full"
              :ui="{ base: 'text-base' }"
              data-gate-preview-input
            />
          </UFormField>
          <pre
            v-else
            class="max-h-48 overflow-auto rounded-md bg-elevated p-3 text-sm whitespace-pre-wrap"
            data-gate-preview
            >{{ action.preview }}</pre>
        </section>

        <p class="text-sm text-toned" data-gate-notice>{{ gate.notice }}</p>

        <UFormField
          v-if="mode === 'reject'"
          label="Motif du rejet"
          name="reason"
          required
          help="Il est gardé avec le run, et visible dans la trace."
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            autofocus
            class="w-full"
            :ui="{ base: 'text-base' }"
            data-gate-reason
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <template v-if="mode === 'choose'">
          <UButton
            color="neutral"
            variant="outline"
            size="xl"
            label="Modifier"
            :ui="{ base: 'min-h-11' }"
            data-gate-edit
            @click="mode = 'edit'"
          />
          <UButton
            color="error"
            variant="soft"
            size="xl"
            label="Rejeter"
            :ui="{ base: 'min-h-11' }"
            data-gate-reject
            @click="mode = 'reject'"
          />
          <UButton
            color="primary"
            size="xl"
            label="Approuver"
            :ui="{ base: 'min-h-11' }"
            data-gate-approve
            @click="decide({ decision: 'approve' })"
          />
        </template>
        <template v-else>
          <UButton
            color="neutral"
            variant="ghost"
            size="xl"
            label="Retour"
            :ui="{ base: 'min-h-11' }"
            data-gate-back
            @click="mode = 'choose'"
          />
          <UButton
            v-if="mode === 'reject'"
            color="error"
            size="xl"
            label="Confirmer le rejet"
            :disabled="!canReject"
            :ui="{ base: 'min-h-11' }"
            data-gate-confirm-reject
            @click="decide({ decision: 'reject', reason: reason.trim() })"
          />
          <UButton
            v-else
            color="primary"
            size="xl"
            label="Approuver la version modifiée"
            :ui="{ base: 'min-h-11' }"
            data-gate-confirm-edit
            @click="approveEdited"
          />
        </template>
      </div>
    </template>
  </UModal>
</template>
