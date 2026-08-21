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

const parId = computed(() => new Map(props.etat.noeuds.map((noeud) => [noeud.id, noeud.nom])))

const nomsPresents = computed(() => new Set(props.etat.noeuds.map((noeud) => noeud.nom)))

/**
 * Le cadre du dessin. Un plancher de taille évite qu'un graphe d'un seul
 * nœud soit affiché en gros plan au premier instant du run.
 */
const cadre = computed(() => ({
  largeur: Math.max(props.disposition.largeur, 900),
  hauteur: Math.max(props.disposition.hauteur + (orphelins.value.length ? 96 : 0), 420),
}))

const derniereTransition = computed(() =>
  props.etat.aretes.reduce((max, arete) => Math.max(max, arete.dernierTransit ?? 0), 0),
)

const liens = computed(() => {
  const noms = parId.value
  const presents = nomsPresents.value
  return (
    props.disposition.liens
      // Un lien n'est tracé que lorsque ses DEUX extrémités existent
      // vraiment. Sinon le graphe afficherait un squelette d'arêtes avant
      // le moindre nœud, et deux arêtes permanentes vers un composant
      // seulement réservé — exactement le décor que le produit refuse.
      .filter((lien) => presents.has(lien.de) && presents.has(lien.vers))
      .map((lien) => {
        const vue = props.etat.aretes.find(
          (arete) =>
            arete.nom === lien.nom &&
            noms.get(arete.de) === lien.de &&
            noms.get(arete.vers) === lien.vers,
        )
        return {
          cle: `${lien.de}-${lien.nom}-${lien.vers}`,
          chemin: cheminDeLien(lien.points),
          aTransite: vue?.aTransite === true,
          filiation: vue?.genre === 'filiation',
          recent:
            vue?.dernierTransit !== undefined &&
            vue.dernierTransit === derniereTransition.value &&
            props.etat.derniereSequence - vue.dernierTransit < 6,
        }
      })
  )
})

/** Les composants vivants qu'aucune place déclarée n'accueille. */
const orphelins = computed(() =>
  props.etat.noeuds.filter((noeud) => !props.disposition.boites.has(noeud.nom)),
)

const idDescription = 'description-du-graphe'

const description = computed(() => {
  if (props.etat.noeuds.length === 0) return 'Le graphe est vide. Aucun composant chargé.'
  const parEtat = props.etat.noeuds.map((n) => `${n.nom} : ${n.etat}`)
  return `${props.etat.noeuds.length} composants. ${parEtat.join('. ')}.`
})
</script>

<template>
  <div class="canvas">
    <!-- Le graphe n'a plus de taille connue d'avance : il pousse pendant le
         run. Un `viewBox` le garde entier dans le cadre au lieu de le laisser
         sortir par la droite dès la troisième vague. -->
    <svg
      :viewBox="`0 0 ${cadre.largeur} ${cadre.hauteur}`"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Graphe du run"
      :aria-describedby="idDescription"
    >
      <!-- `role="img"` rendrait tout le sous-arbre présentationnel et les
           nœuds focalisables cesseraient d'exister pour un lecteur d'écran. -->
      <desc :id="idDescription">{{ description }}</desc>
      <g>
        <path
          v-for="lien in liens"
          :key="lien.cle"
          class="lien"
          :d="lien.chemin"
          :data-transite="lien.aTransite"
          :data-recent="lien.recent"
          :data-filiation="lien.filiation"
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
      <!-- Un composant vivant sans place déclarée est rendu quand même, en
           couloir de débord : l'invisibiliser casserait l'invariant qui veut
           que le graphe soit la topologie réelle. -->
      <g v-for="(orphelin, index) in orphelins" :key="orphelin.id" class="orphelin">
        <rect
          class="noeud-cadre"
          :x="24 + index * 160"
          :y="disposition.hauteur + 16"
          :width="140"
          :height="56"
        />
        <text class="noeud-label" :x="38 + index * 160" :y="disposition.hauteur + 40">
          {{ orphelin.presentation.libelle ?? orphelin.nom }}
        </text>
      </g>
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
