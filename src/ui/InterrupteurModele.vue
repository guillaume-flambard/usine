<script setup lang="ts">
// L'interrupteur. La clé vit en mémoire de module, jamais dans le stockage
// du navigateur, et l'utilisateur est prévenu avant le premier appel de ce
// qui part chez le fournisseur.
import { ref } from 'vue'

defineProps<{ mode: 'deterministe' | 'llm' }>()
const emit = defineEmits<{
  brancher: [cle: string, evaluation: boolean]
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

function debrancher() {
  emit('debrancher')
  consenti.value = false
  evaluation.value = false
  ouvert.value = false
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
      {{ mode === 'llm' ? 'modèle branché — débrancher' : 'brancher un modèle' }}
    </button>

    <div v-if="ouvert" id="panneau-modele" class="modele-panneau">
      <template v-if="mode === 'llm'">
        <p class="modele-note">
          Un modèle est branché sur l’architecte. Le prochain run le fera raisonner réellement.
        </p>
        <button class="bouton bouton-fantome" @click="debrancher">Débrancher</button>
      </template>

      <template v-else>
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
