<template>
  <k-layout main="page-flotte">
    <template #header>
      <span class="crumb">Mes agents</span>
    </template>

    <div class="content-area">
      <UScrollArea class="content-body">
        <div class="flotte-body">
          <template v-if="etat?.etat === 'vue'">
            <!-- La réponse, et rien d'autre au-dessus. Dix secondes veut dire
                 une phrase, pas un tableau. -->
            <header class="flotte-verdict" :data-va-bien="vaBien">
              <h1>{{ titre }}</h1>
              <p class="text-muted">{{ sousTitre }}</p>
              <p v-if="!etat.flotte.fraiche" class="flotte-perime" data-flotte-perime>
                Cette photo date de {{ etat.flotte.age_minutes }} minutes. L'observateur passe
                toutes les quinze minutes : au-delà, ce qui est affiché ne dit plus l'état
                d'aujourd'hui, et un « tout va bien » périmé vaut moins que rien.
              </p>
            </header>

            <section v-if="alertes.length > 0" class="flotte-alertes">
              <article v-for="a in alertes" :key="a.cle" class="flotte-alerte">
                <code class="flotte-nom">{{ a.agent }}</code>
                <p>{{ a.texte }}</p>
              </article>
            </section>

            <section class="flotte-liste">
              <h2>La flotte</h2>
              <article v-for="agent in etat.flotte.agents" :key="agent.nom" class="flotte-agent">
                <div class="flotte-ligne">
                  <!-- L'état ne tient jamais à la couleur seule. -->
                  <span class="flotte-marque" aria-hidden="true">{{ marque(agent) }}</span>
                  <code class="flotte-nom">{{ agent.nom }}</code>
                  <span class="text-muted">{{ etatLisible(agent) }}</span>
                  <span class="flotte-fait text-dimmed">{{ fait(agent) }}</span>
                </div>
                <p class="flotte-quoi text-dimmed">{{ agent.quoi }}</p>
              </article>
            </section>
          </template>

          <template v-else-if="etat?.etat === 'absente'">
            <h1>Je ne vois pas la flotte</h1>
            <p class="text-muted">
              {{ etat.raison }}. Rien n'est affiché plutôt qu'une liste vide : elle se lirait comme
              « aucun agent en panne », c'est-à-dire l'inverse de « je ne sais pas ».
            </p>
          </template>
        </div>
      </UScrollArea>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>
// L'écran répond à une question, et une seule : est-ce que tout va bien ?
//
// Tout le reste est en dessous. Les huit tableaux de la page markdown disent
// mieux ce que les agents FONT ; ils ne disent pas en dix secondes ce qui NE VA
// PAS, parce qu'il faut les lire pour le savoir. Ici la réponse est la première
// chose, les alertes viennent ensuite, la flotte en dernier.
//
// Rien n'est calculé ici : les alertes sont celles que l'observateur a déjà
// rédigées, avec leur leçon dans le texte. Un écran qui refait le jugement
// finirait par diverger de ce que le lab mesure.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { lireFlotte, type Agent, type EtatFlotte } from './client'

const etat = ref<EtatFlotte | undefined>()
let horloge: ReturnType<typeof setInterval> | undefined

async function recharger() {
  etat.value = await lireFlotte()
}

onMounted(() => {
  void recharger()
  // La source est régénérée toutes les quinze minutes : relire plus souvent ne
  // montrerait rien de neuf, et une minute suffit à voir vieillir la photo.
  horloge = setInterval(() => void recharger(), 60_000)
})

onUnmounted(() => {
  if (horloge !== undefined) clearInterval(horloge)
})

const vaBien = computed(() => etat.value?.etat === 'vue' && etat.value.flotte.alertes === 0)

const titre = computed(() => {
  if (etat.value?.etat !== 'vue') return ''
  const n = etat.value.flotte.alertes
  if (n === 0) return 'Tout va bien.'
  return n === 1 ? '1 chose ne va pas.' : `${n} choses ne vont pas.`
})

const sousTitre = computed(() => {
  if (etat.value?.etat !== 'vue') return ''
  const agents = etat.value.flotte.agents
  const vivants = agents.filter((a) => a.statut === 'running').length
  const age = etat.value.flotte.age_minutes
  const quand =
    age === null ? 'à une date illisible' : age < 1 ? "à l'instant" : `il y a ${age} min`
  const etatFlotte =
    vivants === agents.length
      ? `${agents.length} agents, tous vivants`
      : `${vivants} agents vivants sur ${agents.length}`
  return `${etatFlotte}. Vu ${quand}.`
})

const alertes = computed(() => {
  if (etat.value?.etat !== 'vue') return []
  return etat.value.flotte.agents.flatMap((a) =>
    a.alertes.map((texte, index) => ({ cle: `${a.nom}-${index}`, agent: a.nom, texte })),
  )
})

function marque(agent: Agent): string {
  if (agent.statut === 'running') return agent.alertes.length > 0 ? '!' : '='
  return 'x'
}

function etatLisible(agent: Agent): string {
  if (agent.statut === null) return 'container absent'
  const depuis = agent.depuis ? `, depuis ${agent.depuis}` : ''
  return `${agent.statut}${depuis}`
}

/** Ce qu'il a produit, dans l'ordre où ça compte : ce qui sort du lab d'abord. */
function fait(agent: Agent): string {
  const c = agent.compteurs ?? {}
  const morceaux: string[] = []
  if (c['mails partis']) morceaux.push(`${c['mails partis']} mail(s)`)
  if (c['cycles']) morceaux.push(`${c['cycles']} cycle(s)`)
  if (c['idees jugees']) morceaux.push(`${c['idees jugees']} jugée(s)`)
  return morceaux.length > 0 ? morceaux.join(', ') : 'rien produit sur la fenêtre'
}
</script>

<style lang="scss">
.page-flotte {
  .flotte-body {
    max-width: 48rem;
    margin: 0 auto;
    padding: 3rem 2rem 4rem;
  }

  h1 {
    margin: 0 0 0.375rem;
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  h2 {
    margin: 2.5rem 0 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  p {
    margin: 0;
    line-height: 1.6;
  }

  .flotte-verdict[data-va-bien='false'] h1 {
    color: var(--error);
  }

  .flotte-perime {
    margin-top: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-left: 2px solid var(--warning);
    background: var(--bg-secondary);
    font-size: 0.8125rem;
  }

  .flotte-alerte {
    margin-top: 1rem;
    padding-left: 0.75rem;
    border-left: 2px solid var(--error);
  }

  .flotte-agent {
    padding: 0.625rem 0;
    border-top: 1px solid var(--border-primary);
  }

  .flotte-ligne {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    flex-wrap: wrap;
  }

  .flotte-marque {
    font-family: var(--font-mono);
    width: 1rem;
  }

  .flotte-nom {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .flotte-fait {
    margin-left: auto;
    font-size: 0.8125rem;
  }

  .flotte-quoi {
    margin-top: 0.125rem;
    padding-left: 1.625rem;
    font-size: 0.8125rem;
  }
}
</style>
