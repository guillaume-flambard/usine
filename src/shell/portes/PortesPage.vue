<template>
  <k-layout main="page-portes">
    <template #header>
      <span class="crumb">Portes de {{ agent }}</span>
    </template>

    <div class="content-area">
      <UScrollArea class="content-body">
        <div class="portes-body">
          <template v-if="verdict?.etat === 'mesure'">
            <header class="portes-tete">
              <h1>{{ verdict.mesure.conformes }} / {{ verdict.mesure.total }} cas conformes</h1>
              <p class="text-muted">
                Mesuré le {{ quand(verdict.mesure.le) }}, en {{ verdict.mesure.duree_s }} s, sous
                l'étiquette d'invites
                <strong class="text-highlighted">{{ verdict.mesure.invites }}</strong
                >.
                <template v-if="verdict.mesure.invites === 'production'">
                  C'est la version en service, pas une candidate.
                </template>
              </p>
            </header>

            <section v-for="(cas, porte) in parPorte" :key="porte" class="portes-groupe">
              <h2>{{ porte }}</h2>
              <article v-for="c in cas" :key="c.id" class="portes-cas" :data-conforme="c.conforme">
                <div class="portes-ligne">
                  <!-- L'état ne tient jamais à la couleur seule : un signe et un
                       mot le portent aussi. -->
                  <span class="portes-marque" aria-hidden="true">{{ c.conforme ? '=' : '!' }}</span>
                  <code class="portes-id">{{ c.id }}</code>
                  <span class="text-muted"> attendu {{ c.attendu }}, obtenu {{ c.obtenu }} </span>
                  <span class="portes-etat">{{ c.conforme ? 'conforme' : 'écart' }}</span>
                </div>
                <p class="portes-raison">{{ c.raison }}</p>
                <p class="portes-pourquoi text-dimmed">{{ c.pourquoi }}</p>
              </article>
            </section>
          </template>

          <template v-else-if="verdict?.etat === 'absente'">
            <h1>Aucune mesure</h1>
            <p class="text-muted">
              {{ verdict.raison }}. Rien n'est affiché plutôt qu'un tableau vide : une liste sans
              écart se lirait comme « tout va bien », c'est-à-dire l'inverse de ce qu'on sait.
            </p>
          </template>
        </div>
      </UScrollArea>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>
// L'écran de la porte humaine : ce que le harnais a mesuré, cas par cas.
//
// Il montre les cas PASSÉS autant que les écarts, et c'est le point. Le rapport
// texte du harnais ne détaille que ce qui casse, ce qui suffit à réparer et pas
// à décider : une porte qui rend les neuf bons verdicts pour de mauvaises
// raisons ne se voit que si l'on peut lire ses raisons quand elle a raison.
//
// Chaque cas porte aussi son `pourquoi`, écrit à la main dans `cas-portes.json`
// (« si ce cas vire au rouge, la porte est devenue trop sévère et l'agent ne
// démarchera plus rien »). C'est ce qui permet de juger un écart au lieu de le
// constater.
import { computed, onMounted, ref } from 'vue'
import { lireVerdict, type CasJoue, type Verdict } from './client'

const agent = 'acheteur'
const verdict = ref<Verdict | undefined>()

onMounted(async () => {
  verdict.value = await lireVerdict(agent)
})

const parPorte = computed<Record<string, CasJoue[]>>(() => {
  if (verdict.value?.etat !== 'mesure') return {}
  const groupes: Record<string, CasJoue[]> = {}
  for (const cas of verdict.value.mesure.cas) (groupes[cas.porte] ??= []).push(cas)
  return groupes
})

function quand(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR')
}
</script>

<style lang="scss">
.page-portes {
  .portes-body {
    max-width: 52rem;
    margin: 0 auto;
    padding: 2.5rem 2rem 4rem;
  }

  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.375rem;
    font-weight: 600;
  }

  h2 {
    margin: 2rem 0 0.75rem;
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

  .portes-tete p {
    max-width: 44rem;
  }

  .portes-cas {
    padding: 0.75rem 0 0.75rem 0.75rem;
    border-left: 2px solid var(--border-primary);
    margin-bottom: 0.5rem;
  }

  .portes-cas[data-conforme='false'] {
    border-left-color: var(--error);
  }

  .portes-ligne {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .portes-marque {
    font-family: var(--font-mono);
    width: 1rem;
  }

  .portes-id {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .portes-etat {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .portes-cas[data-conforme='false'] .portes-etat {
    color: var(--error);
  }

  .portes-raison {
    margin-top: 0.375rem;
  }

  .portes-pourquoi {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
  }
}
</style>
