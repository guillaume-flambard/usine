<script setup lang="ts">
// Ce qui remplace le spinner pendant qu'un modèle réfléchit.
//
// Le contrat : ce qui s'affiche ici est mesuré, jamais inventé. Le nom de
// l'agent et ce qu'on lui demande viennent du flux d'événements ; le temps est
// compté depuis l'instant où l'attente est apparue. Une barre de progression
// fabriquée tiendrait jusqu'au premier échec, puis détruirait la confiance d'un
// coup — ici il n'y a rien à inventer, donc rien qui puisse mentir.
//
// Le compteur tourne dans le composant plutôt que dans le flux : un battement
// toutes les deux secondes émis par le kernel ferait des centaines
// d'événements par run, tous rejoués et archivés pour ne rien dire. Le flux
// porte le départ et l'arrivée, l'écran porte le tic-tac.
import { onUnmounted, ref, watch } from 'vue'
import type { ThinkingView } from '../state/model'

const props = defineProps<{ thinking: readonly ThinkingView[] }>()

/** Réveillé une fois par seconde, uniquement tant que quelqu'un attend. */
const now = ref(Date.now())
/** Quand chaque attente est apparue à l'écran, pour compter à partir de là. */
const startedAt = new Map<string, number>()
let ticker: ReturnType<typeof setInterval> | undefined

function stopTicking() {
  if (ticker === undefined) return
  clearInterval(ticker)
  ticker = undefined
}

// Un `watch`, pas un `computed` : tenir une minuterie et une table est un
// effet, et un calcul dérivé qui a des effets se rejoue sans prévenir.
watch(
  () => props.thinking,
  (live) => {
    for (const entry of live) if (!startedAt.has(entry.id)) startedAt.set(entry.id, Date.now())
    for (const id of startedAt.keys()) {
      if (!live.some((entry) => entry.id === id)) startedAt.delete(id)
    }
    // Pas de minuterie quand personne n'attend : une page au repos ne doit pas
    // réveiller le navigateur chaque seconde pour afficher un vide.
    if (live.length === 0) {
      stopTicking()
      return
    }
    if (ticker === undefined) {
      now.value = Date.now()
      ticker = setInterval(() => (now.value = Date.now()), 1000)
    }
  },
  { immediate: true },
)

onUnmounted(stopTicking)

/** Les secondes écoulées, arrondies vers le bas : un compteur n'anticipe pas. */
const seconds = (entry: ThinkingView): number =>
  Math.max(0, Math.floor((now.value - (startedAt.get(entry.id) ?? now.value)) / 1000))
</script>

<template>
  <p
    v-for="entry in thinking"
    :key="entry.id"
    class="flex items-baseline gap-2 text-sm text-muted"
    data-reasoning
    role="status"
    aria-live="polite"
  >
    <span class="pulse" aria-hidden="true" />
    <span>
      <span class="text-toned">{{ entry.author }}</span>
      réfléchit
      <template v-if="entry.about.length > 0"> — {{ entry.about }}</template>
      <span class="tabular-nums"> ({{ seconds(entry) }} s)</span>
    </span>
  </p>
</template>

<style scoped>
.pulse {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: currentColor;
  animation: breathe 1.6s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

/* Une animation qui respire n'a rien d'essentiel : elle se coupe pour qui a
   demandé moins de mouvement. Le texte et le compteur, eux, restent. */
@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
    opacity: 0.6;
  }
}
</style>
