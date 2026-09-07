<script setup lang="ts">
// La conversation. Du plus ancien au plus récent, comme on lit.
//
// C'est la seule chose à lire de l'écran. Elle suit ce qui arrive : sans ça la
// dernière chose dite sort du cadre et il faut faire défiler pour lire un run
// en cours. Le suivi vit ici plutôt que dans le shell — c'est ce fil qui
// défile, personne d'autre n'a à tenir sa référence.
import { nextTick, ref, watch } from 'vue'
import type { LogMessage } from '../state/model'

const props = defineProps<{
  log: readonly LogMessage[]
  incidents: readonly { error: { message: string } }[]
  /** Ce qui a tout arrêté, s'il y a lieu : prime sur les incidents du run. */
  error?: string
  /** Le dernier numéro d'événement : ce qui dit que quelque chose est arrivé. */
  lastSequence: number
}>()

const threadEl = ref<HTMLElement | null>(null)

/** Un agent qui parle deux fois de suite ne se renomme pas. */
const speakerChanges = (index: number) =>
  index === 0 || props.log[index - 1]?.author !== props.log[index]?.author

watch(
  () => props.lastSequence,
  async () => {
    await nextTick()
    const thread = threadEl.value
    if (thread !== null) thread.scrollTop = thread.scrollHeight
  },
)
</script>

<template>
  <div
    ref="threadEl"
    class="thread flex flex-col gap-5 px-5 pb-5 pt-2 text-sm leading-relaxed text-toned"
    aria-live="polite"
    data-thread
  >
    <p v-if="log.length === 0" class="max-w-[46ch] text-muted">
      Écrivez un besoin. Rien n’existe encore : les agents, leurs outils et l’application naîtront
      de ce que vous taperez — puis se referont autour de ce que vous en ferez.
    </p>
    <p
      v-for="(message, index) in log"
      :key="message.sequence"
      :class="speakerChanges(index) ? '' : '-mt-3'"
    >
      <span
        v-if="speakerChanges(index)"
        class="mb-1 block text-[11px] uppercase tracking-wide text-dimmed"
      >
        {{ message.author }}
      </span>
      {{ message.message }}
    </p>
    <p v-if="error" class="text-sm text-error" data-incident role="alert">{{ error }}</p>
    <p v-else-if="incidents.length" class="text-sm text-error" data-incident role="status">
      {{ incidents.length }} incident(s) — {{ incidents.at(-1)?.error.message }}
    </p>
  </div>
</template>
