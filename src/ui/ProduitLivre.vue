<script setup lang="ts">
// Le payoff. Aucun exemple pré-rempli : le visiteur doit taper sa propre
// entrée, sinon la preuve ne vaut rien — c'est exactement ce qui rend le
// dernier écran impossible à préenregistrer.
//
// Ce composant ne sait pas ce que le produit fait. Il ne peut pas le savoir :
// le produit a été écrit pendant le run, par des agents, sous un nom que
// personne n'avait choisi d'avance. Il l'exécute et montre ce qui sort.
import { ref } from 'vue'

const props = defineProps<{
  /** La fonction publiée par le run. Sa forme est inconnue. */
  executer: (entree: unknown) => unknown
  /** Le nom sous lequel ses auteurs l'ont publiée. */
  nom: string
  /** Où écrire pour aller plus loin. */
  contact: string
}>()

const emit = defineEmits<{ soumis: [] }>()

/** Le produit tourne sur le fil principal : on borne l'entrée. */
const LIMITE = 20000

const entree = ref('')
const sortie = ref<string | undefined>()
const erreur = ref<string | undefined>()

/** Rend lisible ce qui sort, quelle que soit sa forme. */
function enTexte(valeur: unknown): string {
  if (typeof valeur === 'string') return valeur
  if (valeur === undefined) return '(le produit n’a rien rendu)'
  try {
    return JSON.stringify(valeur, null, 2)
  } catch {
    return String(valeur)
  }
}

function lancer() {
  if (entree.value.trim().length === 0) return
  try {
    erreur.value = undefined
    // Le produit vient d'être écrit par un modèle : il peut lever, boucler
    // sur une entrée qu'il n'attendait pas, ou rendre n'importe quoi. Le dire
    // vaut mieux que laisser la page blanche.
    sortie.value = enTexte(props.executer(entree.value.slice(0, LIMITE)))
    emit('soumis')
  } catch (cause) {
    sortie.value = undefined
    erreur.value = `Le produit a levé : ${cause instanceof Error ? cause.message : String(cause)}`
  }
}
</script>

<template>
  <section class="produit" aria-live="polite">
    <p class="eyebrow">Produit livré — « {{ nom }} »</p>
    <p class="produit-aide">
      Écrit pendant ce run, chargé à chaud, et jamais vu avant. Donnez-lui une entrée : ce que vous
      lirez sort de son code, pas d’un exemple.
    </p>

    <label class="titre-cache" for="copie">Entrée à soumettre au produit</label>
    <textarea
      id="copie"
      v-model="entree"
      class="champ-brief"
      rows="3"
      @keydown.ctrl.enter="lancer"
      @keydown.meta.enter="lancer"
    ></textarea>

    <div class="rangee-actions">
      <button class="bouton" :disabled="entree.trim().length === 0" @click="lancer">
        Exécuter le produit
      </button>
      <a class="produit-contact" :href="`mailto:${contact}`">Écrire à Memo Labs</a>
    </div>

    <p v-if="erreur" class="incident" role="alert">{{ erreur }}</p>
    <pre v-else-if="sortie !== undefined" class="produit-sortie">{{ sortie }}</pre>
  </section>
</template>
