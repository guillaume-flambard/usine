<script setup lang="ts">
// Une ligne, pas cinq boîtes.
//
// Chaque fait y est un mot, séparé par des points médians, et le point du mode
// le dit sans avoir à le lire. Elle a remplacé cinq boîtes ; elle ne doit
// jamais redevenir un tableau.
//
// Le détail se déplie à la demande : ce qui explique le mode, les sources
// branchables, les tours rendus hors forme, le rapport d'éval. Le sélecteur de
// modèle y vit aussi, par le slot — cette ligne n'a pas à savoir comment on
// branche un modèle.
import type { ReasoningOrigin } from '../runtime/reasoner'
import type { ModelSource } from './ModelSwitch.vue'

defineProps<{
  mode: ReasoningOrigin
  source: ModelSource
  started: boolean
  phase: string
  liveAgents: number
  elapsed: string
  tokens: number
  /**
   * Ce qu'il reste, en runs. Absent tant que la sonde n'a pas répondu : « votre
   * capacité est épuisée » et « on n'a pas encore demandé » sont deux faits
   * différents.
   */
  capacity?: { visitor: number; site: number }
  open: boolean
  replayReason: string
  wired: readonly { name: string; description: string }[]
  malformed: number
  measurements?: string
}>()
</script>

<template>
  <p class="status" aria-live="polite">
    <span class="mode-dot" :data-connected="mode === 'llm'" aria-hidden="true"></span>
    <span>
      {{ mode === 'llm' ? (source === 'relay' ? 'modèle du site' : 'modèle branché') : 'run rejoué' }}
    </span>
    <template v-if="started">
      <span class="status-sep" aria-hidden="true">·</span>
      <span>{{ phase.toLowerCase() }}</span>
      <span class="status-sep" aria-hidden="true">·</span>
      <span>{{ liveAgents }} agents</span>
      <span class="status-sep" aria-hidden="true">·</span>
      <span>{{ elapsed }}</span>
      <template v-if="tokens > 0">
        <span class="status-sep" aria-hidden="true">·</span>
        <span>{{ tokens }} tokens</span>
      </template>
    </template>
    <template v-else-if="capacity">
      <span class="status-sep" aria-hidden="true">·</span>
      <span>{{ capacity.visitor }} run(s) pour vous</span>
    </template>
  </p>

  <div v-if="open" id="status-detail" class="status-detail">
    <p v-if="mode === 'llm'">
      Aucun agent n’est écrit d’avance. Un modèle{{
        source === 'relay' ? ' hébergé par le site, sans clé de votre part' : ''
      }}
      décide lesquels existent, ce qu’ils se demandent, et le code qu’ils écrivent — puis
      l’application qu’ils posent se refait autour de ce que vous en faites, sans vous faire perdre
      votre place.
    </p>
    <p v-else>
      {{ replayReason }} Les décisions sont enregistrées et rejouées ; tout le reste est réel — le
      code est évalué dans un fil isolé, remplacé à chaud, et exécuté sur ce que vous taperez.
    </p>
    <p v-if="wired.length > 0">Sources branchables : {{ wired.map((s) => s.name).join(', ') }}.</p>
    <p v-if="malformed > 0">{{ malformed }} tour(s) rendus hors forme par le modèle.</p>
    <p v-if="measurements" class="status-eval">{{ measurements }}</p>
    <slot name="model" />
  </div>
</template>
