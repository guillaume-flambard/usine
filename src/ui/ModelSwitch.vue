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

function connectRelay() {
  emit('connectRelay')
  open.value = false
}

function disconnect() {
  emit('disconnect')
  consented.value = false
  open.value = false
}

// The key must not survive closing the panel: it would reappear on reopening,
// which the screen promises the opposite of.
function onOpenChange(next: boolean) {
  if (!next) key.value = ''
}

const label = (mode: ReasoningOrigin, source: ModelSource): string => {
  if (source === 'relay') return 'modèle du site — changer'
  if (mode === 'llm') return 'modèle branché — débrancher'
  return 'brancher un modèle'
}
</script>

<template>
  <UPopover v-model:open="open" data-model-switch @update:open="onOpenChange">
    <UButton variant="link" color="neutral" data-model-toggle>
      {{ label(mode, source) }}
    </UButton>

    <template #content>
      <div class="flex w-80 flex-col gap-3 p-4" data-model-panel>
        <template v-if="source === 'relay'">
          <p class="text-sm">
            Le modèle du site fait naître les agents, décide de ce qu’ils se demandent et écrit le
            code de leurs outils. La clé reste sur le serveur, le quota est partagé : au-delà, le
            run s’arrête là où il en est.
          </p>
          <UButton block variant="subtle" color="neutral" data-model-disconnect @click="disconnect">
            Repasser à la démonstration rejouée
          </UButton>
        </template>

        <template v-else-if="source === 'key'">
          <p class="text-sm">
            Un modèle est branché. Le prochain run fera naître des agents que personne n’a écrits.
          </p>
          <UButton block variant="subtle" color="neutral" data-model-disconnect @click="disconnect">
            Débrancher
          </UButton>
        </template>

        <template v-else>
          <template v-if="relayReady">
            <p class="text-sm">
              Le site porte son propre modèle : aucune clé à fournir, quota partagé entre visiteurs.
            </p>
            <UButton block data-model-use-relay @click="connectRelay">
              Utiliser le modèle du site
            </UButton>
            <p class="text-xs uppercase tracking-widest">ou votre propre clé</p>
          </template>

          <UFormField label="Clé d’API Anthropic" name="api-key">
            <UInput
              id="api-key"
              v-model="key"
              class="w-full"
              type="password"
              autocomplete="off"
              spellcheck="false"
              placeholder="sk-ant-…"
              data-model-key
            />
          </UFormField>
          <p class="text-xs">
            La clé reste en mémoire de cet onglet. Elle n’est ni enregistrée, ni journalisée, et ne
            part que chez Anthropic.
          </p>
          <UCheckbox v-model="consented" data-model-consent>
            <template #label>
              <span class="text-xs">
                J’ai compris que le contenu du run — besoin, échanges, artefacts — sera envoyé à
                Anthropic pour être traité, et que le code écrit par le modèle sera exécuté dans cet
                onglet.
              </span>
            </template>
          </UCheckbox>
          <UButton
            block
            :disabled="key.trim().length === 0 || !consented"
            data-model-connect
            @click="connect"
          >
            Brancher le modèle
          </UButton>
        </template>
      </div>
    </template>
  </UPopover>
</template>
