<script setup lang="ts">
// Deux boutons de poids visuel égal. Le produit ne pousse pas à approuver :
// si la décision est orientée, elle ne vaut rien et la porte devient
// décorative — exactement ce qu'on refuse.
import { nextTick, ref, watch } from 'vue'
import type { PorteVue } from '../etat/modele'

const props = defineProps<{ porte: PorteVue }>()
defineEmits<{ approuver: []; ecarter: [] }>()

const premierBouton = ref<HTMLButtonElement | undefined>()

// Le focus vient à la porte : sinon il faudrait tabuler à travers douze
// nœuds du graphe pour atteindre la décision, et une pression sur Entrée
// par habitude relancerait le run au lieu de trancher.
watch(
  () => props.porte.id,
  async () => {
    await nextTick()
    premierBouton.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="porte"
    :aria-label="porte.decision === undefined ? 'Décision requise' : 'Décision prise'"
  >
    <div class="porte-corps">
      <p class="eyebrow">
        {{ porte.decision === undefined ? 'Décision requise' : 'Décision prise' }}
      </p>
      <p id="porte-resume" class="porte-resume">{{ porte.objet.resume }}</p>
      <p id="porte-objection" class="porte-objection">
        <b>Sceptique —</b> {{ porte.objet.objection }}
      </p>
    </div>
    <div v-if="porte.decision === undefined" class="porte-actions">
      <button
        ref="premierBouton"
        class="bouton bouton-fantome"
        aria-describedby="porte-resume porte-objection"
        @click="$emit('ecarter')"
      >
        Écarter
      </button>
      <button
        class="bouton bouton-fantome"
        aria-describedby="porte-resume porte-objection"
        @click="$emit('approuver')"
      >
        Approuver
      </button>
    </div>
    <p v-else class="porte-verdict">
      {{ porte.decision === 'approuve' ? 'Approuvée' : 'Écartée' }}
    </p>
  </section>
</template>
