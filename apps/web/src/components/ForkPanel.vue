<script setup lang="ts">
/**
 * Forking from a checkpoint (MEM-23), with the specialist of the branch
 * (MEM-33). A dialog, not a fifth zone: it chooses, it does not add a surface.
 *
 * The fork streams while the branch runs, so the button says it is working and
 * the screen only changes once the branch has an answer to show.
 */
import { computed, toRef } from 'vue'
import { checkpointLabel, isForkable } from '../chat/forks'
import { useFork } from '../chat/useFork'

const props = defineProps<{ threadId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ forked: [threadId: string] }>()

const { checkpoints, specialists, chosen, specialist, busy, failure, canFork, fork } = useFork(
  toRef(props, 'threadId'),
  open,
)

const options = computed(() =>
  checkpoints.value.map((checkpoint) => ({
    value: checkpoint.checkpoint_id,
    label: checkpointLabel(checkpoint),
    disabled: !isForkable(checkpoint),
  })),
)

const specialistOptions = computed(() => [
  { value: 'default', label: 'Spécialiste par défaut du service' },
  ...specialists.value.map((item) => ({
    value: item.name,
    label: `${item.name} (${item.identity.framework})`,
  })),
])

async function onFork() {
  const branch = await fork()
  if (!branch) return
  open.value = false
  emit('forked', branch)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Forker ce run"
    description="La branche rejoue le run depuis ce point, avec le spécialiste choisi. L'original n'est pas modifié."
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4" data-fork-panel>
        <UFormField label="Point de reprise" name="checkpoint">
          <USelect
            v-model="chosen"
            :items="options"
            value-key="value"
            class="w-full"
            data-fork-checkpoint
          />
        </UFormField>

        <UFormField
          label="Spécialiste de la branche"
          name="specialist"
          help="Changer de framework est le sujet du fork : la partie commune se rejoue depuis les cassettes."
        >
          <USelect
            v-model="specialist"
            :items="specialistOptions"
            value-key="value"
            class="w-full"
            data-fork-specialist
          />
        </UFormField>

        <p v-if="failure" class="text-sm text-error" role="alert" data-fork-error>{{ failure }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xl"
          label="Annuler"
          :ui="{ base: 'min-h-11' }"
          data-fork-cancel
          @click="open = false"
        />
        <UButton
          color="primary"
          size="xl"
          :loading="busy"
          :disabled="!canFork"
          :label="busy ? 'Bifurcation en cours' : 'Forker ici'"
          :ui="{ base: 'min-h-11' }"
          data-fork-confirm
          @click="onFork"
        />
      </div>
    </template>
  </UModal>
</template>
