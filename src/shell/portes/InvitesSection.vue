<template>
  <section class="invites">
    <h2>Invites</h2>

    <p v-if="erreur" class="portes-echec" data-invites-echec>{{ erreur }}</p>

    <article v-for="invite in invites" :key="invite.nom" class="invite">
      <div class="invite-tete">
        <code class="portes-id">{{ invite.nom }}</code>
        <span class="text-muted">
          en service : version {{ invite.service?.version ?? 'aucune' }}
        </span>
      </div>

      <p v-if="invite.ecartee" class="text-dimmed" data-invite-ecartee>
        Candidate en version {{ invite.ecartee.version }} écartée. Elle reste lisible : effacer une
        proposition refusée effacerait la raison de ne pas la reproposer.
      </p>

      <p v-else-if="!invite.candidat" class="text-dimmed">
        Aucune candidate en attente. C'est l'état normal : le correcteur ne propose que lorsqu'il
        trouve une clause rompue.
      </p>

      <template v-else>
        <p class="text-muted">
          Candidate en version {{ invite.candidat.version }}, {{ ampleur(diff(invite)) }} ligne(s)
          changée(s).
        </p>

        <pre class="invite-diff"><span
          v-for="(ligne, index) in diff(invite)"
          :key="index"
          :data-etat="ligne.etat"
        >{{ marque(ligne.etat) }} {{ ligne.texte }}
</span></pre>

        <div class="invite-actions">
          <!-- Deux temps, et c'est délibéré. Une étiquette est unique dans
               Langfuse : poser « production » ici la retire de la version qui
               l'avait, donc ce bouton change ce que les agents en service
               utilisent, tout de suite. Un clic ne doit pas suffire. -->
          <template v-if="arme === invite.nom">
            <span class="text-muted">
              Mettre la version {{ invite.candidat.version }} en service, maintenant ?
            </span>
            <UButton color="error" :disabled="occupe" @click="poser(invite, 'production')">
              Oui, mettre en service
            </UButton>
            <UButton variant="ghost" :disabled="occupe" @click="arme = undefined">Annuler</UButton>
          </template>
          <template v-else>
            <UButton :disabled="occupe" @click="arme = invite.nom">Mettre en service</UButton>
            <UButton variant="subtle" :disabled="occupe" @click="poser(invite, 'ecartee')">
              Écarter
            </UButton>
          </template>
        </div>
      </template>
    </article>
  </section>
</template>

<script lang="ts" setup>
// Ce que le correcteur laisse explicitement à un humain. Son en-tête dit, quand
// il ne promeut pas lui-même : « À promouvoir à la main dans Langfuse si elle
// convient. » C'est ce geste-là, outillé du diff qui manquait pour le poser en
// connaissance de cause.
//
// Écarter ne supprime pas : la version reçoit `ecartee`, ce qui lui retire
// `candidat` du même geste et laisse la trace. Supprimer effacerait la raison
// de ne pas recommencer.
import { onMounted, ref } from 'vue'
import { ampleur, diffLignes, type LigneDiff } from './diff'
import { etiqueterInvite, lireInvites, type Etiquette, type InvitePorte } from './client'

const props = defineProps<{ agent: string }>()

const invites = ref<readonly InvitePorte[]>([])
const erreur = ref<string | undefined>()
const arme = ref<string | undefined>()
const occupe = ref(false)

async function recharger() {
  try {
    invites.value = (await lireInvites(props.agent)).invites
  } catch (cause) {
    erreur.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(recharger)

function diff(invite: InvitePorte): LigneDiff[] {
  return diffLignes(invite.service?.texte ?? '', invite.candidat?.texte ?? '')
}

function marque(etat: LigneDiff['etat']): string {
  // L'état ne tient jamais à la couleur seule.
  return etat === 'ajoute' ? '+' : etat === 'retire' ? '-' : ' '
}

async function poser(invite: InvitePorte, etiquette: Etiquette) {
  const version = invite.candidat?.version
  if (version === undefined) return
  occupe.value = true
  erreur.value = undefined
  try {
    await etiqueterInvite(props.agent, invite.nom, version, etiquette)
  } catch (cause) {
    erreur.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    occupe.value = false
    arme.value = undefined
  }
  await recharger()
}

defineExpose({ ampleur })
</script>

<style lang="scss">
.invites {
  margin-top: 2.5rem;

  .invite {
    padding: 0.75rem 0;
    border-top: 1px solid var(--border-primary);
  }

  .invite-tete {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.375rem;
  }

  .invite-diff {
    margin: 0.5rem 0;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre;

    span[data-etat='ajoute'] {
      color: var(--success);
    }

    span[data-etat='retire'] {
      color: var(--error);
    }
  }

  .invite-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
}
</style>
