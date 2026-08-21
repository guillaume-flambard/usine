<script setup lang="ts">
// La coquille : deux volets, 100vh, la page ne défile jamais.
// Tout ce qui fait vivre le run est dans le pilote, hors de ce composant :
// c'est ce qui rend le câblage testable sans navigateur.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { creerPilote } from '../orchestration/pilote'
import { CONTACT, EXEMPLES } from '../exemples'
import { BRIEF_DE_DEMONSTRATION, raisonneurDeDemonstration } from '../exemples/demonstration'
import type { NoeudVue } from '../etat/modele'
import GrapheVivant from './GrapheVivant.vue'
import PanneauNoeud from './PanneauNoeud.vue'
import PorteHumaine from './PorteHumaine.vue'
import ProduitLivre from './ProduitLivre.vue'
import InterrupteurModele, { type SourceModele } from './InterrupteurModele.vue'
import { raisonneurRelais, relaisDisponible } from '../runtime/raisonneur/relais'
import type { OrigineRaisonnement } from '../runtime/raisonneur'
import {
  nouveauRun,
  payoffAffiche,
  porteAtteinte,
  runLance,
  verificationSoumise,
} from '../telemetrie'

const pilote = creerPilote()
// Sans modèle, l'usine ne peut rien inventer. Plutôt qu'un écran vide, elle
// rejoue des réponses préparées — et l'écran ne prétend jamais l'inverse.
pilote.brancher(raisonneurDeDemonstration())
const etat = pilote.store.etat

const brief = ref(BRIEF_DE_DEMONSTRATION)

/** La démonstration ne sait rejouer qu'un besoin ; l'écran ne le cache pas. */
const briefRejouable = computed(
  () =>
    ['allégation', 'santé', 'complément', 'conformité'].filter((mot) => brief.value.includes(mot))
      .length >= 2,
)
// La disposition suit le graphe : elle n'est plus une photographie prise
// avant le run, elle est recalculée quand l'usine fait naître un agent.
const disposition = pilote.disposition
const enCours = ref(false)
const demarrage = ref(false)
const erreur = ref<string | undefined>()
const choisi = ref<string | undefined>()
const aideMode = ref(false)
const mode = ref<OrigineRaisonnement>(pilote.modeRaisonnement())
const source = ref<SourceModele>('aucune')
const relaisPret = ref(false)

/**
 * Le modèle du site. La clé n'est pas ici : elle vit sur le relais, et le
 * navigateur ne voit qu'une route de même origine. Sans relais configuré, on
 * reste en déterministe sans rien annoncer de faux.
 */
function brancherRelaisDuSite() {
  pilote.brancher(raisonneurRelais())
  source.value = 'relais'
  mode.value = pilote.modeRaisonnement()
  erreur.value = undefined
}

async function brancherModele(cle: string) {
  try {
    // Import dynamique : sans branchement, le SDK n'est jamais chargé et le
    // bundle du mode par défaut n'en porte pas une ligne.
    const { raisonneurClaude } = await import('../runtime/raisonneur/claude')
    pilote.brancher(raisonneurClaude({ cle }))
    source.value = 'cle'
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
  // Débrancher ne rend pas la page inerte : elle retombe sur la démonstration
  // rejouée, qui s'annonce comme telle.
  pilote.brancher(raisonneurDeDemonstration())
  source.value = 'aucune'
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

/** Le produit du run : une fonction publiée sous un nom que personne n'avait choisi. */
const produit = computed(() => {
  void etat.value.derniereSequence
  return pilote.produit()
})

/** Les agents que ce run a fait naître. Aucun n'existait avant le brief. */
const agentsCrees = computed(
  () => etat.value.noeuds.filter((noeud) => noeud.nom !== 'agent-maitre').length,
)

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

// Les quatre faits mesurés se déduisent de l'état, jamais d'un contenu.
watch(
  () => etat.value.porte !== undefined,
  (atteinte) => {
    if (atteinte) porteAtteinte()
  },
)

watch(
  () => produit.value !== undefined,
  (livre) => {
    if (livre) payoffAffiche()
  },
)

// Le temps se fige à la fin du run, et pendant la délibération : un compteur
// qui monte sur une usine à l'arrêt est un faux signal.
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

async function changerExemple(cle: string) {
  const trouve = EXEMPLES.find((exemple) => exemple.cle === cle)
  if (trouve === undefined) return
  await pilote.arreter()
  brief.value = trouve.brief
  choisi.value = undefined
  erreur.value = undefined
  enCours.value = false
  // Repartir d'un autre brief clôt le run en cours, mesure comprise.
  nouveauRun()
  pilote.store.reinitialiser()
  arreterHorloge()
  debut.value = 0
  maintenant.value = 0
}

function surEchappement(evenement: KeyboardEvent) {
  if (evenement.key === 'Escape') choisi.value = undefined
}

onMounted(() => {
  window.addEventListener('keydown', surEchappement)
  // Sonde le relais une fois : s'il porte une clé, le visiteur voit de vrais
  // raisonnements sans avoir rien à fournir.
  void relaisDisponible().then((pret) => {
    relaisPret.value = pret
    if (pret && source.value === 'aucune') brancherRelaisDuSite()
  })
})

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
        <span>{{
          mode === 'llm'
            ? source === 'relais'
              ? 'Modèle du site — run vivant'
              : 'Modèle branché — run vivant'
            : 'Démonstration rejouée'
        }}</span>
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
          Aucun agent n’est écrit d’avance. Un modèle{{
            source === 'relais' ? ' hébergé par le site, sans clé de votre part' : ''
          }}
          décide lesquels existent, ce qu’ils se demandent, et le code des outils qu’ils écrivent.
          Le graphe que vous voyez n’a jamais existé avant votre besoin.
        </template>
        <template v-else>
          Aucun modèle n’est branché : l’usine ne peut rien inventer. Elle a besoin d’un modèle pour
          faire naître ses agents — sans lui, il n’y a rien à montrer.
        </template>
      </p>
      <div class="mode-branchement">
        <InterrupteurModele
          :mode="mode"
          :source="source"
          :relais-pret="relaisPret"
          @brancher="brancherModele"
          @brancher-relais="brancherRelaisDuSite"
          @debrancher="debrancherModele"
        />
      </div>

      <div class="pane">
        <h1 class="titre-cache">L'usine agentique — du besoin au produit</h1>
        <label class="eyebrow" for="brief">Le besoin — l'usine n'existe pas encore</label>
        <textarea id="brief" v-model="brief" class="champ-brief"></textarea>
        <!-- Un besoin que la démonstration ne sait pas rejouer ne produira
             rien : le dire avant le clic vaut mieux qu'un graphe vide. -->
        <p v-if="mode === 'demonstration' && !briefRejouable" class="plan-resume">
          <span class="plan-cle">Note</span>
          Ce besoin n’est pas celui de la démonstration. Sans modèle branché, l’usine n’aura rien à
          faire naître.
        </p>

        <div class="rangee-actions">
          <button class="bouton" :disabled="demarrage" @click="relancer">
            <span aria-hidden="true">▶</span>
            {{ enCours ? "Relancer l'usine" : "Lancer l'usine" }}
          </button>
          <select
            class="selecteur"
            value=""
            aria-label="Partir d'un exemple"
            @change="changerExemple(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Partir d'un exemple…</option>
            <option v-for="e in EXEMPLES" :key="e.cle" :value="e.cle">{{ e.titre }}</option>
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

        <!-- Le plan est la seule chose qui explique le graphe : il n'existait
             pas avant le brief, et il n'est pas le même d'un brief à l'autre. -->
        <p v-if="agentsCrees > 0" class="plan-resume">
          <span class="plan-cle">Chantier</span>
          {{ agentsCrees }} agents créés pendant ce run · aucun n'existait avant votre besoin
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
                : mode === 'demonstration'
                  ? 'aucun, démonstration rejouée'
                  : 'aucun, aucun modèle branché'
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
      <!-- Un panneau ouvert mange le bas de l'écran : le graphe se replie
           au-dessus au lieu d'être coupé par lui. -->
      <div class="zone" :data-panneau="Boolean(produit || (etat.porte && !produit))">
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
          v-if="etat.porte && !produit"
          :porte="etat.porte"
          @approuver="approuver"
          @ecarter="ecarter"
        />

        <ProduitLivre
          v-if="produit"
          :executer="produit.executer"
          :nom="produit.nom"
          :contact="CONTACT"
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
