<script setup lang="ts">
// The application, alive, in the page.
//
// This component knows nothing about what the application does — it cannot:
// the screen and the behaviours were written during the run. It mounts the
// sandboxed frame, keeps it in step with what the agents publish, and shows
// the one thing the visitor could not otherwise see: what the hot replacement
// spared them.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createFrameHost, type FrameHost } from '../app/frame-host'
import type { Behaviour } from '../app/behaviour'
import type { Interaction, Session } from '../app/session'

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
  /** Y a-t-il de quoi forker ce run — le voir diverger en deux futurs ? */
  forkable?: boolean
}>()

const emit = defineEmits<{ interaction: [Interaction]; share: []; takeAway: []; fork: [] }>()

const frame = ref<HTMLIFrameElement | null>(null)
const refused = ref<readonly string[]>([])
const interactions = ref(0)
let host: FrameHost | undefined

// Un run peut poser un écran vide : les agents ont parlé, aucun markup n'est
// sorti. On le dit honnêtement plutôt que de montrer un grand cadre blanc qui
// laisse croire à une application qui marche. Le cadre reste monté (le host en
// dépend) mais masqué tant qu'il n'y a rien à rendre.
const hasScreen = computed(() => props.screen.markup.trim().length > 0)

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
    },
    // The exchange itself, carried back to the run: an agent may answer it by
    // recomposing the behaviour the visitor just used.
    onObservation: (interaction) => emit('interaction', interaction),
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
  <section class="live-app flex flex-col gap-2 p-5">
    <p class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">Application — vivante, elle se refait pendant que vous vous en servez</p>

    <!--
      `allow-scripts` and nothing else. Without `allow-same-origin` the frame
      has an opaque origin: it cannot read this page, its storage, or its
      variables. The bridge inside it is ours; the markup is the agents'.
    -->
    <iframe
      ref="frame"
      class="live-frame min-h-[260px] w-full flex-1 rounded-md border border-default bg-white"
      :class="{ hidden: !hasScreen }"
      title="L'application produite par ce run"
      src="/sandbox.html"
      sandbox="allow-scripts"
    ></iframe>

    <p
      v-if="!hasScreen"
      class="live-empty rounded-md border border-dashed border-accented p-5 text-sm text-muted"
      role="status"
    >
      L'application n'a encore rien posé — les agents ont parlé, mais aucun écran
      n'est sorti du run.
    </p>

    <p class="live-counter flex flex-wrap gap-2 font-mono text-xs text-muted tabular-nums">
      <span>{{ props.session.counts.replacements }} remplacement(s) à chaud</span>
      <span>·</span>
      <span>{{ props.session.counts.restarts }} redémarrage</span>
      <span>·</span>
      <span>{{ interactions }} interaction(s) conservée(s)</span>
    </p>

    <p v-if="refused.length > 0" class="text-sm text-muted">
      Écran assaini : {{ refused.join(', ') }}.
    </p>

    <p class="text-sm text-muted">
      Rien de ce que vous voyez ici n’existait avant votre brief. Servez-vous-en : les agents la
      remodèlent autour de ce que vous en faites, et ce que vous avez fait est conservé à chaque
      changement.
    </p>

    <!-- Ce qu'on emporte vit avec ce qu'on emporte, pas dans une barre latérale
         permanente : ces gestes n'ont de sens qu'une fois l'application là. -->
    <div class="live-actions flex flex-wrap items-center gap-2">
      <UButton size="sm" variant="outline" color="neutral" data-take-away @click="emit('takeAway')">
        Emporter l’application
      </UButton>
      <UButton
        v-if="archive && !replay"
        size="sm"
        variant="outline"
        color="neutral"
        :disabled="sharing"
        data-share
        @click="emit('share')"
      >
        {{ sharing ? 'Conservation…' : 'Lien de rejeu' }}
      </UButton>
      <!-- Le fork est le geste phare : il se distingue des autres. -->
      <UButton v-if="forkable" size="sm" class="fork-start" data-fork @click="emit('fork')">
        Forker ce run
      </UButton>
      <UButton variant="link" color="neutral" :to="`mailto:${contact}`" external>
        Écrire à Memo Labs
      </UButton>
    </div>
    <p v-if="forkable" class="fork-why max-w-[62ch] text-sm text-muted">
      Forker : rejoue cette trajectoire, change l'agent à chaud sur la branche, et
      regarde deux futurs diverger — pour tester un correctif sur la vraie
      trajectoire qui a planté, avant la prod.
    </p>
    <p v-if="shareLink" class="text-sm text-muted"><code>{{ shareLink }}</code> — il rejoue ce run à l’identique, application comprise.</p>
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
  background: var(--ui-bg);
  border-top: 1px solid var(--ui-border);
}
</style>
