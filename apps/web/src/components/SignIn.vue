<script setup lang="ts">
/**
 * The door of a closed atelier (MEM-83): the page is public, the API is not.
 * One action, the Pocket ID login. Nothing here calls a model.
 */
import { SIGN_IN_URL } from '../chat/session'

defineProps<{ unreachable?: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <section
    class="m-auto flex w-full max-w-md flex-col gap-6 px-4 py-12"
    aria-labelledby="sign-in-title"
    data-sign-in
  >
    <div class="flex flex-col gap-3">
      <h1 id="sign-in-title" class="text-2xl font-semibold text-highlighted">L'usine agentique</h1>
      <p class="text-muted">
        Rejouez la trajectoire d'un agent, forkez-la, remplacez l'agent sur la branche et comparez
        les deux futurs côte à côte. Une action irréversible attend toujours une décision humaine.
      </p>
    </div>

    <template v-if="unreachable">
      <p class="text-sm text-error" role="alert" data-sign-in-error>
        Le service ne répond pas pour l'instant.
      </p>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        label="Réessayer"
        class="self-start"
        :ui="{ base: 'min-h-11' }"
        @click="$emit('retry')"
      />
    </template>
    <template v-else>
      <UButton
        :to="SIGN_IN_URL"
        external
        size="xl"
        label="Se connecter"
        icon="i-lucide-log-in"
        class="self-start"
        :ui="{ base: 'min-h-11' }"
        data-sign-in-button
      />
      <p class="text-sm text-muted">L'atelier est réservé aux comptes du lab (Pocket ID).</p>
    </template>
  </section>
</template>
