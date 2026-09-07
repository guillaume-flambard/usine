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
    class="thread flex flex-col gap-4 px-5 pt-1 pb-4 text-toned"
    aria-live="polite"
    data-thread
  >
    <p v-if="log.length === 0" class="text-muted">
      Écrivez un besoin. Rien n’existe encore : les agents, leurs outils et l’application naîtront
      de ce que vous taperez — puis se referont autour de ce que vous en ferez.
    </p>
    <p v-for="message in log" :key="message.sequence">
      <span class="block text-[11px] font-semibold uppercase tracking-wider text-dimmed mb-1">
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
