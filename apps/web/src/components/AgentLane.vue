<script setup lang="ts">
/**
 * One agent on its thread (DESIGN.md, the base's « Lane »): its colour on the
 * top edge, its name in the voice face, its status in words, and the thread
 * running down its steps, one knot per event, a dashed segment for what is
 * still pending. No badge, no dot pill.
 *
 * `live`: steps arrive while the page is open (the visit), so each new step
 * fades and rises into place. Without it (the public page) steps are simply
 * there; that page choreographs them itself.
 */
import type { Thread } from '../run/threads'

export interface LaneStep {
  /** The words of the step. */
  text: string
  /** A file, tool or id, set in the data face after the words. */
  code?: string
  /** Words after the code; a leading comma sticks to it. */
  after?: string
  /** A real event happened; a pending step keeps an open knot and a dashed thread. */
  done: boolean
}

defineProps<{
  thread: Thread
  name: string
  status: string
  steps: LaneStep[]
  live?: boolean
}>()
</script>

<template>
  <section
    class="lane"
    :class="{ live }"
    :data-thread="thread"
    :aria-label="`${name}, ${status}`"
    data-agent-lane
  >
    <h3 class="agent">{{ name }}</h3>
    <p class="status" aria-live="polite">{{ status }}</p>
    <ol class="trace">
      <li v-for="(step, i) in steps" :key="i" :class="{ done: step.done }" :style="{ '--step': i }">
        <!-- Spaces as expressions: the template compiler drops layout whitespace. -->
        <span
          >{{ step.text
          }}<template v-if="step.code"
            >{{ ' ' }}<span class="mono">{{ step.code }}</span></template
          ><template v-if="step.after">{{
            step.after.startsWith(',') ? step.after : ` ${step.after}`
          }}</template></span
        >
      </li>
    </ol>
  </section>
</template>

<style scoped>
.lane {
  position: relative;
  padding: var(--space-lg) var(--space-lg) var(--space-md);
  border-radius: var(--radius-in);
  background: var(--color-surface);
  box-shadow:
    var(--shadow-1),
    0 0 0 1px var(--color-rule);
}
/* The thread: the lane's top edge, in its agent's colour. */
.lane::before {
  content: '';
  position: absolute;
  top: 0;
  right: var(--space-lg);
  left: var(--space-lg);
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--t);
}
.agent {
  margin: 0;
  font: 400 var(--text-xl) / 1.15 var(--font-voice);
}
.status {
  margin: 2px 0 var(--space-md);
  color: var(--tt);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: color var(--dur-short) var(--ease-out);
}
.trace {
  margin: 0;
  padding: 0;
  list-style: none;
}
/* The separators live on the text column only: the thread keeps its own
   column, uncrossed (owner, 17 November 2026: the rules cut through it). */
.trace li {
  position: relative;
  display: grid;
  grid-template-columns: 10px 1fr;
  column-gap: var(--space-sm);
  font-size: var(--text-sm);
  line-height: 1.45;
}
.trace li > span {
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-rule);
}
.trace li:first-child > span {
  border-top: 1px solid var(--color-rule);
}
.trace li:last-child > span {
  padding-bottom: var(--space-2xs);
  border-bottom: 0;
}
.trace li::before {
  content: '';
  position: relative;
  z-index: 1;
  width: 10px;
  height: 10px;
  margin-top: calc(var(--space-sm) + 5px);
  border: 2px solid var(--t);
  border-radius: 50%;
  background: var(--color-surface);
  transition: background-color var(--dur-short) var(--ease-out);
}
.trace li.done::before {
  background: var(--t);
}
.trace li::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  background: var(--t);
}
.trace li:first-child::after {
  top: calc(var(--space-sm) + 10px);
}
.trace li:last-child::after {
  bottom: auto;
  height: calc(var(--space-sm) + 5px);
}
.trace li:only-child::after {
  display: none;
}
.trace li:not(.done)::after {
  background: repeating-linear-gradient(180deg, var(--t) 0 4px, transparent 4px 7px);
}
.trace .mono {
  color: var(--color-ink-2);
  font-size: 0.92em;
}
/* Live: a step born from a new event fades and rises into place, once. */
.live .trace li {
  transition:
    opacity 300ms var(--ease-out),
    transform 300ms var(--ease-out);
  @starting-style {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
