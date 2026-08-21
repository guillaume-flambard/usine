<script setup lang="ts">
// The payoff. No prefilled example: the visitor must type their own input,
// otherwise the proof is worth nothing — that is exactly what makes the last
// screen impossible to prerecord.
//
// This component does not know what the product does. It cannot know: the
// product was written during the run, by agents, under a name nobody chose in
// advance. It runs it and shows what comes out.
import { ref } from 'vue'

const props = defineProps<{
  /** The function the run published. Its shape is unknown. */
  run: (input: unknown) => unknown
  /** The name its authors published it under. */
  name: string
  /** Where to write to go further. */
  contact: string
}>()

const emit = defineEmits<{ submitted: [] }>()

/** The product runs on the main thread: we bound the input. */
const LIMIT = 20000

const input = ref('')
const output = ref<string | undefined>()
const error = ref<string | undefined>()

/** Renders whatever comes out readable, whatever its shape. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return '(le produit n’a rien rendu)'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function execute() {
  if (input.value.trim().length === 0) return
  try {
    error.value = undefined
    // The product was just written by a model: it may throw, loop on an input
    // it did not expect, or return anything. Saying so beats a blank page.
    output.value = asText(props.run(input.value.slice(0, LIMIT)))
    emit('submitted')
  } catch (cause) {
    output.value = undefined
    error.value = `Le produit a levé : ${cause instanceof Error ? cause.message : String(cause)}`
  }
}
</script>

<template>
  <section class="product" aria-live="polite">
    <p class="eyebrow">Produit livré — « {{ name }} »</p>
    <p class="product-help">
      Écrit pendant ce run, chargé à chaud, et jamais vu avant. Donnez-lui une entrée : ce que vous
      lirez sort de son code, pas d’un exemple.
    </p>

    <label class="hidden-title" for="product-input">Entrée à soumettre au produit</label>
    <textarea
      id="product-input"
      v-model="input"
      class="brief-field"
      rows="3"
      @keydown.ctrl.enter="execute"
      @keydown.meta.enter="execute"
    ></textarea>

    <div class="action-row">
      <button class="button" :disabled="input.trim().length === 0" @click="execute">
        Exécuter le produit
      </button>
      <a class="product-contact" :href="`mailto:${contact}`">Écrire à Memo Labs</a>
    </div>

    <p v-if="error" class="incident" role="alert">{{ error }}</p>
    <pre v-else-if="output !== undefined" class="product-output">{{ output }}</pre>
  </section>
</template>
