<script setup lang="ts">
// The application, alive, in the page.
//
// This component knows nothing about what the application does — it cannot:
// the screen and the behaviours were written during the run. It mounts the
// sandboxed frame, keeps it in step with what the agents publish, and shows
// the one thing the visitor could not otherwise see: what the hot replacement
// spared them.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createFrameHost, type FrameHost } from '../app/frame-host'
import type { Behaviour } from '../app/behaviour'
import type { Session } from '../app/session'

const props = defineProps<{
  behaviours: readonly Behaviour[]
  screen: { markup: string; revision: number }
  session: Session
  /** Bumped by the parent on every run event, to drive the sync. */
  pulse: number
  /** Where to write to go further. */
  contact: string
  /** Y a-t-il un run à conserver ? */
  archive: boolean
  /** Ce run est-il lui-même un rejeu ? On ne repartage pas un rejeu. */
  replay: boolean
  sharing: boolean
  shareLink?: string
}>()

const emit = defineEmits<{ interaction: []; share: []; takeAway: [] }>()

const frame = ref<HTMLIFrameElement | null>(null)
const refused = ref<readonly string[]>([])
const interactions = ref(0)
let host: FrameHost | undefined

onMounted(() => {
  if (frame.value === null) return
  host = createFrameHost({
    frame: frame.value,
    behaviours: () => props.behaviours,
    screen: () => props.screen,
    session: props.session,
    onMounted: (report) => {
      refused.value = report.refused
    },
    onInteraction: () => {
      interactions.value = props.session.counts.interactions
      emit('interaction')
    },
  })
  host.sync()
})

// Every run event is a chance for the frame to be out of date: a new screen,
// a behaviour published, a version replaced. Syncing is idempotent, so this
// costs nothing when nothing changed.
watch(
  () => props.pulse,
  () => host?.sync(),
)

onBeforeUnmount(() => host?.dispose())
</script>

<template>
  <section class="live-app">
    <p class="eyebrow">Application — écrite pendant ce run</p>

    <!--
      `allow-scripts` and nothing else. Without `allow-same-origin` the frame
      has an opaque origin: it cannot read this page, its storage, or its
      variables. The bridge inside it is ours; the markup is the agents'.
    -->
    <iframe
      ref="frame"
      class="live-frame"
      title="L'application produite par ce run"
      src="/sandbox.html"
      sandbox="allow-scripts"
    ></iframe>

    <p class="live-counter">
      <span>{{ props.session.counts.replacements }} remplacement(s) à chaud</span>
      <span>·</span>
      <span>{{ props.session.counts.restarts }} redémarrage</span>
      <span>·</span>
      <span>{{ interactions }} interaction(s) conservée(s)</span>
    </p>

    <p v-if="refused.length > 0" class="live-refused">
      Écran assaini : {{ refused.join(', ') }}.
    </p>

    <p class="live-help">
      Rien de ce que vous voyez ici n’existait avant votre brief. Servez-vous-en pendant que les
      agents continuent : ce que vous faites est conservé quand ils remplacent une version.
    </p>

    <!-- Ce qu'on emporte vit avec ce qu'on emporte, pas dans une barre latérale
         permanente : ces gestes n'ont de sens qu'une fois l'application là. -->
    <div class="live-actions">
      <button class="picker" @click="emit('takeAway')">Emporter l’application</button>
      <button v-if="archive && !replay" class="picker" :disabled="sharing" @click="emit('share')">
        {{ sharing ? 'Conservation…' : 'Lien de rejeu' }}
      </button>
      <a class="product-contact" :href="`mailto:${contact}`">Écrire à Memo Labs</a>
    </div>
    <p v-if="shareLink" class="live-help"><code>{{ shareLink }}</code> — il rejoue ce run à l’identique, application comprise.</p>
  </section>
</template>

<style scoped>
/* Au bas de la zone, comme la porte, et au-dessus du graphe.
   En simple élément de flux, ce panneau se plaçait à côté du graphe et lui
   prenait la moitié de la largeur — le tracé se retrouvait écrasé contre le
   bord et illisible. */
.live-app {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 60%;
  overflow: auto;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 24px;
  background: var(--surface, #fff);
  border-top: 1px solid var(--line, #e0dbd4);
}

.live-frame {
  width: 100%;
  min-height: 260px;
  flex: 1 1 auto;
  border: 1px solid var(--line, #e0dbd4);
  background: #fff;
}

.live-counter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted, #6b6560);
}

.live-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.live-refused,
.live-help {
  margin: 0;
  font-size: 13px;
  color: var(--muted, #6b6560);
}
</style>
