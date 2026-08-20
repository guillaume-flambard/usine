<script setup lang="ts">
// Le payoff. Aucun exemple pré-rempli : le visiteur doit taper son propre
// texte, sinon la preuve ne vaut rien — c'est exactement ce qui rend le
// dernier écran impossible à préenregistrer.
import { ref } from 'vue'
import type { Verdict } from '../runtime/fabrique/primitives'

const props = defineProps<{
  verifier: (texte: string) => readonly Verdict[]
  /** Où écrire pour aller plus loin. Le scénario le déclare, pas ce composant. */
  contact: string
  /** Comment le produit se présente. Il change avec la niche. */
  titre: string
  aide: string
}>()

const emit = defineEmits<{ soumis: [] }>()

/** Le verdict est calculé sur le fil principal : on borne l'entrée. */
const LIMITE = 20000

const texte = ref('')
const verdicts = ref<readonly Verdict[] | undefined>()

const LIBELLES: Record<Verdict['statut'], string> = {
  autorise: 'Autorisé',
  interdit: 'Interdit',
  'a-verifier': 'À vérifier',
}

const RAISONS: Record<NonNullable<Verdict['raison']>, string> = {
  'aucune-regle': 'Aucune règle du registre ne couvre cette formulation.',
  'regle-ambigue': 'Une règle correspond, mais elle demande un examen au cas par cas.',
  'formulation-negative':
    'Une règle correspond, mais l’allégation est à la forme négative : le verdict n’est pas transposable.',
  'source-absente': 'La règle correspondante n’est adossée à aucune source citable.',
}

const erreur = ref<string | undefined>()

function verifierTexte() {
  // Le raccourci ne doit pas contourner la règle du bouton désactivé.
  if (texte.value.trim().length === 0) return
  try {
    erreur.value = undefined
    verdicts.value = props.verifier(texte.value)
    emit('soumis')
  } catch (cause) {
    erreur.value = cause instanceof Error ? cause.message : String(cause)
    verdicts.value = undefined
  }
}

function effacer() {
  texte.value = ''
  verdicts.value = undefined
  erreur.value = undefined
}
</script>

<template>
  <section class="produit" aria-label="Produit livré">
    <p class="eyebrow">Produit livré · {{ titre }}</p>
    <label class="produit-aide" for="copie">{{ aide }}</label>
    <textarea
      id="copie"
      v-model="texte"
      class="champ-brief produit-champ"
      rows="4"
      :maxlength="LIMITE"
      @keydown.ctrl.enter="verifierTexte"
      @keydown.meta.enter="verifierTexte"
    ></textarea>

    <div class="rangee-actions">
      <button class="bouton" :disabled="texte.trim().length === 0" @click="verifierTexte">
        Vérifier les allégations
      </button>
      <button v-if="verdicts" class="bouton bouton-fantome" @click="effacer">Effacer</button>
    </div>

    <p v-if="erreur" class="incident" role="alert">{{ erreur }}</p>

    <template v-if="verdicts">
      <p v-if="verdicts.length === 0" class="produit-vide" role="status" aria-live="polite">
        Aucune allégation détectée dans ce texte.
      </p>
      <ul v-else class="verdicts" role="status" aria-live="polite">
        <li v-for="(verdict, index) in verdicts" :key="index" :data-statut="verdict.statut">
          <p class="verdict-statut">
            <!-- Le statut est écrit, pas seulement coloré. -->
            <span class="verdict-marque" aria-hidden="true"></span>
            {{ LIBELLES[verdict.statut] }}
          </p>
          <p class="verdict-texte">« {{ verdict.texte }} »</p>
          <!-- La raison et la source ne s'excluent pas : une règle peut
               correspondre tout en demandant un examen. -->
          <p v-if="verdict.raison" class="verdict-source">{{ RAISONS[verdict.raison] }}</p>
          <p v-if="verdict.source" class="verdict-source">{{ verdict.source }}</p>
        </li>
      </ul>

      <!-- Le point de contact vient après le premier résultat, jamais avant. -->
      <p class="produit-suite">
        Vous voulez voir ça sur votre catalogue&nbsp;?
        <a :href="`mailto:${contact}?subject=L%27usine%20agentique`">Écrivez-nous.</a>
      </p>
    </template>
  </section>
</template>
