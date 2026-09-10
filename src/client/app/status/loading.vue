<template>
  <k-status v-if="!socket">
    <span class="offline">Connexion interrompue</span>
  </k-status>
  <k-status v-else-if="progress < 1">
    <!-- A null model value is how Nuxt UI expresses an indeterminate bar,
         where Element Plus took a separate `indeterminate` flag. -->
    <UProgress class="k-status-progress" :model-value="ctx.client.loader.version ? progress * 100 : null" />
    <span>Chargement des composants de la page</span>
  </k-status>
</template>

<script lang="ts" setup>

import { useContext } from '@cordisjs/client'
import { computed } from 'vue'

const ctx = useContext()
const socket = ctx.client.socket

const progress = computed(() => {
  const states = Object.values(ctx.client.loader.entries)
  return states.filter(state => state.done.value).length / states.length
})

</script>

<style lang="scss" scoped>
.offline {
  color: var(--error, #e74c3c);
  font-weight: 500;
}
</style>
