<script setup lang="ts">
/**
 * The human gate (MEM-21), inline in the inspector as "Le fil" draws it
 * (MEM-86): the proposed action with its exact arguments, then the black-bordered
 * gate card that asks the one question. Approve, correct then approve, or
 * reject with a reason. A, C and R decide from the keyboard when `shortcuts`
 * is on (one gate per page: the atelier's, not the comparison's two).
 *
 * The decision goes to POST /api/runs/{id}/gate (MEM-20) through the parent.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { GateView } from '../run/readModel'
import { ACTION_KINDS, gateQuestion, toolOf } from '../run/gate'

export interface GateDecisionInput {
  decision: 'approve' | 'reject' | 'edit'
  reason?: string
  actions?: GateView['actions']
}

const props = withDefaults(
  defineProps<{ gate: GateView; shortcuts?: boolean; autofocus?: boolean; busy?: boolean }>(),
  { shortcuts: false, autofocus: false, busy: false },
)
const emit = defineEmits<{ decide: [decision: GateDecisionInput] }>()

const mode = ref<'choose' | 'reject' | 'edit'>('choose')
const reason = ref('')
const previews = ref<string[]>(props.gate.actions.map((a) => a.preview))
const sent = ref<GateDecisionInput | null>(null)
const card = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
// The comparison shows two gates: ids must not collide.
const uid = useId()

// A new gate (a resumed run that stops again) starts the choice over.
watch(
  () => props.gate.actions,
  (actions) => {
    previews.value = actions.map((a) => a.preview)
    mode.value = 'choose'
    reason.value = ''
    sent.value = null
  },
)

const decided = computed(() => Boolean(props.gate.decision) || sent.value !== null)
const decision = computed(() => props.gate.decision ?? sent.value?.decision)
const canReject = computed(() => reason.value.trim().length > 0)
const question = computed(() => gateQuestion(props.gate))

const DONE: Record<string, string> = {
  approve: 'Approuvé. L’action part telle quelle.',
  edit: 'Approuvé, dans la version corrigée.',
  reject: 'Rejeté. Rien n’est parti, le run s’arrête ici.',
}
// The choice is only sent until the run says it was taken (gate-decided). A
// refused request used to leave "Approuvé" on screen beside a failed run
// (audit, 16 November 2026): when the request ends with no decision in the
// run, the choice is given back and the gate asks again.
const pending = computed(() => sent.value !== null && !props.gate.decision)
const refused = ref(false)
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now && sent.value && !props.gate.decision) {
      sent.value = null
      refused.value = true
    }
  },
)
const doneText = computed(() => {
  if (pending.value) return 'Décision envoyée, en attente du run.'
  const text = DONE[decision.value ?? ''] ?? ''
  const why = props.gate.reason ?? sent.value?.reason
  return decision.value === 'reject' && why ? `${text} Motif : ${why}` : text
})

function decide(input: GateDecisionInput) {
  if (decided.value || props.busy) return
  refused.value = false
  sent.value = input
  mode.value = 'choose'
  emit('decide', input)
}

function approveEdited() {
  decide({
    decision: 'edit',
    actions: props.gate.actions.map((a, i) => ({ ...a, preview: previews.value[i] ?? a.preview })),
  })
}

async function choose(next: 'reject' | 'edit') {
  if (decided.value) return
  mode.value = next
  await nextTick()
  const selector = next === 'reject' ? '[data-gate-reason]' : '[data-gate-preview-input]'
  const field = root.value?.querySelector<HTMLElement>(selector)
  ;(field?.matches('textarea') ? field : field?.querySelector('textarea'))?.focus()
}

function onKey(event: KeyboardEvent) {
  if (!props.shortcuts || decided.value || mode.value !== 'choose') return
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
  const key = event.key.toLowerCase()
  if (key === 'a') {
    event.preventDefault()
    decide({ decision: 'approve' })
  } else if (key === 'c') {
    event.preventDefault()
    void choose('edit')
  } else if (key === 'r') {
    event.preventDefault()
    void choose('reject')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (props.autofocus && !decided.value) card.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div ref="root" class="gate-panel" data-gate :data-gate-mode="mode">
    <section
      v-for="(action, index) in gate.actions"
      :key="index"
      class="pane"
      data-thread="amb"
      :aria-label="`Action proposée ${index + 1}`"
    >
      <h3 class="pane-head"><span class="thr" aria-hidden="true" />Proposée par la synthèse</h3>
      <p class="toolname">
        <span class="mono">{{ toolOf(action) }}</span>
        <span v-if="action.kind === 'external_write'" class="gated">
          <UIcon name="i-lucide-lock" class="size-3" aria-hidden="true" />irréversible
        </span>
        <span v-else class="kind">{{ ACTION_KINDS[action.kind] ?? action.kind }}</span>
      </p>
      <p class="target">
        {{ ACTION_KINDS[action.kind] ?? action.kind }} vers {{ action.target }}. Justification de
        l’agent : {{ action.justification }}
      </p>
      <label v-if="mode === 'edit'" class="edit">
        <span class="label">Arguments corrigés ({{ index + 1 }})</span>
        <textarea
          v-model="previews[index]"
          class="json"
          rows="8"
          spellcheck="false"
          data-gate-preview-input
        />
      </label>
      <pre v-else class="json" data-gate-preview>{{ action.preview }}</pre>
    </section>

    <div
      ref="card"
      class="gate"
      :class="{
        decided,
        tight: !pending && (decision === 'approve' || decision === 'edit'),
      }"
      tabindex="-1"
      :aria-labelledby="`${uid}-q`"
      data-gate-card
    >
      <h3 class="gate-head">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path class="s-sky" d="M4.6 2.4C4.6 8.6 7.6 11.4 10.4 13.6" />
          <path class="s-mag" d="M12 2.4V13" />
          <path class="s-grn" d="M19.4 2.4C19.4 8.6 16.4 11.4 13.6 13.6" />
          <circle class="f-ink" cx="12" cy="16.4" r="4.6" />
          <path class="s-ink" d="M12 21v1.8" />
        </svg>
        Porte humaine
      </h3>
      <p :id="`${uid}-q`" class="q">{{ question }}</p>
      <p class="why">
        Les arguments ci-dessus partiront tels quels.
        <span class="notice" data-gate-notice>{{ gate.notice }}</span>
      </p>

      <label v-if="mode === 'reject'" class="edit">
        <span class="label">Motif du rejet</span>
        <textarea
          v-model="reason"
          class="field"
          rows="3"
          required
          :aria-describedby="`${uid}-help`"
          data-gate-reason
        />
        <span :id="`${uid}-help`" class="help"
          >Il est gardé avec le run, et visible dans la trace.</span
        >
      </label>

      <div v-if="!decided" class="acts">
        <template v-if="mode === 'choose'">
          <button
            type="button"
            class="btn btn-ink"
            :disabled="busy"
            aria-keyshortcuts="A"
            data-gate-approve
            @click="decide({ decision: 'approve' })"
          >
            Approuver<span v-if="shortcuts" class="kbd" aria-hidden="true">A</span>
          </button>
          <button
            type="button"
            class="btn btn-line"
            :disabled="busy"
            aria-keyshortcuts="C"
            data-gate-edit
            @click="choose('edit')"
          >
            <UIcon name="i-lucide-pen-line" class="size-4" aria-hidden="true" />Corriger<span
              v-if="shortcuts"
              class="kbd"
              aria-hidden="true"
              >C</span
            >
          </button>
          <button
            type="button"
            class="btn btn-line"
            :disabled="busy"
            aria-keyshortcuts="R"
            data-gate-reject
            @click="choose('reject')"
          >
            Rejeter<span v-if="shortcuts" class="kbd" aria-hidden="true">R</span>
          </button>
        </template>
        <template v-else>
          <button
            v-if="mode === 'reject'"
            type="button"
            class="btn btn-ink"
            :disabled="!canReject || busy"
            data-gate-confirm-reject
            @click="decide({ decision: 'reject', reason: reason.trim() })"
          >
            Confirmer le rejet
          </button>
          <button
            v-else
            type="button"
            class="btn btn-ink"
            :disabled="busy"
            data-gate-confirm-edit
            @click="approveEdited"
          >
            Approuver la version corrigée
          </button>
          <button type="button" class="btn btn-line" data-gate-back @click="mode = 'choose'">
            Retour
          </button>
        </template>
      </div>
      <p class="done" aria-live="polite" data-gate-done>
        {{
          decided
            ? doneText
            : refused
              ? 'La décision n’est pas partie : rien n’a changé. Vous pouvez décider à nouveau.'
              : ''
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.gate-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.pane-head {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0 0 var(--space-sm);
  color: var(--tt);
  font: 600 var(--text-sm) / 1.2 var(--font-sans);
}
.thr {
  display: inline-block;
  flex: none;
  width: 2px;
  height: 18px;
  border-radius: 2px;
  background: var(--t);
}
.toolname {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
  font: 500 15px / 1 var(--font-mono);
}
.gated,
.kind {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  min-height: 24px;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-key);
  background: var(--color-ink);
  color: var(--color-on-ink);
  font: 500 12px / 1 var(--font-sans);
}
.kind {
  background: var(--color-paper-3);
  color: var(--color-ink-2);
}
.target {
  margin-bottom: var(--space-sm);
  color: var(--color-ink-2);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}
.json {
  display: block;
  width: 100%;
  max-height: 22rem;
  margin: 0;
  overflow: auto;
  padding: var(--space-sm) var(--space-md);
  border: 0;
  border-radius: var(--radius-in);
  background: var(--color-paper-2);
  box-shadow: inset 0 0 0 1px var(--color-rule);
  color: var(--color-ink);
  font: 400 12px / 1.62 var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}
textarea.json,
.field {
  font-size: 16px;
  resize: vertical;
}
textarea.json:focus-visible,
.field:focus-visible {
  outline: 0;
  box-shadow:
    inset 0 0 0 1px var(--color-ink),
    0 0 0 3px var(--color-paper-3);
}
.field {
  display: block;
  width: 100%;
  padding: var(--space-sm);
  border: 0;
  border-radius: var(--radius-in);
  background: var(--color-paper-2);
  box-shadow: inset 0 0 0 1px var(--color-muted);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
.edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  margin-bottom: var(--space-md);
}
.label {
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 500;
}
.help {
  color: var(--color-muted);
  font-size: var(--text-xs);
}
.gate {
  padding: var(--space-20);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: inset 0 0 0 1.5px var(--color-ink);
}
/* One ring when the card takes focus on opening: the global focus outline on
   top of the inset ink edge drew two (audit, 16 November 2026). */
.gate:focus-visible {
  outline: 2px solid var(--color-ink);
  outline-offset: 4px;
  box-shadow: none;
}
.gate:focus:not(:focus-visible) {
  outline: none;
}
.gate.decided {
  animation: settle 0.9s var(--ease-out);
}
@keyframes settle {
  from {
    transform: translateY(-8px);
  }
  to {
    transform: none;
  }
}
.gate-head {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font: 600 var(--text-sm) / 1.2 var(--font-sans);
}
.gate-head svg path {
  fill: none;
  stroke-width: 2.3;
  stroke-linecap: round;
}
.s-sky {
  stroke: var(--color-sky);
}
.s-mag {
  stroke: var(--color-mag);
}
.s-grn {
  stroke: var(--color-grn);
}
.s-ink {
  stroke: var(--color-ink);
}
.f-ink {
  fill: var(--color-ink);
}
.gate-head svg {
  transition: transform 0.7s var(--ease-out);
}
.tight .gate-head svg {
  transform: scaleX(0.8);
}
.q {
  margin-top: var(--space-xs);
  font: 400 var(--text-question) / 1.02 var(--font-serif);
  letter-spacing: -0.01em;
}
.why {
  margin: var(--space-xs) 0 var(--space-md);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.notice {
  display: block;
  margin-top: var(--space-2xs);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}
.acts .btn {
  min-height: 44px;
  padding: 0 var(--space-xs) 0 var(--space-sm);
  font-size: var(--text-sm);
}
.done:empty {
  display: none;
}
.done {
  margin-top: var(--space-sm);
  font: 400 var(--text-lg) / 1.34 var(--font-serif);
}
@media (max-width: 47.5rem) {
  .acts .btn {
    flex: 1 1 auto;
    justify-content: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gate.decided {
    animation: none;
  }
  .gate-head svg {
    transition: none;
  }
}
</style>
