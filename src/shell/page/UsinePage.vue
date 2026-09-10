<template>
  <k-layout main="page-usine">
    <template #header>
      <span class="crumb">L'usine</span>
    </template>

    <div class="content-area">
      <UScrollArea class="content-body">
        <div class="usine-body">
          <!-- Ce que fait cet écran, en toutes lettres. Une icône ne le dit
               pas, et sans la phrase il ne reste qu'une liste de noms. -->
          <p class="usine-role text-muted">
            Les agents tournent sur le lab, pas ici. Cet écran dit s'ils vont bien, et vous fait
            trancher les changements d'invite qu'ils proposent.
          </p>

          <template v-if="etat?.etat === 'vue'">
            <!-- La réponse, et rien d'autre au-dessus. Dix secondes veut dire
                 une phrase, pas un tableau. -->
            <header class="usine-verdict" :data-va-bien="vaBien">
              <h1>{{ titre }}</h1>
              <p class="text-muted">{{ sousTitre }}</p>
              <p v-if="!etat.flotte.fraiche" class="usine-perime" data-flotte-perime>
                Cette photo date de {{ etat.flotte.age_minutes }} minutes. L'observateur passe
                toutes les quinze minutes : au-delà, ce qui est affiché ne dit plus l'état
                d'aujourd'hui, et un « tout va bien » périmé vaut moins que rien.
              </p>
            </header>

            <section v-if="groupes.length > 0" class="usine-alertes">
              <!-- Une ligne par PROBLEME, pas par victime. Le texte long de
                   l'observateur porte la leçon et se déplie à la demande : en
                   dix secondes on veut savoir quoi, pas encore pourquoi. -->
              <article v-for="g in groupes" :key="g.cle" class="usine-alerte">
                <div class="usine-ligne">
                  <span class="usine-resume">{{ g.resume }}</span>
                  <code class="usine-nom">{{ g.agents.join(', ') }}</code>
                </div>
                <button
                  v-if="g.texte.length > g.resume.length"
                  type="button"
                  class="usine-lien"
                  :aria-expanded="deplie.has(g.cle)"
                  @click="basculer(g.cle)"
                >
                  {{ deplie.has(g.cle) ? 'Replier' : 'Pourquoi' }}
                </button>
                <p v-if="deplie.has(g.cle)" class="usine-lecon text-muted">{{ g.texte }}</p>
              </article>
            </section>

            <section class="usine-liste">
              <h2>La flotte</h2>

              <p v-if="portes?.etat === 'absente'" class="usine-portes-muettes text-dimmed">
                Je ne sais pas si une décision attend : {{ portes.raison }}. Aucune porte n'est
                montrée ci-dessous, et cela ne veut pas dire qu'il n'y en a pas.
              </p>

              <article v-for="agent in etat.flotte.agents" :key="agent.nom" class="usine-agent">
                <div class="usine-ligne">
                  <!-- L'état ne tient jamais à la couleur seule. -->
                  <span class="usine-marque" aria-hidden="true">{{ marque(agent) }}</span>
                  <code class="usine-nom">{{ agent.nom }}</code>
                  <span class="text-muted">{{ etatLisible(agent) }}</span>
                  <span class="usine-fait text-dimmed">{{ fait(agent) }}</span>
                </div>
                <p class="usine-quoi text-dimmed">{{ agent.quoi }}</p>

                <!-- La décision se prend là où l'agent est nommé, pas sur un
                     autre écran : c'est le même objet, et deux pages en
                     faisaient deux sujets sans rapport. -->
                <template v-if="porteDe(agent.nom)">
                  <div class="usine-porte-tete">
                    <span class="usine-score" :data-ecart="aUnEcart(agent.nom)">
                      {{ scoreLisible(porteDe(agent.nom)!) }}
                    </span>
                    <button
                      type="button"
                      class="usine-lien"
                      :aria-expanded="ouverte === agent.nom"
                      @click="ouvrir(agent.nom)"
                    >
                      {{ ouverte === agent.nom ? 'Fermer' : 'Ouvrir ses portes' }}
                    </button>
                  </div>
                  <PorteSection v-if="ouverte === agent.nom" :agent="agent.nom" />
                </template>
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
// Le seul écran de l'usine.
//
// Il répond d'abord à une question, et une seule : est-ce que tout va bien ?
// Les alertes viennent ensuite, la flotte en dernier, et la décision à prendre
// sur un agent se déplie sous la ligne de cet agent.
//
// Elle y est parce qu'elle y appartient. Elle vivait sur une seconde page, et
// deux pages faisaient deux sujets : « mes agents vont-ils bien » d'un côté,
// « promouvoir cette invite » de l'autre, sans que rien ne dise que la seconde
// parle du premier.
//
// Rien n'est calculé ici : les alertes sont celles que l'observateur a déjà
// rédigées, avec leur leçon dans le texte, et les scores sont ceux que le
// harnais a écrits. Un écran qui refait le jugement finirait par diverger de ce
// que le lab mesure.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { grouper } from '../flotte/alertes'
import { lireFlotte, type Agent, type EtatFlotte } from '../flotte/client'
import PorteSection from '../portes/PorteSection.vue'
import { listerPortes, type EtatPortes, type ResumePorte } from '../portes/client'

const etat = ref<EtatFlotte | undefined>()
const portes = ref<EtatPortes | undefined>()
const ouverte = ref<string | undefined>()
let horloge: ReturnType<typeof setInterval> | undefined

async function recharger() {
  etat.value = await lireFlotte()
}

onMounted(() => {
  void recharger()
  // Les portes ne sont pas relues au fil de l'eau : une mesure ne bouge que
  // quand quelqu'un la relance, et c'est cet écran qui la relance.
  void listerPortes().then((lues) => (portes.value = lues))
  // La flotte, elle, est régénérée toutes les quinze minutes : relire plus
  // souvent ne montrerait rien de neuf, et une minute suffit à voir vieillir
  // la photo.
  horloge = setInterval(() => void recharger(), 60_000)
})

onUnmounted(() => {
  if (horloge !== undefined) clearInterval(horloge)
})

const vaBien = computed(() => etat.value?.etat === 'vue' && etat.value.flotte.alertes === 0)

const titre = computed(() => {
  if (etat.value?.etat !== 'vue') return ''
  const n = groupes.value.length
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

// Une ligne par problème, pas par victime : trois agents qui partagent un
// compte b.ai produisent trois fois la même alerte de quota.
const groupes = computed(() =>
  etat.value?.etat === 'vue' ? grouper(etat.value.flotte.agents) : [],
)

const deplie = ref(new Set<string>())

function basculer(cle: string) {
  const suite = new Set(deplie.value)
  if (!suite.delete(cle)) suite.add(cle)
  deplie.value = suite
}

function porteDe(nom: string): ResumePorte | undefined {
  if (portes.value?.etat !== 'lues') return undefined
  return portes.value.portes.find((p) => p.agent === nom)
}

function aUnEcart(nom: string): boolean {
  const porte = porteDe(nom)
  if (!porte || porte.conformes === null || porte.total === null) return false
  return porte.conformes < porte.total
}

/** Le score tel que le harnais l'a écrit, sans le reformuler en jugement. */
function scoreLisible(porte: ResumePorte): string {
  if (porte.conformes === null || porte.total === null) return 'mesure illisible'
  const sous = porte.invites ? ` sous ${porte.invites}` : ''
  return `${porte.conformes}/${porte.total} cas conformes${sous}`
}

// Une seule porte ouverte à la fois : chacune charge ses invites depuis
// Langfuse en s'ouvrant, et huit sections dépliées cacheraient la réponse en
// dix secondes sous ce qu'on venait justement lire ensuite.
function ouvrir(nom: string) {
  ouverte.value = ouverte.value === nom ? undefined : nom
}

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
.page-usine {
  .usine-body {
    max-width: 52rem;
    margin: 0 auto;
    padding: 2.5rem 2rem 4rem;
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

  .usine-role {
    margin-bottom: 1.75rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-primary);
    font-size: 0.8125rem;
    max-width: 44rem;
  }

  .usine-verdict[data-va-bien='false'] h1 {
    color: var(--error);
  }

  .usine-perime {
    margin-top: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-left: 2px solid var(--warning);
    background: var(--bg-secondary);
    font-size: 0.8125rem;
  }

  .usine-alerte {
    margin-top: 1rem;
    padding-left: 0.75rem;
    border-left: 2px solid var(--error);
  }

  .usine-resume {
    font-weight: 500;
  }

  .usine-lien {
    margin-top: 0.25rem;
    padding: 0;
    background: none;
    border: 0;
    font: inherit;
    font-size: 0.75rem;
    color: var(--text-tertiary);
    text-decoration: underline;
    cursor: pointer;

    &:hover {
      color: var(--text-primary);
    }
  }

  .usine-lecon {
    margin-top: 0.375rem;
    font-size: 0.8125rem;
  }

  .usine-portes-muettes {
    margin-bottom: 0.75rem;
    font-size: 0.8125rem;
  }

  .usine-agent {
    padding: 0.625rem 0;
    border-top: 1px solid var(--border-primary);
  }

  .usine-ligne {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    flex-wrap: wrap;
  }

  .usine-marque {
    font-family: var(--font-mono);
    width: 1rem;
  }

  .usine-nom {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .usine-fait {
    margin-left: auto;
    font-size: 0.8125rem;
  }

  .usine-quoi {
    margin-top: 0.125rem;
    padding-left: 1.625rem;
    font-size: 0.8125rem;
  }

  .usine-porte-tete {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
    padding-left: 1.625rem;
  }

  .usine-score {
    font-size: 0.8125rem;
  }

  .usine-score[data-ecart='true'] {
    color: var(--error);
  }
}
</style>
