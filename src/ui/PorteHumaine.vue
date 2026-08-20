<script setup lang="ts">
// Deux boutons de poids visuel égal. Le produit ne pousse pas à approuver :
// si la décision est orientée, elle ne vaut rien et la porte devient
// décorative — exactement ce qu'on refuse.
import type { PorteVue } from '../etat/modele'

defineProps<{ porte: PorteVue }>()
defineEmits<{ approuver: []; ecarter: [] }>()
</script>

<template>
  <section class="porte" aria-label="Décision requise">
    <div class="porte-corps">
      <p class="eyebrow">
        {{ porte.decision === undefined ? 'Décision requise' : 'Décision prise' }}
      </p>
      <p class="porte-resume">{{ porte.objet.resume }}</p>
      <p class="porte-objection"><b>Sceptique —</b> {{ porte.objet.objection }}</p>
    </div>
    <div v-if="porte.decision === undefined" class="porte-actions">
      <button class="bouton bouton-fantome" @click="$emit('ecarter')">Écarter</button>
      <button class="bouton bouton-fantome" @click="$emit('approuver')">Approuver</button>
    </div>
    <p v-else class="porte-verdict">
      {{ porte.decision === 'approuve' ? 'Approuvée' : 'Écartée' }}
    </p>
  </section>
</template>
