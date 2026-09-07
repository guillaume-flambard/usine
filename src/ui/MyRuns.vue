<script setup lang="ts">
// Ce que le visiteur a gardé, et ce qu'il peut en faire.
//
// Sans cette vue, un visiteur connecté ne verrait aucun de ses runs : la
// tenancy les rend privés. Les deux onglets portent leur vrai contrat — chacun
// nomme le panneau qu'il commande, la liste ne prend qu'un arrêt dans l'ordre
// de tabulation, les flèches circulent.
import type { RunSummary } from '../app/runs-client'

defineProps<{
  runs: readonly RunSummary[]
  trash: readonly RunSummary[]
  tabs: { label: string; value: string; slot: string }[]
  exportUrlFor: (id: string) => string
  /** Où le visiteur télécharge tout ce que le service détient sur lui. */
  accountExport: string
  eraseConfirm: boolean
}>()

const tab = defineModel<'live' | 'trash'>('tab', { required: true })

defineEmits<{
  open: [string]
  share: [RunSummary]
  trashRun: [string]
  restore: [string]
  purge: [string]
  erase: []
  'update:eraseConfirm': [boolean]
}>()
</script>

<template>
  <div id="my-runs" class="flex flex-col gap-3 border-b border-default px-5 pb-4">
    <UTabs v-model="tab" :items="tabs" class="w-full">
      <template #live>
        <ul class="flex flex-col gap-1 pt-2">
          <li v-if="runs.length === 0" class="my-runs-empty py-2 text-sm text-dimmed">Aucun run conservé.</li>
          <li v-for="run in runs" :key="run.id" class="flex flex-wrap items-center gap-2 text-sm">
            <UButton
              variant="link"
              color="neutral"
              class="my-runs-open truncate"
              data-run-open
              @click="$emit('open', run.id)"
            >
              {{ run.brief || 'run' }}
            </UButton>
            <span class="text-xs text-dimmed tabular-nums">
              {{ run.events }} évts{{ run.shared ? ' · partagé' : '' }}
            </span>
            <span class="ml-auto flex items-center gap-1">
              <UButton variant="link" color="neutral" data-run-share @click="$emit('share', run)">
                {{ run.shared ? 'révoquer' : 'partager' }}
              </UButton>
              <UButton
                variant="link"
                color="neutral"
                :to="exportUrlFor(run.id)"
                external
                data-run-export
              >
                exporter
              </UButton>
              <UButton
                variant="link"
                color="neutral"
                data-run-trash
                @click="$emit('trashRun', run.id)"
              >
                corbeille
              </UButton>
            </span>
          </li>
        </ul>
      </template>

      <template #trash>
        <ul class="flex flex-col gap-1 pt-2">
          <li v-if="trash.length === 0" class="my-runs-empty py-2 text-sm text-dimmed">Corbeille vide.</li>
          <li v-for="run in trash" :key="run.id" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="my-runs-open truncate">{{ run.brief || 'run' }}</span>
            <span class="ml-auto flex items-center gap-1">
              <UButton
                variant="link"
                color="neutral"
                data-run-restore
                @click="$emit('restore', run.id)"
              >
                restaurer
              </UButton>
              <UButton variant="link" color="neutral" data-run-purge @click="$emit('purge', run.id)">
                purger
              </UButton>
            </span>
          </li>
        </ul>
      </template>
    </UTabs>

    <!-- Mes données (RGPD) : emporter ou effacer. L'effacement est
         irréversible et demande une confirmation explicite. -->
    <div class="my-data flex flex-wrap items-center gap-2 border-t border-default pt-3">
      <UButton variant="link" color="neutral" :to="accountExport" external data-account-export>
        exporter mes données
      </UButton>
      <template v-if="!eraseConfirm">
        <UButton
          variant="link"
          color="error"
          class="my-data-erase"
          data-account-erase
          @click="$emit('update:eraseConfirm', true)"
        >
          supprimer mon compte
        </UButton>
      </template>
      <template v-else>
        <span class="text-sm text-muted" data-erase-warn>Effacer définitivement compte et runs ?</span>
        <UButton
          variant="link"
          color="error"
          class="my-data-erase"
          data-account-erase-confirm
          @click="$emit('erase')"
        >
          confirmer
        </UButton>
        <UButton
          variant="link"
          color="neutral"
          data-account-erase-cancel
          @click="$emit('update:eraseConfirm', false)"
        >
          annuler
        </UButton>
      </template>
    </div>
  </div>
</template>
