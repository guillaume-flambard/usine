<script setup lang="ts">
/**
 * The inspector (MEM-86): the conversation, what the run proposes, and what
 * it read.
 *
 * Conversation holds the briefs and answers (the default slot). Action holds
 * the gate inline (GatePanel), and exists once the run proposes one. Preuves lists the tools each
 * specialist called, from its `node-finished` event; the tab exists only when
 * there is something to show. There is no Trace tab: the stream carries no
 * Langfuse address yet, and a link to nowhere would lie.
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { RunReadModel } from '../run/readModel'
import { threadsOf } from '../run/threads'
import { secondsText } from '../run/gate'
import GatePanel, { type GateDecisionInput } from './GatePanel.vue'

const props = defineProps<{ model: RunReadModel; busy?: boolean }>()
const emit = defineEmits<{ decide: [decision: GateDecisionInput] }>()

type Tab = 'talk' | 'action' | 'proofs'
const tab = ref<Tab>(props.model.gate ? 'action' : 'talk')

const proofs = computed(() => {
  const threads = threadsOf(props.model.nodes)
  let rank = 0
  return props.model.nodes.flatMap((node) => {
    if (node.name !== 'specialist') return []
    rank += 1
    const calls = (node.specialists ?? []).filter((s) => (s.tools ?? []).length > 0)
    if (calls.length === 0) return []
    return [
      {
        id: node.id,
        title: `Spécialiste ${rank}`,
        thread: threads.get(node.id) ?? 'sky',
        task: node.task ?? '',
        duration:
          node.finishedAt === undefined ? '' : secondsText(node.finishedAt - node.startedAt),
        calls,
      },
    ]
  })
})

const tabs = computed(() => [
  { id: 'talk' as const, label: 'Conversation' },
  ...(props.model.gate ? [{ id: 'action' as const, label: 'Action' }] : []),
  ...(proofs.value.length ? [{ id: 'proofs' as const, label: 'Preuves' }] : []),
])

watch(proofs, (list) => {
  if (list.length === 0 && tab.value === 'proofs') tab.value = 'talk'
})

const gateCard = ref<HTMLElement | null>(null)
const waiting = computed(() => props.model.status === 'waiting' && Boolean(props.model.gate))
watch(waiting, (value) => {
  if (value) tab.value = 'action'
})

/** Brings the gate card into view and gives it the focus (from the graph's knot). */
async function focusGate() {
  tab.value = 'action'
  await nextTick()
  const card = gateCard.value?.querySelector<HTMLElement>('[data-gate-card]')
  card?.scrollIntoView({ block: 'nearest' })
  card?.focus({ preventScroll: true })
}
defineExpose({ focusGate })

function onTabKey(event: KeyboardEvent) {
  const ids = tabs.value.map((t) => t.id)
  const at = ids.indexOf(tab.value)
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    const next = ids[(at + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]!
    tab.value = next
    void nextTick(() =>
      (event.currentTarget as HTMLElement | null)
        ?.querySelector<HTMLElement>(`[data-tab="${next}"]`)
        ?.focus(),
    )
  }
}

const STATUS: Record<RunReadModel['status'], string> = {
  idle: 'Le run n’a pas commencé.',
  running: 'Le run travaille. Une action qui sortirait du système s’arrêtera ici, à la porte.',
  waiting: '',
  finished: 'Run terminé, aucune action ne sort du système.',
  failed: 'Le run s’est arrêté sur une erreur, rien n’est sorti du système.',
}
</script>

<template>
  <aside class="insp" aria-label="Inspecteur" data-inspector>
    <div
      v-if="tabs.length > 1"
      class="seg"
      role="tablist"
      aria-label="Vue de l’inspecteur"
      @keydown="onTabKey"
    >
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="tab === t.id"
        :tabindex="tab === t.id ? 0 : -1"
        :data-tab="t.id"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-show="tab === 'talk'" :role="tabs.length > 1 ? 'tabpanel' : undefined">
      <p v-if="!model.gate" class="quiet" data-inspector-empty>{{ STATUS[model.status] }}</p>
      <slot />
    </div>

    <div v-if="model.gate" v-show="tab === 'action'" ref="gateCard" role="tabpanel">
      <GatePanel
        :gate="model.gate"
        :busy="busy"
        shortcuts
        autofocus
        @decide="(d) => emit('decide', d)"
      />
    </div>

    <div v-if="tab === 'proofs'" role="tabpanel" class="proofs" data-proofs>
      <section v-for="proof in proofs" :key="proof.id" class="pane" :data-thread="proof.thread">
        <h3 class="pane-head"><span class="thr" aria-hidden="true" />{{ proof.title }}</h3>
        <p v-if="proof.task" class="task">{{ proof.task }}</p>
        <ul v-for="call in proof.calls" :key="call.name" class="calls">
          <li v-for="(tool, i) in call.tools" :key="i" class="mono">{{ tool }}</li>
          <li class="facts">
            {{ call.framework }}, {{ call.tokens.toLocaleString('fr-FR') }} jetons<template
              v-if="proof.duration"
              >, {{ proof.duration }}</template
            >
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.insp {
  min-width: 0;
  overflow: auto;
  padding: var(--space-md) var(--space-md) var(--space-20);
  border-left: 1px solid var(--color-rule);
  background: var(--color-surface);
}
.seg {
  display: flex;
  margin-bottom: var(--space-xl);
  padding: var(--space-2xs);
  border-radius: var(--radius-pill);
  background: var(--color-paper-3);
}
.seg button {
  flex: 1;
  /* 44 px: the touch target floor (ui-check, 16 November 2026). */
  height: 44px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-ink-2);
  font: 500 var(--text-sm) / 1 var(--font-sans);
  cursor: pointer;
}
.seg button:hover {
  color: var(--color-ink);
}
.seg button[aria-selected='true'] {
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: var(--shadow-1);
}
.quiet {
  padding: 0 var(--space-xs) var(--space-md);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.proofs {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.pane-head {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0 0 var(--space-xs);
  color: var(--tt);
  font: 600 var(--text-sm) / 1.2 var(--font-sans);
}
.thr {
  display: inline-block;
  width: 2px;
  height: 18px;
  border-radius: 2px;
  background: var(--t);
}
.task {
  margin-bottom: var(--space-sm);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}
.calls {
  display: grid;
  gap: var(--space-2xs);
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-in);
  background: var(--color-paper-2);
  box-shadow: inset 0 0 0 1px var(--color-rule);
  list-style: none;
}
.calls .mono {
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.facts {
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
</style>
