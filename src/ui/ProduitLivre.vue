<script setup lang="ts">
// Le payoff. Aucun exemple pré-rempli : le visiteur doit taper son propre
// texte, sinon la preuve ne vaut rien — c'est exactement ce qui rend le
// dernier écran impossible à préenregistrer.
import { ref } from 'vue'
import type { Verdict } from '../runtime/fabrique/primitives'

const props = defineProps<{
  verifier: (texte: string) => readonly Verdict[]
}>()

const texte = ref('')
const verdicts = ref<readonly Verdict[] | undefined>()

const LIBELLES: Record<Verdict['statut'], string> = {
  autorise: 'Autorisé',
  interdit: 'Interdit',
  'a-verifier': 'À vérifier',
}

const RAISONS: Record<NonNullable<Verdict['raison']>, string> = {
  'aucune-regle': 'Aucune règle du registre ne couvre cette formulation.',
  'formulation-negative':
    'Une règle correspond, mais l’allégation est à la forme négative : le verdict n’est pas transposable.',
  'source-absente': 'La règle correspondante n’est adossée à aucune source citable.',
}

function verifierTexte() {
  verdicts.value = props.verifier(texte.value)
}

function effacer() {
  texte.value = ''
  verdicts.value = undefined
}
</script>

<template>
  <section class="produit" aria-label="Produit livré">
    <p class="eyebrow">Produit livré · vérificateur d'allégations</p>
    <label class="produit-aide" for="copie">
      Collez une copie marketing. Chaque allégation sera classée, avec la source qui la justifie.
    </label>
    <textarea
      id="copie"
      v-model="texte"
      class="champ-brief produit-champ"
      rows="4"
      @keydown.ctrl.enter="verifierTexte"
      @keydown.meta.enter="verifierTexte"
    ></textarea>

    <div class="rangee-actions">
      <button class="bouton" :disabled="texte.trim().length === 0" @click="verifierTexte">
        Vérifier les allégations
      </button>
      <button v-if="verdicts" class="bouton bouton-fantome" @click="effacer">Effacer</button>
    </div>

    <template v-if="verdicts">
      <p v-if="verdicts.length === 0" class="produit-vide">
        Aucune allégation détectée dans ce texte.
      </p>
      <ul v-else class="verdicts">
        <li v-for="(verdict, index) in verdicts" :key="index" :data-statut="verdict.statut">
          <p class="verdict-statut">
            <!-- Le statut est écrit, pas seulement coloré. -->
            <span class="verdict-marque" aria-hidden="true"></span>
            {{ LIBELLES[verdict.statut] }}
          </p>
          <p class="verdict-texte">« {{ verdict.texte }} »</p>
          <p v-if="verdict.source" class="verdict-source">{{ verdict.source }}</p>
          <p v-else class="verdict-source">{{ RAISONS[verdict.raison ?? 'aucune-regle'] }}</p>
        </li>
      </ul>

      <!-- Le point de contact vient après le premier résultat, jamais avant. -->
      <p class="produit-suite">
        Vous voulez voir ça sur votre catalogue&nbsp;?
        <a href="mailto:g.flambard@gmail.com?subject=L%27usine%20agentique">Écrivez-nous.</a>
      </p>
    </template>
  </section>
</template>
