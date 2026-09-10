<template>
  <!-- Plus de barre d'activités. Elle ne pouvait porter qu'une entrée, et une
       barre à une entrée ne fait pas naviguer : elle occupe une colonne pour
       répéter le titre déjà écrit dans l'en-tête. `--nav-width` vaut zéro en
       conséquence, sinon la page garderait la marge de la barre absente. -->
  <keep-alive>
    <component v-if="matched" :is="matched.component" :key="matched.path"></component>
  </keep-alive>
  <not-found v-if="!matched && showNotFound"></not-found>
  <!-- Upstream span a disc here while it waited for a server to declare its
       entries. Every view is local now, so that wait is an instant and there
       is nothing to report: a blank frame is honest, a spinner claims work.
       La barre de statut est partie pour la même raison : plus aucune vue ne
       pilote de run depuis la disparition de la page de chat, donc la trace de
       raisonnement qu'elle portait ne pouvait plus rien annoncer. -->
  <menu-list></menu-list>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useContext, useRoute } from '@cordisjs/client'
import MenuList from './menu/index.vue'
import NotFound from './not-found.vue'

const route = useRoute()
const ctx = useContext()

// Two-state route view now, gated separately so `<keep-alive>` only wraps the
// matched component (NotFound has no state worth caching, and keeping it
// outside avoids same-key/different-component aliasing in the cache).
//
// Upstream had a third state: a spinner, for the window where the server had
// not yet declared its entries. There is no server here, every view is local
// and imported before the app mounts, so that window is an instant and it
// renders nothing rather than claiming work.
//
// `showNotFound` still decides when a URL that matches nothing is decisively a
// 404. `loader.initialStatus === 404` short-circuits it; otherwise it waits for
// `loader.ready`, which the boot opens itself in `app/index.ts`.
const matched = computed(() => route.matched[0])
const showNotFound = computed(() => {
  const loader = ctx.client.loader
  return loader.initialStatus === 404 || loader.ready.value
})
</script>
