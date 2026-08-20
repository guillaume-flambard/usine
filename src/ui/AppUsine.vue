<script setup lang="ts">
// La coquille : deux volets, 100vh, la page ne défile jamais.
// Tout ce qui fait vivre le run est dans le pilote, hors de ce composant :
// c'est ce qui rend le câblage testable sans navigateur.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { creerPilote } from '../orchestration/pilote'
import { SCENARIOS, scenarioParDefaut, trouverScenario } from '../scenarios'
import type { NoeudVue } from '../etat/modele'
import GrapheVivant from './GrapheVivant.vue'
import PanneauNoeud from './PanneauNoeud.vue'
import PorteHumaine from './PorteHumaine.vue'
import ProduitLivre from './ProduitLivre.vue'
import InterrupteurModele from './InterrupteurModele.vue'
import { payoffAffiche, porteAtteinte, runLance, verificationSoumise } from '../telemetrie'

const pilote = creerPilote(scenarioParDefaut())
const etat = pilote.store.etat

const cleScenario = ref(pilote.scenario().cle)
const brief = ref(pilote.scenario().brief)
const disposition = shallowRef(pilote.disposition())
const enCours = ref(false)
const demarrage = ref(false)
const erreur = ref<string | undefined>()
const choisi = ref<string | undefined>()
const aideMode = ref(false)
const mode = ref<'deterministe' | 'llm'>(pilote.modeRaisonnement())

async function brancherModele(cle: string, evaluation: boolean) {
  try {
    // Import dynamique : sans branchement, le SDK n'est jamais chargé et le
    // bundle du mode par défaut n'en porte pas une ligne.
    const { raisonneurClaude } = await import('../runtime/raisonneur/claude')
    pilote.brancher(raisonneurClaude({ cle }), { evaluation })
    erreur.value = undefined
  } catch (cause) {
    // Un fragment qui ne se charge pas doit se dire, pas laisser l'écran
    // annoncer un mode qui n'est pas le sien.
    erreur.value = `Le modèle n'a pas pu être branché : ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
  mode.value = pilote.modeRaisonnement()
}

function debrancherModele() {
  pilote.brancher(undefined)
  mode.value = pilote.modeRaisonnement()
}
const debut = ref(0)
const maintenant = ref(0)
let horloge: ReturnType<typeof setInterval> | undefined

// Le badge « fabriqué » vient de ce qui s'est réellement passé, jamais de la
// déclaration : une place réservée sans fabrication ne doit pas le porter.
const fabriques = computed(() =>
  etat.value.noeuds.filter((noeud) => noeud.fabrication !== undefined).map((noeud) => noeud.nom),
)

const millisecondes = computed(() => (debut.value === 0 ? 0 : maintenant.value - debut.value))

/** Sous la seconde, on montre les millisecondes : c'est plus honnête. */
const duree = computed(() =>
  millisecondes.value < 1000
    ? `${millisecondes.value}ms`
    : `${Math.round(millisecondes.value / 1000)}s`,
)

const phase = computed(() => {
  void etat.value.derniereSequence
  return pilote.phase()
})

/** Le produit livré, dès que la porte est franchie. */
const verificateur = computed(() => {
  void etat.value.derniereSequence
  return pilote.verificateur()
})

const noeudChoisi = computed<NoeudVue | undefined>(
  () => etat.value.noeuds.find((noeud) => noeud.id === choisi.value) as NoeudVue | undefined,
)

const messagesDuChoisi = computed(() =>
  etat.value.journal.filter((message) => message.id === choisi.value),
)

function arreterHorloge() {
  if (horloge !== undefined) clearInterval(horloge)
  horloge = undefined
  // Fige la durée réelle : un run plus court que le pas d'horloge afficherait
  // sinon zéro seconde alors qu'il a duré quelque chose.
  if (debut.value !== 0) maintenant.value = Date.now()
}

// Le temps se fige à la fin du run : un compteur qui monte sur une usine à
// l'arrêt est un faux signal.
// Les quatre faits mesurés se déduisent de l'état, jamais d'un contenu.
watch(
  () => etat.value.porte !== undefined,
  (atteinte) => {
    if (atteinte) porteAtteinte()
  },
)

watch(
  () => verificateur.value !== undefined,
  (livre) => {
    if (livre) payoffAffiche()
  },
)

watch(
  () => phase.value,
  (valeur) => {
    // La délibération humaine n'est pas du temps d'usine : l'horloge
    // s'arrête aussi à la porte.
    if (pilote.fini() || valeur === 'Décision') arreterHorloge()
  },
)

async function relancer() {
  if (demarrage.value) return
  demarrage.value = true
  choisi.value = undefined
  enCours.value = true
  debut.value = Date.now()
  maintenant.value = debut.value
  arreterHorloge()
  horloge = setInterval(() => (maintenant.value = Date.now()), 500)
  runLance()
  await pilote.demarrer(brief.value)
  erreur.value = pilote.erreur()
  if (erreur.value !== undefined) arreterHorloge()
  demarrage.value = false
}

function approuver() {
  if (!pilote.approuver()) return
  // La décision relance le run : le temps repart d'où il s'était arrêté.
  debut.value = Date.now() - millisecondes.value
  horloge = setInterval(() => (maintenant.value = Date.now()), 500)
}

async function ecarter() {
  await pilote.ecarter()
}

async function changerScenario(cle: string) {
  const trouve = trouverScenario(cle)
  if (trouve === undefined) return
  await pilote.changerScenario(trouve)
  cleScenario.value = trouve.cle
  brief.value = trouve.brief
  disposition.value = pilote.disposition()
  choisi.value = undefined
  erreur.value = undefined
  enCours.value = false
  arreterHorloge()
  debut.value = 0
  maintenant.value = 0
}

function surEchappement(evenement: KeyboardEvent) {
  if (evenement.key === 'Escape') choisi.value = undefined
}

onMounted(() => window.addEventListener('keydown', surEchappement))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', surEchappement)
  arreterHorloge()
  void pilote.arreter()
})
</script>

<template>
  <div class="app">
    <section class="conduite">
      <header class="marque">
        <span class="marque-carre" aria-hidden="true"></span>
        <span class="marque-nom">Memo&nbsp;Labs</span>
        <span class="marque-lab">Lab · usine agentique</span>
      </header>

      <div class="mode">
        <span class="mode-pastille" :data-branche="mode === 'llm'" aria-hidden="true"></span>
        <span>{{ mode === 'llm' ? 'Mode LLM branché' : 'Mode déterministe' }}</span>
        <button
          class="mode-aide"
          :aria-expanded="aideMode"
          aria-controls="explication-mode"
          @click="aideMode = !aideMode"
        >
          {{ aideMode ? 'masquer' : "qu'est-ce que ça veut dire ?" }}
        </button>
      </div>
      <p v-if="aideMode" id="explication-mode" class="mode-explication">
        <template v-if="mode === 'llm'">
          L’architecte raisonne réellement : sa décision de composition est rédigée par un modèle.
          Le reste du run demeure déterministe, et un échec d’appel retombe sur la réponse écrite à
          la main.
        </template>
        <template v-else>
          Les agents se composent, fabriquent et travaillent réellement ; leur jugement est écrit à
          la main, pas produit par un modèle. Aucune clé, aucun token.
        </template>
      </p>
      <div class="mode-branchement">
        <InterrupteurModele
          :mode="mode"
          @brancher="brancherModele"
          @debrancher="debrancherModele"
        />
      </div>

      <div class="pane">
        <h1 class="titre-cache">L'usine agentique — du besoin au produit</h1>
        <label class="eyebrow" for="brief">Le besoin</label>
        <textarea id="brief" v-model="brief" class="champ-brief"></textarea>

        <div class="rangee-actions">
          <button class="bouton" :disabled="demarrage" @click="relancer">
            <span aria-hidden="true">▶</span>
            {{ enCours ? "Relancer l'usine" : "Lancer l'usine" }}
          </button>
          <select
            v-if="SCENARIOS.length > 1"
            class="selecteur"
            :value="cleScenario"
            aria-label="Scénario"
            @change="changerScenario(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="s in SCENARIOS" :key="s.cle" :value="s.cle">{{ s.titre }}</option>
          </select>
        </div>

        <p v-if="erreur" class="incident" role="alert">{{ erreur }}</p>
        <p v-else-if="etat.incidents.length" class="incident" role="status">
          {{ etat.incidents.length }} incident(s) —
          {{ etat.incidents[etat.incidents.length - 1]?.erreur.message }}
        </p>

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

    <main class="vivant" aria-label="Le run en direct">
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
          <p class="compteur-valeur">{{ etat.tokens.entree + etat.tokens.sortie }}</p>
          <p class="compteur-note">
            <!-- Le libellé suit ce qui a réellement été dépensé, pas le mode
                 courant : débrancher après un run n'efface pas la dépense. -->
            {{
              etat.tokens.entree + etat.tokens.sortie > 0
                ? `${etat.tokens.entree} entrée · ${etat.tokens.sortie} sortie`
                : 'aucun, mode déterministe'
            }}
          </p>
        </div>
        <div class="compteur">
          <p class="compteur-cle">Temps</p>
          <p class="compteur-valeur">{{ duree }}</p>
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

        <!-- Les deux occupent le même bas d'écran : le produit livré prend
             la place de la porte une fois la décision rendue. -->
        <PorteHumaine
          v-if="etat.porte && !verificateur"
          :porte="etat.porte"
          @approuver="approuver"
          @ecarter="ecarter"
        />

        <ProduitLivre
          v-if="verificateur"
          :verifier="verificateur"
          :contact="pilote.scenario().contact"
          @soumis="verificationSoumise"
        />

        <PanneauNoeud
          v-if="noeudChoisi"
          :noeud="noeudChoisi"
          :messages="messagesDuChoisi"
          @fermer="choisi = undefined"
        />
      </div>
    </main>
  </div>
</template>
