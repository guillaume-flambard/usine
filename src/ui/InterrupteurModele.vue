<script setup lang="ts">
// L'interrupteur. Deux sources possibles pour le modèle : celui du site, qui
// passe par un relais gardant la clé côté serveur, ou la clé du visiteur, qui
// vit en mémoire de module et jamais dans le stockage du navigateur. Dans les
// deux cas, l'utilisateur est prévenu avant le premier appel de ce qui part
// chez le fournisseur.
import { ref } from 'vue'

export type SourceModele = 'aucune' | 'relais' | 'cle'

defineProps<{
  mode: 'deterministe' | 'llm'
  source: SourceModele
  /** Le relais du site répond et porte une clé : sans ça, rien à proposer. */
  relaisPret: boolean
}>()
const emit = defineEmits<{
  brancher: [cle: string, evaluation: boolean]
  brancherRelais: []
  debrancher: []
}>()

const ouvert = ref(false)
const cle = ref('')
const consenti = ref(false)
const evaluation = ref(false)

function brancher() {
  if (cle.value.trim().length === 0 || !consenti.value) return
  emit('brancher', cle.value.trim(), evaluation.value)
  // La clé quitte le champ dès qu'elle est transmise : elle ne reste pas
  // affichée à l'écran.
  cle.value = ''
  ouvert.value = false
}

function basculer() {
  // La clé ne doit pas survivre à la fermeture du panneau : elle réapparaîtrait
  // à la réouverture, ce que l'écran promet le contraire.
  if (ouvert.value) cle.value = ''
  ouvert.value = !ouvert.value
}

function brancherRelais() {
  emit('brancherRelais')
  ouvert.value = false
}

function debrancher() {
  emit('debrancher')
  consenti.value = false
  evaluation.value = false
  ouvert.value = false
}

const libelle = (mode: 'deterministe' | 'llm', source: SourceModele): string => {
  if (source === 'relais') return 'modèle du site — changer'
  if (mode === 'llm') return 'modèle branché — débrancher'
  return 'brancher un modèle'
}
</script>

<template>
  <div class="modele">
    <button
      class="mode-aide"
      :aria-expanded="ouvert"
      aria-controls="panneau-modele"
      @click="basculer"
    >
      {{ libelle(mode, source) }}
    </button>

    <div v-if="ouvert" id="panneau-modele" class="modele-panneau">
      <template v-if="source === 'relais'">
        <p class="modele-note">
          Le modèle du site raisonne pour le planificateur, l’architecte et le sceptique. La clé
          reste sur le serveur, le quota est partagé : au-delà, les agents retombent sur leur repli
          écrit à la main.
        </p>
        <button class="bouton bouton-fantome" @click="debrancher">
          Repasser en mode déterministe
        </button>
      </template>

      <template v-else-if="source === 'cle'">
        <p class="modele-note">
          Un modèle est branché sur les agents qui raisonnent. Le prochain run le fera raisonner
          réellement.
        </p>
        <button class="bouton bouton-fantome" @click="debrancher">Débrancher</button>
      </template>

      <template v-else>
        <template v-if="relaisPret">
          <p class="modele-note">
            Le site porte son propre modèle : aucune clé à fournir, quota partagé entre visiteurs.
          </p>
          <button class="bouton" @click="brancherRelais">Utiliser le modèle du site</button>
          <p class="eyebrow">ou votre propre clé</p>
        </template>

        <label class="eyebrow" for="cle">Clé d’API Anthropic</label>
        <input
          id="cle"
          v-model="cle"
          class="champ-brief modele-champ"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk-ant-…"
        />
        <p class="modele-note">
          La clé reste en mémoire de cet onglet. Elle n’est ni enregistrée, ni journalisée, et ne
          part que chez Anthropic.
        </p>
        <label class="modele-consentement">
          <input v-model="consenti" type="checkbox" />
          <span>
            J’ai compris que le contenu du run — brief, spécifications, artefacts — sera envoyé à
            Anthropic pour être traité.
          </span>
        </label>
        <label class="modele-consentement">
          <input v-model="evaluation" type="checkbox" />
          <span>
            Autoriser en plus la fabrication par évaluation de code. Elle exige une politique de
            sécurité permissive : c’est un arbitrage à part, pas une conséquence du branchement.
          </span>
        </label>
        <button class="bouton" :disabled="cle.trim().length === 0 || !consenti" @click="brancher">
          Brancher le modèle
        </button>
      </template>
    </div>
  </div>
</template>
