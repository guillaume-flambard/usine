<script setup lang="ts">
// Deux futurs, côte à côte, dans la zone scène.
//
// C'est le payoff visible du moteur de fork (stories 1–5, 6a, 7) : on forke un
// run et on voit **le tronc et la branche diverger** sous porte humaine
// (AD-38/39). Le tronc est un *recording* (ses comportements recompilés à N
// répondent, mais rien ne s'y édite, AD-37/48) ; la branche est une exécution
// neuve où éditer un comportement appelle `branch.replace` (AD-31/37), sans
// jamais toucher le tronc. Un bandeau **compare** les deux par la mesure
// (`measureRun`, AD-40) ; une porte par branche garde ou défait la branche
// (AD-39/47).
//
// Ce composant ne connaît rien de ce que l'application fait — il ne le peut
// pas : l'écran et les comportements ont été écrits pendant le run. Il monte
// deux cadres sablés (un par panneau), les tient à jour, et n'affiche aucun
// chiffre qui ne soit une mesure réelle du flux.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createFrameHost, type FrameHost } from '../app/frame-host'
import { createSession } from '../app/session'
import { behaviourKey, type Behaviour } from '../app/behaviour'
import { measureDelta, measureRun } from '../app/measure'
import { liveBehaviours } from '../orchestration/factory'
import type { Fork } from '../orchestration/pilot'
import type { RunArchive } from '../app/replay'

const props = defineProps<{
  /** Le fork courant : un tronc (recording) et une branche (exécution). */
  fork: Fork
  /** L'archive forkée, pour mesurer le préfixe du tronc (`sequence <= at`). */
  archive: RunArchive
  /** Le point de fork N (`state.lastSequence` au moment du fork). */
  at: number
  /**
   * Un mot du parent après un remplacement de branche : rien si la nouvelle
   * version a pris, un message si le code n'a pas compilé (la précédente sert
   * encore). Le parent est l'autorité qui applique `branch.replace` (AD-31).
   */
  notice?: string
}>()

const emit = defineEmits<{
  replace: [{ name: string; code: string }]
  reject: []
  exit: []
}>()

const trunkFrame = ref<HTMLIFrameElement | null>(null)
const branchFrame = ref<HTMLIFrameElement | null>(null)
let trunkHost: FrameHost | undefined
let branchHost: FrameHost | undefined

// Une session par panneau : deux futurs, deux comptes d'interactions isolés
// (AD-38). Rien ici ne fuit d'un panneau à l'autre.
const trunkSession = createSession()
const branchSession = createSession()
const trunkInteractions = ref(0)
const branchInteractions = ref(0)

// Les comportements vivants de la branche, relus à chaque événement de son
// store : un remplacement change la version qui répond sans rien changer
// d'autre à l'écran. Le tronc, lui, est figé — un recording.
const branchBehaviours = computed<readonly Behaviour[]>(() => {
  void props.fork.branch.store.state.value.lastSequence
  return liveBehaviours(props.fork.branch.kernel)
})

// --- L'édition d'un comportement, côté branche (divergence v1, sans agents) ---

/**
 * Le code de chaque comportement à N, lu dans le préfixe : de quoi pré-remplir
 * l'éditeur pour que le visiteur parte de la version qui sert, puis la fasse
 * diverger. Même règle que `pilot.sourceOf`, restreinte au préfixe `[1..N]`.
 */
const sourceAtFork = computed(() => {
  const prefix = props.archive.events.filter((event) => event.sequence <= props.at)
  const byName = new Map<string, string>()
  for (const name of branchBehaviours.value.map((behaviour) => behaviour.name)) {
    const key = behaviourKey(name)
    // Les composants qui portent ce comportement dans le préfixe.
    const holders = new Set<string>()
    for (const event of prefix) {
      if (event.type === 'component-created' && event.provides.includes(key)) holders.add(event.id)
    }
    // La dernière source construite pour l'un d'eux : la version qui sert à N.
    let found: string | undefined
    for (const event of prefix) {
      if (event.type !== 'component-built') continue
      if (!holders.has(event.id)) continue
      found = event.build.source
    }
    if (found !== undefined) byName.set(name, found)
  }
  return byName
})

const editedName = ref('')
const editedCode = ref('')

watch(
  branchBehaviours,
  (behaviours) => {
    // Au premier rendu, on sélectionne le premier comportement de la branche.
    if (editedName.value === '' && behaviours.length > 0) {
      editedName.value = behaviours[0]?.name ?? ''
    }
  },
  { immediate: true },
)

// Changer de comportement recharge son code à N dans l'éditeur.
watch(editedName, (name) => {
  editedCode.value = sourceAtFork.value.get(name) ?? ''
})

function applyEdit() {
  const name = editedName.value
  const code = editedCode.value
  if (name === '' || code.trim().length === 0) return
  // Le parent applique (`fork.branch.replace`) et renvoie le verdict par
  // `notice` : ce composant tient le fork, mais l'autorité d'application vit
  // dans FactoryApp, comme le veut le contrat de la story.
  emit('replace', { name, code })
}

// --- La comparaison, mesurée, jamais affirmée (AD-40) ---

const trunkMeasure = computed(() =>
  measureRun({
    version: props.archive.version,
    brief: props.archive.brief,
    events: props.archive.events.filter((event) => event.sequence <= props.at),
  }),
)

const branchMeasure = computed(() => {
  void props.fork.branch.store.state.value.lastSequence
  return measureRun({
    version: props.archive.version,
    brief: props.archive.brief,
    events: props.fork.branch.stream(),
  })
})

/** Y a-t-il seulement de quoi mesurer ? Sinon, pas de bandeau (pas de zéros). */
const hasData = computed(
  () => trunkMeasure.value.events > 0 || branchMeasure.value.events > 0,
)

/** Une ligne du bandeau : la clé, les deux mesures, et l'écart. */
const rows = computed(() => {
  const t = trunkMeasure.value
  const b = branchMeasure.value
  return [
    { key: 'Remplacements', ...measureDelta(t.replacements, b.replacements) },
    { key: 'Événements', ...measureDelta(t.events, b.events) },
    { key: 'Retours arrière', ...measureDelta(t.rollbacks, b.rollbacks) },
    { key: 'Tokens', ...measureDelta(t.tokens, b.tokens) },
  ]
})

/** L'écart, écrit signé : `+2`, `-1`, `±0`, ou `—` s'il n'est pas mesurable. */
function deltaLabel(delta: number | null): string {
  if (delta === null) return '—'
  if (delta === 0) return '±0'
  return delta > 0 ? `+${delta}` : `${delta}`
}

// --- Montage des deux cadres ---

onMounted(() => {
  if (trunkFrame.value !== null) {
    trunkHost = createFrameHost({
      frame: trunkFrame.value,
      behaviours: () => props.fork.trunk.behaviours,
      screen: () => props.fork.trunk.screen,
      session: trunkSession,
      onInteraction: () => (trunkInteractions.value = trunkSession.counts.interactions),
    })
    trunkHost.sync()
  }
  if (branchFrame.value !== null) {
    branchHost = createFrameHost({
      frame: branchFrame.value,
      behaviours: () => branchBehaviours.value,
      screen: () => props.fork.branch.screen,
      session: branchSession,
      onInteraction: () => (branchInteractions.value = branchSession.counts.interactions),
    })
    branchHost.sync()
  }
})

// Un remplacement sur la branche change la version qui répond : on repousse au
// cadre ce qui a changé. Idempotent, donc sans coût quand rien n'a bougé.
watch(
  () => props.fork.branch.store.state.value.lastSequence,
  () => branchHost?.sync(),
)

onBeforeUnmount(() => {
  trunkHost?.dispose()
  branchHost?.dispose()
})
</script>

<template>
  <section class="fork" aria-label="Deux futurs du run, côte à côte">
    <header class="fork-head">
      <p class="eyebrow">Fork — deux futurs du même run, sous votre décision</p>
      <p class="fork-honesty">
        Le retour arrière est intra-runtime : on prévient avant un effet externe, on ne le
        répare pas après.
      </p>
      <!-- Une porte par branche, deux gestes de poids égal (DESIGN, AD-39). -->
      <div class="fork-gate">
        <button class="button" @click="emit('exit')">Garder la branche · revenir au run</button>
        <button class="button" @click="emit('reject')">Rejeter la branche</button>
      </div>
    </header>

    <div class="fork-panels">
      <!-- Le tronc : un recording, en lecture seule (AD-37/48). -->
      <section class="fork-panel" data-side="trunk" aria-label="Tronc — enregistrement">
        <p class="fork-label">
          <span class="fork-label-name">Tronc</span>
          <span class="fork-label-kind">enregistrement · lecture seule</span>
        </p>
        <iframe
          ref="trunkFrame"
          class="fork-frame"
          title="L'application du tronc, à N"
          src="/sandbox.html"
          sandbox="allow-scripts"
        ></iframe>
        <p class="fork-meta">{{ trunkInteractions }} interaction(s)</p>
      </section>

      <!-- La branche : une exécution neuve, où l'on édite un comportement. -->
      <section class="fork-panel" data-side="branch" aria-label="Branche — exécution neuve">
        <p class="fork-label">
          <span class="fork-label-name">Branche</span>
          <span class="fork-label-kind">exécution neuve</span>
        </p>
        <iframe
          ref="branchFrame"
          class="fork-frame"
          title="L'application de la branche, vivante"
          src="/sandbox.html"
          sandbox="allow-scripts"
        ></iframe>

        <form class="fork-edit" @submit.prevent="applyEdit">
          <label class="fork-edit-label" for="fork-behaviour">Éditer un comportement</label>
          <select id="fork-behaviour" v-model="editedName" class="fork-behaviour">
            <option v-for="behaviour in branchBehaviours" :key="behaviour.name" :value="behaviour.name">
              {{ behaviour.name }} — v{{ behaviour.version }}
            </option>
          </select>
          <textarea
            v-model="editedCode"
            class="fork-code"
            rows="3"
            spellcheck="false"
            aria-label="Code du comportement de la branche"
            placeholder="(input) => …"
          ></textarea>
          <div class="fork-edit-row">
            <button type="submit" class="picker fork-apply" :disabled="editedCode.trim().length === 0">
              Faire diverger la branche
            </button>
            <span class="fork-meta">{{ branchInteractions }} interaction(s)</span>
          </div>
          <p v-if="notice" class="fork-notice" role="status">{{ notice }}</p>
        </form>
      </section>
    </div>

    <!-- Le bandeau : les deux mesures et leur écart. Rien tant qu'il n'y a rien
         à mesurer — aucun zéro décoratif (AD-40). -->
    <div
      v-if="hasData"
      class="fork-compare"
      aria-label="Comparaison mesurée tronc / branche"
      aria-live="polite"
    >
      <table class="fork-table">
        <thead>
          <tr>
            <th scope="col" class="fork-table-key">Mesure</th>
            <th scope="col">Tronc</th>
            <th scope="col">Branche</th>
            <th scope="col">Écart</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <th scope="row" class="fork-table-key">{{ row.key }}</th>
            <td>{{ row.trunk ?? '—' }}</td>
            <td>{{ row.branch ?? '—' }}</td>
            <td class="fork-table-delta" :data-diverged="row.delta !== null && row.delta !== 0">
              {{ deltaLabel(row.delta) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
/* La vue fork vit dans la zone scène, jamais dans une cinquième zone (DESIGN,
   AD/quatre zones). Elle remplit la colonne de droite et ne déborde pas la
   page : seul son propre corps défile si l'écran est trop court. */
.fork {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 24px;
  overflow: auto;
  background: var(--surface, #fff);
}

.fork-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fork-honesty {
  margin: 0;
  font-size: 12px;
  color: var(--muted, #6b6055);
}

.fork-gate {
  display: flex;
  gap: 10px;
}
/* Deux gestes de poids strictement égal : le produit ne pousse pas vers l'un. */
.fork-gate .button {
  flex: 1;
}

.fork-panels {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
/* Sous une largeur étroite, deux colonnes écrasent les panneaux : on empile,
   tronc au-dessus de la branche, plutôt que de les rendre illisibles. */
@media (max-width: 900px) {
  .fork-panels {
    grid-template-columns: 1fr;
  }
}

.fork-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--line, #e7e2da);
  padding: 12px;
}

.fork-label {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
}
.fork-label-name {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink, #16130f);
}
.fork-label-kind {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted, #6b6055);
}

.fork-frame {
  width: 100%;
  flex: 1 1 auto;
  min-height: 180px;
  border: 1px solid var(--line, #e7e2da);
  background: #fff;
}

.fork-meta {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted, #6b6055);
}

.fork-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fork-edit-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted, #6b6055);
}
.fork-behaviour {
  border: 1px solid var(--line, #e7e2da);
  background: var(--surface, #fff);
  color: var(--ink, #16130f);
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
}
.fork-code {
  border: 1px solid var(--line, #e7e2da);
  background: var(--surface, #fff);
  color: var(--ink, #16130f);
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}
.fork-code:focus-visible,
.fork-behaviour:focus-visible {
  outline: 2px solid var(--accent, #ad4c16);
  outline-offset: 0;
}
.fork-edit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.fork-apply:disabled {
  opacity: 0.4;
  cursor: default;
}
.fork-notice {
  margin: 0;
  font-size: 12px;
  color: var(--accent, #ad4c16);
}

.fork-compare {
  flex: 0 0 auto;
}
.fork-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.fork-table th,
.fork-table td {
  border: 1px solid var(--line, #e7e2da);
  padding: 6px 10px;
  text-align: right;
  color: var(--ink, #16130f);
}
.fork-table thead th {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted, #6b6055);
  font-weight: 400;
}
.fork-table-key {
  text-align: left;
  color: var(--muted, #6b6055);
}
.fork-table-delta[data-diverged='true'] {
  color: var(--accent, #ad4c16);
  font-weight: 500;
}
</style>
