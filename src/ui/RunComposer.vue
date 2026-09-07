<script setup lang="ts">
// Le composeur, en bas, là où l'on écrit.
//
// Le champ démarre vide, et c'est une règle produit : un besoin pré-rempli
// puis soumis tel quel ruinerait la seule preuve dont le visiteur dispose que
// rien n'est enregistré d'avance. Le bouton reste éteint tant que rien n'est
// écrit — un bouton actif qui ne ferait rien serait pire qu'un bouton éteint.
import type { ReasoningOrigin } from '../runtime/reasoner'

defineProps<{
  mode: ReasoningOrigin
  started: boolean
  starting: boolean
  /** Ce besoin-là, la démo sait le rejouer : sinon on le dit avant le clic. */
  replayable: boolean
}>()

const brief = defineModel<string>({ required: true })

defineEmits<{ launch: []; playRecorded: []; importTrace: [Event] }>()
</script>

<template>
  <div class="composer">
    <h1 class="hidden-title">L'usine agentique — l'application qui se refait sous vous</h1>
    <label class="hidden-title" for="brief">Le besoin</label>
    <UTextarea
      id="brief"
      v-model="brief"
      class="brief-field w-full"
      :rows="2"
      placeholder="Décrivez un besoin. L’usine n’existe pas encore."
      data-brief
      @keydown.meta.enter="$emit('launch')"
      @keydown.ctrl.enter="$emit('launch')"
    />
    <div class="composer-row">
      <!-- Le site sans clé ne peut rien inventer : une seule entrée rejoue le
           run enregistré, pour qu'il ne soit pas muet. Rien de jargon n'est
           exposé — le libellé du besoin reste caché. -->
      <UButton
        v-if="mode === 'demo' && !started"
        type="button"
        variant="outline"
        color="neutral"
        class="recorded-run"
        data-recorded-run
        @click="$emit('playRecorded')"
      >
        Voir un run enregistré
      </UButton>
      <span class="composer-hint">
        {{
          mode === 'demo' && brief.trim().length > 0 && !replayable
            ? 'Sans modèle branché, ce besoin ne produira rien.'
            : '⌘↵'
        }}
      </span>
      <!-- Importer une trace d'un agent étranger (LangGraph, OTLP) : elle est
           rejouée et mesurée, mais non forkable. -->
      <label class="picker import-trace">
        Importer une trace
        <input
          type="file"
          accept="application/json,.json"
          class="hidden-title"
          aria-label="Importer une trace d'agent (LangGraph ou OTLP, JSON)"
          @change="$emit('importTrace', $event)"
        />
      </label>
      <UButton
        :disabled="starting || brief.trim().length === 0"
        data-launch
        @click="$emit('launch')"
      >
        {{ started ? 'Relancer' : "Lancer l'usine" }}
      </UButton>
    </div>
  </div>
</template>
