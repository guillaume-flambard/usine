<script setup lang="ts">
// La coquille : deux volets, 100vh, la page ne défile jamais.
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { creerNoyau, type Noyau } from '../runtime/noyau'
import { creerStore } from '../etat/store'
import { disposer, type Disposition } from '../etat/disposition'
import { lancer, ordreDeclare, topologieDeclaree } from '../orchestration/lancer'
import { SCENARIOS, scenarioParDefaut } from '../scenarios'
import type { Scenario } from '../scenarios/types'
import type { NoeudVue } from '../etat/modele'
import GrapheVivant from './GrapheVivant.vue'
import PanneauNoeud from './PanneauNoeud.vue'

const store = creerStore()
const etat = store.etat

const scenario = ref<Scenario>(scenarioParDefaut())
const brief = ref(scenario.value.brief)
const enCours = ref(false)
const choisi = ref<string | undefined>()
const aideMode = ref(false)
const debut = ref(0)
const maintenant = ref(0)

let noyau: Noyau | undefined
let debrancher: (() => void) | undefined
let horloge: ReturnType<typeof setInterval> | undefined

/** Calculée une fois par scénario, sur la topologie complète déclarée. */
const disposition = shallowRef<Disposition>(disposerScenario(scenario.value))

function disposerScenario(cible: Scenario): Disposition {
  const ordre = ordreDeclare([cible.maitre, ...cible.casting, ...cible.emplacementsReserves]).map(
    (entree) => entree.composant.nom,
  )
  return disposer(topologieDeclaree(cible), { ordre })
}

const fabriques = computed(() =>
  scenario.value.emplacementsReserves.map((entree) => entree.composant.nom),
)

const secondes = computed(() =>
  debut.value === 0 ? 0 : Math.round((maintenant.value - debut.value) / 1000),
)

const phase = computed(() => {
  const noeuds = etat.value.noeuds
  if (noeuds.length === 0) return 'Au repos'
  if (noeuds.some((n) => n.etat === 'en-erreur')) return 'Incident'
  if (noeuds.every((n) => n.etat === 'termine')) return 'Terminé'
  if (noeuds.some((n) => n.nom.startsWith('constructeur-') && n.etat === 'en-cours'))
    return 'Construction'
  return 'Analyse'
})

const noeudChoisi = computed<NoeudVue | undefined>(
  () => etat.value.noeuds.find((noeud) => noeud.id === choisi.value) as NoeudVue | undefined,
)

const messagesDuChoisi = computed(() =>
  etat.value.journal.filter((message) => message.id === choisi.value),
)

async function relancer() {
  await arreter()
  store.reinitialiser()
  choisi.value = undefined

  noyau = creerNoyau()
  debrancher = store.brancher(noyau)
  enCours.value = true
  debut.value = Date.now()
  maintenant.value = debut.value
  horloge = setInterval(() => (maintenant.value = Date.now()), 500)

  await lancer(noyau, scenario.value)
}

async function arreter() {
  if (horloge !== undefined) clearInterval(horloge)
  horloge = undefined
  debrancher?.()
  debrancher = undefined
  await noyau?.libererTout()
  noyau = undefined
  enCours.value = false
}

function changerScenario(cle: string) {
  const trouve = SCENARIOS.find((s) => s.cle === cle)
  if (trouve === undefined) return
  void arreter()
  scenario.value = trouve
  brief.value = trouve.brief
  disposition.value = disposerScenario(trouve)
  store.reinitialiser()
  choisi.value = undefined
}

onBeforeUnmount(() => {
  void arreter()
})
</script>

<template>
  <div class="app" @keydown.esc="choisi = undefined">
    <section class="conduite">
      <header class="marque">
        <span class="marque-carre" aria-hidden="true"></span>
        <span class="marque-nom">Memo&nbsp;Labs</span>
        <span class="marque-lab">Lab · usine agentique</span>
      </header>

      <div class="mode">
        <span class="mode-pastille" aria-hidden="true"></span>
        <span>Mode déterministe</span>
        <button class="mode-aide" @click="aideMode = !aideMode">
          {{ aideMode ? 'masquer' : "qu'est-ce que ça veut dire ?" }}
        </button>
      </div>
      <p v-if="aideMode" class="mode-explication">
        Les agents se composent et travaillent réellement ; leur jugement est écrit à la main, pas
        produit par un modèle. Aucune clé, aucun token.
      </p>

      <div class="pane">
        <label class="eyebrow" for="brief">Le besoin</label>
        <textarea id="brief" v-model="brief" class="champ-brief"></textarea>

        <div class="rangee-actions">
          <button class="bouton" @click="relancer">
            ▶ {{ enCours ? "Relancer l'usine" : "Lancer l'usine" }}
          </button>
          <select
            class="selecteur"
            :value="scenario.cle"
            aria-label="Scénario"
            @change="changerScenario(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="s in SCENARIOS" :key="s.cle" :value="s.cle">{{ s.titre }}</option>
          </select>
        </div>

        <p class="narration" :class="{ 'narration-vide': !etat.narration }" aria-live="polite">
          {{ etat.narration?.message ?? "L'usine attend un brief." }}
        </p>

        <div class="fil">
          <p
            v-for="message in [...etat.journal].reverse()"
            :key="message.sequence"
            class="fil-message"
          >
            <span class="fil-auteur">{{ message.auteur }}</span>
            <span class="fil-sequence">#{{ message.sequence }}</span>
            <br />
            {{ message.message }}
          </p>
        </div>
      </div>
    </section>

    <section class="vivant">
      <div class="compteurs">
        <div class="compteur">
          <p class="compteur-cle">Agents</p>
          <p class="compteur-valeur">{{ etat.agentsVivants }}</p>
        </div>
        <div class="compteur">
          <p class="compteur-cle">Phase</p>
          <p class="compteur-valeur petit">{{ phase }}</p>
        </div>
        <div class="compteur">
          <p class="compteur-cle">Tokens</p>
          <p class="compteur-valeur">0</p>
        </div>
        <div class="compteur">
          <p class="compteur-cle">Temps</p>
          <p class="compteur-valeur">{{ secondes }}s</p>
        </div>
      </div>

      <!-- Le panneau se superpose au graphe, jamais aux compteurs : ils
           restent lisibles pendant qu'on inspecte un nœud. -->
      <div class="zone">
        <GrapheVivant
          :etat="etat"
          :disposition="disposition"
          :choisi="choisi"
          :fabriques="fabriques"
          @choisir="choisi = choisi === $event ? undefined : $event"
        />

        <PanneauNoeud
          v-if="noeudChoisi"
          :noeud="noeudChoisi"
          :messages="messagesDuChoisi"
          @fermer="choisi = undefined"
        />
      </div>
    </section>
  </div>
</template>
