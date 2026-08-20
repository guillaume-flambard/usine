<script setup lang="ts">
import type { NoeudVue } from '../etat/modele'

defineProps<{ noeud: NoeudVue; messages: readonly { sequence: number; message: string }[] }>()
defineEmits<{ fermer: [] }>()

const LIBELLES: Record<NoeudVue['etat'], string> = {
  inactif: 'Inactif',
  'en-attente-de-dependance': 'En attente de dépendance',
  'en-cours': 'En cours',
  termine: 'Terminé',
  'en-erreur': 'En erreur',
  libere: 'Libéré',
}
</script>

<template>
  <aside class="panneau" aria-label="Détail du composant">
    <button class="panneau-fermer" @click="$emit('fermer')">Fermer</button>
    <h2>{{ noeud.nom }}</h2>
    <dl>
      <dt>Rôle</dt>
      <dd>{{ noeud.presentation.role }}</dd>
      <dt>État</dt>
      <dd>{{ LIBELLES[noeud.etat] }}</dd>
      <template v-if="noeud.presentation.technologie">
        <dt>Technologie</dt>
        <dd>{{ noeud.presentation.technologie }}</dd>
      </template>
      <template v-if="noeud.injecte.length">
        <dt>Consomme</dt>
        <dd>{{ noeud.injecte.join(', ') }}</dd>
      </template>
      <template v-if="noeud.fournit.length">
        <dt>Publie</dt>
        <dd>{{ noeud.fournit.join(', ') }}</dd>
      </template>
      <template v-if="noeud.cause">
        <dt>Cause</dt>
        <dd>
          {{
            noeud.cause.genre === 'dependance-partie'
              ? `Dépendance partie : ${noeud.cause.noms.join(', ')}`
              : 'Libération du run'
          }}
        </dd>
      </template>
      <template v-if="noeud.erreur">
        <dt>Erreur</dt>
        <dd>{{ noeud.erreur.code }} — {{ noeud.erreur.message }}</dd>
      </template>
    </dl>
    <template v-if="messages.length">
      <p class="eyebrow">Ce qu'il a dit</p>
      <div class="fil">
        <p v-for="message in messages" :key="message.sequence" class="fil-message">
          {{ message.message }}
        </p>
      </div>
    </template>
  </aside>
</template>
