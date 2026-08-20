<script setup lang="ts">
// Le rendu d'un nœud, en un seul endroit. Chaque état porte un signal qui
// n'est pas la couleur : trait fin, pointillé, trait épaissi, coche, croix,
// label barré. Passé en niveaux de gris, tout reste lisible.
import type { Boite } from '../etat/disposition'
import type { NoeudVue } from '../etat/modele'

defineProps<{
  noeud: NoeudVue
  boite: Boite
  choisi: boolean
  fabrique: boolean
}>()

defineEmits<{
  choisir: [id: NoeudVue['id']]
  survoler: [charge: { noeud: NoeudVue; boite: Boite } | undefined]
}>()
</script>

<template>
  <!-- Deux groupes : la position vit sur l'attribut `transform` du groupe
       externe, l'animation sur le groupe interne. Une propriété CSS
       `transform` écraserait l'attribut et empilerait tous les nœuds à
       l'origine — c'est exactement ce qui est arrivé au premier rendu. -->
  <g
    class="noeud"
    :data-etat="noeud.etat"
    :data-choisi="choisi"
    :data-fabrique="fabrique"
    :transform="`translate(${boite.x} ${boite.y})`"
    tabindex="0"
    role="button"
    :aria-pressed="choisi"
    :aria-label="`${noeud.nom} — ${noeud.presentation.role} — ${noeud.etat}`"
    @click="$emit('choisir', noeud.id)"
    @keydown.enter.prevent="$emit('choisir', noeud.id)"
    @keydown.space.prevent="$emit('choisir', noeud.id)"
    @mouseenter="$emit('survoler', { noeud, boite })"
    @mouseleave="$emit('survoler', undefined)"
    @focus="$emit('survoler', { noeud, boite })"
    @blur="$emit('survoler', undefined)"
  >
    <g class="apparition">
      <rect class="noeud-cadre" :width="boite.largeur" :height="boite.hauteur" />
      <rect
        v-if="fabrique"
        class="noeud-double"
        x="4"
        y="4"
        :width="boite.largeur - 8"
        :height="boite.hauteur - 8"
      />
      <text class="noeud-label" x="14" y="24">
        {{ noeud.presentation.libelle ?? noeud.nom }}
      </text>
      <!-- Seconde ligne réservée à une technologie réellement exécutée.
           Un nœud qui n'en exécute aucune n'affiche rien. -->
      <text v-if="noeud.presentation.technologie" class="noeud-techno" x="14" y="42">
        {{ noeud.presentation.technologie }}
      </text>

      <!-- Signal de forme, redondant avec la couleur. -->
      <path
        v-if="noeud.etat === 'termine'"
        class="noeud-marque"
        :d="`M ${boite.largeur - 26} 22 l 4 4 l 7 -8`"
      />
      <path
        v-else-if="noeud.etat === 'en-erreur'"
        class="noeud-marque"
        :d="`M ${boite.largeur - 26} 18 l 10 10 M ${boite.largeur - 16} 18 l -10 10`"
      />
      <g v-else-if="noeud.etat === 'en-cours'" class="noeud-marque">
        <line :x1="boite.largeur - 26" y1="20" :x2="boite.largeur - 26" y2="28" />
        <line :x1="boite.largeur - 20" y1="17" :x2="boite.largeur - 20" y2="31" />
        <line :x1="boite.largeur - 14" y1="22" :x2="boite.largeur - 14" y2="26" />
      </g>
    </g>
  </g>
</template>
