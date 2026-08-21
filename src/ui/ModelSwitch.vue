<script setup lang="ts">
// The switch. Two possible sources for the model: the site's own, which goes
// through a relay keeping the key server-side, or the visitor's key, which
// lives in module memory and never in browser storage. Either way the user is
// told, before the first call, what leaves for the provider.
import { ref } from 'vue'
import type { ReasoningOrigin } from '../runtime/reasoner'

export type ModelSource = 'none' | 'relay' | 'key'

defineProps<{
  mode: ReasoningOrigin
  source: ModelSource
  /** The site's relay answers and carries a key: without that, nothing to offer. */
  relayReady: boolean
}>()
const emit = defineEmits<{
  connectKey: [key: string]
  connectRelay: []
  disconnect: []
}>()

const open = ref(false)
const key = ref('')
const consented = ref(false)

function connect() {
  if (key.value.trim().length === 0 || !consented.value) return
  emit('connectKey', key.value.trim())
  // The key leaves the field as soon as it is handed over: it does not stay on
  // screen.
  key.value = ''
  open.value = false
}

function toggle() {
  // The key must not survive closing the panel: it would reappear on reopening,
  // which the screen promises the opposite of.
  if (open.value) key.value = ''
  open.value = !open.value
}

function connectRelay() {
  emit('connectRelay')
  open.value = false
}

function disconnect() {
  emit('disconnect')
  consented.value = false
  open.value = false
}

const label = (mode: ReasoningOrigin, source: ModelSource): string => {
  if (source === 'relay') return 'modèle du site — changer'
  if (mode === 'llm') return 'modèle branché — débrancher'
  return 'brancher un modèle'
}
</script>

<template>
  <div class="model">
    <button class="mode-help" :aria-expanded="open" aria-controls="model-panel" @click="toggle">
      {{ label(mode, source) }}
    </button>

    <div v-if="open" id="model-panel" class="model-panel">
      <template v-if="source === 'relay'">
        <p class="model-note">
          Le modèle du site fait naître les agents, décide de ce qu’ils se demandent et écrit le
          code de leurs outils. La clé reste sur le serveur, le quota est partagé : au-delà, le run
          s’arrête là où il en est.
        </p>
        <button class="button button-ghost" @click="disconnect">
          Repasser à la démonstration rejouée
        </button>
      </template>

      <template v-else-if="source === 'key'">
        <p class="model-note">
          Un modèle est branché. Le prochain run fera naître des agents que personne n’a écrits.
        </p>
        <button class="button button-ghost" @click="disconnect">Débrancher</button>
      </template>

      <template v-else>
        <template v-if="relayReady">
          <p class="model-note">
            Le site porte son propre modèle : aucune clé à fournir, quota partagé entre visiteurs.
          </p>
          <button class="button" @click="connectRelay">Utiliser le modèle du site</button>
          <p class="eyebrow">ou votre propre clé</p>
        </template>

        <label class="eyebrow" for="api-key">Clé d’API Anthropic</label>
        <input
          id="api-key"
          v-model="key"
          class="brief-field model-field"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk-ant-…"
        />
        <p class="model-note">
          La clé reste en mémoire de cet onglet. Elle n’est ni enregistrée, ni journalisée, et ne
          part que chez Anthropic.
        </p>
        <label class="model-consent">
          <input v-model="consented" type="checkbox" />
          <span>
            J’ai compris que le contenu du run — besoin, échanges, artefacts — sera envoyé à
            Anthropic pour être traité, et que le code écrit par le modèle sera exécuté dans cet
            onglet.
          </span>
        </label>
        <button class="button" :disabled="key.trim().length === 0 || !consented" @click="connect">
          Brancher le modèle
        </button>
      </template>
    </div>
  </div>
</template>
