<template>
  <section class="porte">
    <template v-if="verdict?.etat === 'mesure'">
      <p class="text-muted porte-quand">
        Mesuré le {{ quand(verdict.mesure.le) }}, en {{ verdict.mesure.duree_s }} s, sous
        l'étiquette d'invites <strong class="text-highlighted">{{ verdict.mesure.invites }}</strong
        >.
        <template v-if="verdict.mesure.invites === 'production'">
          C'est la version en service, pas une candidate.
        </template>
      </p>

      <div class="porte-actions">
        <UButton size="sm" :disabled="enCours" @click="rejouer">
          Rejouer sous l'étiquette candidat
        </UButton>
        <span v-if="enCours" class="text-muted">
          {{ avancement?.secondes ?? 0 }} s, {{ avancement?.lignes.length ?? 0 }} cas joués
        </span>
        <span v-if="erreur" class="porte-echec" data-portes-echec>{{ erreur }}</span>
      </div>

      <!-- Ce qui s'affiche ici est ce que le harnais IMPRIME, ligne à ligne, au
           moment où il joue chaque cas. Rien n'est fabriqué : une barre de
           progression inventée tiendrait jusqu'au premier échec, puis
           détruirait la confiance d'un coup. -->
      <pre v-if="avancement && avancement.lignes.length > 0" class="porte-trace">{{
        avancement.lignes.join('\n')
      }}</pre>

      <div v-for="(cas, porte) in parPorte" :key="porte" class="porte-groupe">
        <h4>{{ porte }}</h4>
        <article v-for="c in cas" :key="c.id" class="porte-cas" :data-conforme="c.conforme">
          <div class="porte-ligne">
            <!-- L'état ne tient jamais à la couleur seule : un signe et un mot
                 le portent aussi. -->
            <span class="porte-marque" aria-hidden="true">{{ c.conforme ? '=' : '!' }}</span>
            <code class="porte-id">{{ c.id }}</code>
            <span class="text-muted"> attendu {{ c.attendu }}, obtenu {{ c.obtenu }} </span>
            <span class="porte-etat">{{ c.conforme ? 'conforme' : 'écart' }}</span>
          </div>
          <p class="porte-raison">{{ c.raison }}</p>
          <p class="porte-pourquoi text-dimmed">{{ c.pourquoi }}</p>
        </article>
      </div>

      <InvitesSection :agent="agent" />
    </template>

    <p v-else-if="verdict?.etat === 'absente'" class="text-muted">
      {{ verdict.raison }}. Rien n'est affiché plutôt qu'un tableau vide : une liste sans écart se
      lirait comme « tout va bien », c'est-à-dire l'inverse de ce qu'on sait.
    </p>
  </section>
</template>

<script lang="ts" setup>
// La décision d'un agent, dépliée sous sa ligne dans la flotte.
//
// Elle montre les cas PASSÉS autant que les écarts, et c'est le point. Le
// rapport texte du harnais ne détaille que ce qui casse, ce qui suffit à
// réparer et pas à décider : une porte qui rend les neuf bons verdicts pour de
// mauvaises raisons ne se voit que si l'on peut lire ses raisons quand elle a
// raison.
//
// Chaque cas porte aussi son `pourquoi`, écrit à la main dans `cas-portes.json`
// (« si ce cas vire au rouge, la porte est devenue trop sévère et l'agent ne
// démarchera plus rien »). C'est ce qui permet de juger un écart au lieu de le
// constater.
//
// Rien n'est chargé tant que la section n'est pas ouverte : la page unique
// n'affiche qu'un score tant qu'on ne demande pas la suite, et lire les invites
// coûte un aller-retour à Langfuse par agent.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import InvitesSection from './InvitesSection.vue'
import {
  lancerMesure,
  lireVerdict,
  suivreMesure,
  type Avancement,
  type CasJoue,
  type Verdict,
} from './client'

const props = defineProps<{ agent: string }>()

const verdict = ref<Verdict | undefined>()
const avancement = ref<Avancement | undefined>()
const erreur = ref<string | undefined>()
let horloge: ReturnType<typeof setInterval> | undefined

const enCours = computed(() => avancement.value !== undefined && !avancement.value.fini)

onMounted(async () => {
  verdict.value = await lireVerdict(props.agent)
})

function arreter() {
  if (horloge === undefined) return
  clearInterval(horloge)
  horloge = undefined
}

onUnmounted(arreter)

async function rejouer() {
  erreur.value = undefined
  try {
    avancement.value = await lancerMesure(props.agent, 'candidat')
  } catch (cause) {
    erreur.value = cause instanceof Error ? cause.message : String(cause)
    return
  }
  // Une seconde : c'est le rythme auquel le harnais rend un cas, pas un
  // rafraîchissement décoratif. Plus vite ne montrerait rien de plus.
  horloge = setInterval(async () => {
    const id = avancement.value?.id
    if (id === undefined) return arreter()
    try {
      avancement.value = await suivreMesure(id)
    } catch (cause) {
      erreur.value = cause instanceof Error ? cause.message : String(cause)
      return arreter()
    }
    if (!avancement.value.fini) return
    arreter()
    if (avancement.value.echec) erreur.value = avancement.value.echec
    else if (avancement.value.verdict)
      verdict.value = { etat: 'mesure', mesure: avancement.value.verdict }
  }, 1000)
}

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
.porte {
  margin: 0.75rem 0 0.25rem;
  padding: 0.875rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);

  h4 {
    margin: 1.25rem 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  p {
    margin: 0;
    line-height: 1.6;
  }

  .porte-quand {
    font-size: 0.8125rem;
    max-width: 44rem;
  }

  .porte-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
  }

  .porte-echec {
    color: var(--error);
    font-size: 0.8125rem;
  }

  .porte-trace {
    margin: 0.75rem 0 0;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre;
  }

  .porte-cas {
    padding: 0.625rem 0 0.625rem 0.75rem;
    border-left: 2px solid var(--border-primary);
    margin-bottom: 0.5rem;
  }

  .porte-cas[data-conforme='false'] {
    border-left-color: var(--error);
  }

  .porte-ligne {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .porte-marque {
    font-family: var(--font-mono);
    width: 1rem;
  }

  .porte-id {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .porte-etat {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .porte-cas[data-conforme='false'] .porte-etat {
    color: var(--error);
  }

  .porte-raison {
    margin-top: 0.375rem;
    font-size: 0.875rem;
  }

  .porte-pourquoi {
    margin-top: 0.25rem;
    font-size: 0.8125rem;
  }
}
</style>
