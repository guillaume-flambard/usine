<script setup lang="ts">
// The inspector. It is a real dialog: it takes the attention, so it takes the
// focus, gives it back, and closes on Escape without the shell having to listen
// for keys on the window.
import type { NodeView } from '../state/model'

defineProps<{ node: NodeView; messages: readonly { sequence: number; message: string }[] }>()
const emit = defineEmits<{ close: [] }>()

const LABELS: Record<NodeView['state'], string> = {
  idle: 'Inactif',
  'waiting-for-dependency': 'En attente de dépendance',
  working: 'En cours',
  finished: 'Terminé',
  failed: 'En erreur',
  released: 'Libéré',
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <USlideover
    :open="true"
    :title="node.display.label ?? node.name"
    description="Détail du composant"
    data-node-panel
    @update:open="onOpenChange"
  >
    <template #body>
      <dl class="grid grid-cols-[92px_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-xs uppercase tracking-wider text-muted pt-1">Composant</dt>
        <dd class="font-mono text-xs">{{ node.name }}</dd>
        <dt class="text-xs uppercase tracking-wider text-muted pt-1">Rôle</dt>
        <dd>{{ node.display.role }}</dd>
        <dt class="text-xs uppercase tracking-wider text-muted pt-1">État</dt>
        <dd>{{ LABELS[node.state] }}</dd>
        <template v-if="node.display.technology">
          <dt class="text-xs uppercase tracking-wider text-muted pt-1">Technologie</dt>
          <dd>{{ node.display.technology }}</dd>
        </template>
        <template v-if="node.needs.length">
          <dt class="text-xs uppercase tracking-wider text-muted pt-1">Consomme</dt>
          <dd>{{ node.needs.join(', ') }}</dd>
        </template>
        <template v-if="node.provides.length">
          <dt class="text-xs uppercase tracking-wider text-muted pt-1">Publie</dt>
          <dd>{{ node.provides.join(', ') }}</dd>
        </template>
        <template v-if="node.cause">
          <dt class="text-xs uppercase tracking-wider text-muted pt-1">Cause</dt>
          <dd>
            {{
              node.cause.kind === 'dependency-gone'
                ? `Dépendance partie : ${node.cause.names.join(', ')}`
                : 'Libération du run'
            }}
          </dd>
        </template>
        <template v-if="node.error">
          <dt class="text-xs uppercase tracking-wider text-muted pt-1">Erreur</dt>
          <dd>{{ node.error.code }} — {{ node.error.message }}</dd>
        </template>
      </dl>

      <template v-if="node.artifact">
        <p class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Ce qu'il a écrit</p>
        <article class="mt-2 rounded-md border border-default p-3">
          <h3>{{ node.artifact.title }}</h3>
          <p v-if="node.artifact.derivedFrom" class="text-sm text-muted">
            Découle {{ node.artifact.derivedFrom }}.
          </p>
          <pre class="artifact-body mt-2 text-xs">{{ node.artifact.body }}</pre>
        </article>
      </template>

      <template v-if="node.build">
        <p class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Fabriqué pendant le run</p>
        <p class="text-sm text-muted">
          Voie :
          {{
            node.build.route === 'composition' ? 'composition de primitives' : 'évaluation de code'
          }}.
        </p>
        <!-- The specification the part follows from and the code that really
             runs, side by side: this is the proof that it was built. -->
        <div class="side-by-side mt-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-muted">Spécification</p>
            <pre class="code mt-1 rounded-md bg-elevated p-2 font-mono text-xs text-toned" tabindex="0">{{ node.build.specification }}</pre>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-muted">Code chargé</p>
            <pre class="code mt-1 rounded-md bg-elevated p-2 font-mono text-xs text-toned" tabindex="0">{{ node.build.source }}</pre>
          </div>
        </div>
      </template>

      <template v-if="messages.length">
        <p class="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Ce qu'il a dit</p>
        <div class="mt-2 flex flex-col gap-2 text-sm text-muted">
          <p v-for="message in messages" :key="message.sequence">
            {{ message.message }}
          </p>
        </div>
      </template>
    </template>
  </USlideover>
</template>
