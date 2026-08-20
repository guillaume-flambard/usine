<script setup lang="ts">
// Le graphe est une PROJECTION : aucun nœud, aucune arête n'est créé ici.
// Tout vient du réducteur, et la disposition est calculée une fois pour
// toutes sur la topologie déclarée — les nœuds sont révélés, pas déplacés.
import { computed, ref } from 'vue'
import type { Boite, Disposition } from '../etat/disposition'
import { cheminDeLien } from '../etat/disposition'
import type { EtatRun, NoeudVue } from '../etat/modele'
import NoeudGraphe from './NoeudGraphe.vue'

const props = defineProps<{
  etat: EtatRun
  disposition: Disposition
  choisi?: string
  fabriques: readonly string[]
}>()

const emit = defineEmits<{ choisir: [id: NoeudVue['id']] }>()

const survole = ref<{ noeud: NoeudVue; boite: Boite } | undefined>()

const noeudsPlaces = computed(() =>
  props.etat.noeuds
    .map((noeud) => ({ noeud, boite: props.disposition.boites.get(noeud.nom) }))
    .filter((paire): paire is { noeud: NoeudVue; boite: Boite } => paire.boite !== undefined),
)

const derniereTransition = computed(() =>
  props.etat.aretes.reduce((max, arete) => Math.max(max, arete.dernierTransit ?? 0), 0),
)

const liens = computed(() =>
  props.disposition.liens.map((lien) => {
    const boiteDe = props.disposition.boites.get(lien.de)
    const boiteVers = props.disposition.boites.get(lien.vers)
    const vue = props.etat.aretes.find(
      (arete) =>
        arete.nom === lien.nom &&
        props.etat.noeuds.find((n) => n.id === arete.de)?.nom === lien.de &&
        props.etat.noeuds.find((n) => n.id === arete.vers)?.nom === lien.vers,
    )
    return {
      cle: `${lien.de}-${lien.nom}-${lien.vers}`,
      chemin: cheminDeLien(lien.points),
      visible: boiteDe !== undefined && boiteVers !== undefined,
      aTransite: vue?.aTransite === true,
      recent:
        vue?.dernierTransit !== undefined &&
        vue.dernierTransit === derniereTransition.value &&
        derniereTransition.value > 0,
    }
  }),
)

const description = computed(() => {
  if (props.etat.noeuds.length === 0) return 'Le graphe est vide. Aucun composant chargé.'
  const parEtat = props.etat.noeuds.map((n) => `${n.nom} : ${n.etat}`)
  return `${props.etat.noeuds.length} composants. ${parEtat.join('. ')}.`
})
</script>

<template>
  <div class="canvas">
    <svg
      :width="Math.max(disposition.largeur, 320)"
      :height="Math.max(disposition.hauteur, 240)"
      role="img"
      aria-label="Graphe du run"
    >
      <desc>{{ description }}</desc>
      <g>
        <path
          v-for="lien in liens.filter((l) => l.visible)"
          :key="lien.cle"
          class="lien"
          :d="lien.chemin"
          :data-transite="lien.aTransite"
          :data-recent="lien.recent"
        />
      </g>
      <NoeudGraphe
        v-for="paire in noeudsPlaces"
        :key="paire.noeud.id"
        :noeud="paire.noeud"
        :boite="paire.boite"
        :choisi="choisi === paire.noeud.id"
        :fabrique="fabriques.includes(paire.noeud.nom)"
        @choisir="emit('choisir', $event)"
        @survoler="survole = $event"
      />
    </svg>

    <div
      v-if="survole"
      class="survol"
      :style="{
        left: `${survole.boite.x}px`,
        top: `${survole.boite.y + survole.boite.hauteur + 8}px`,
      }"
    >
      <p class="survol-role">{{ survole.noeud.presentation.role }}</p>
      <p v-if="survole.noeud.injecte.length" class="survol-detail">
        Dépend de : {{ survole.noeud.injecte.join(', ') }}
      </p>
      <p v-if="survole.noeud.presentation.technologie" class="survol-detail">
        {{ survole.noeud.presentation.technologie }}
      </p>
    </div>
  </div>
</template>
