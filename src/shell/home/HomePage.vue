<template>
  <k-layout main="page-home">
    <template #header>
      <span class="crumb">L'usine</span>
    </template>

    <div class="content-area">
      <UScrollArea class="content-body">
        <div class="home-body">
          <h1>Écrire et prouver le jugement d'un agent</h1>
          <p class="text-muted">
            Décrivez un besoin. Des agents naissent, se parlent et chargent leurs outils à chaud. Le
            suivi de leur réflexion s'affiche en bas de l'écran, adossé aux événements du run.
          </p>

          <UTextarea
            v-model="brief"
            :rows="3"
            :disabled="running"
            placeholder="Décrivez un besoin."
            class="home-brief"
          />

          <div class="home-actions">
            <UButton :disabled="running || brief.trim().length === 0" @click="startRun">
              Lancer le run
            </UButton>
            <span class="text-muted">{{ phase }}</span>
            <span v-if="failure" class="text-error" data-run-failure>{{ failure }}</span>
          </div>

          <p class="text-dimmed">
            Aucune clé n'est branchée, donc rien n'est inventé : le run rejoue des réponses
            préparées, et l'écran ne prétend pas le contraire.
          </p>

          <k-slot name="home"></k-slot>
        </div>
      </UScrollArea>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>
// The shell's own home page. The vendored one is left untouched next door: it
// gates everything on `ctx.client.socket` and shows, in Chinese, "connecting to
// the Cordis server" whenever that is absent, which here is always. Rather than
// rewrite their file, this one is registered in its place.
//
// The smallest true thing: a brief, a button, and the run's own phase. The
// reasoning trace is not here but in the status bar, where it is visible from
// every page rather than from this one only.
import { computed, ref } from 'vue'
import { DEMO_BRIEF } from '../../examples/demo'
import { pilot, state } from '../run/pilot'

const brief = ref(DEMO_BRIEF)

// `pilot.phase()` reads the kernel, not a ref, so a computed over it alone
// never re-evaluates. Touching the read model's sequence is how `FactoryApp`
// solves it: same idiom rather than a second one.
const phase = computed(() => {
  void state.value.lastSequence
  return pilot.phase()
})
const running = computed(() => state.value.thinking.length > 0 || phase.value !== 'Au repos')

// A start that fails must say so. `pilot` reports through `error()` rather
// than by throwing, so a silent `await` leaves the page reading "Au repos"
// while nothing runs, which is exactly the kind of quiet lie this screen is
// supposed to stop telling.
const failure = ref<string | undefined>(undefined)

async function startRun() {
  failure.value = undefined
  try {
    await pilot.start(brief.value)
  } catch (cause) {
    failure.value = cause instanceof Error ? cause.message : String(cause)
    return
  }
  failure.value = pilot.error()
}
</script>

<style lang="scss">
.page-home {
  .home-body {
    max-width: 44rem;
    margin: 0 auto;
    padding: 3rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    line-height: 1.6;
  }

  .home-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
}
</style>
