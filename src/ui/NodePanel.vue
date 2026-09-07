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
      <dl class="grid grid-cols-[92px_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt>Composant</dt>
        <dd class="identity">{{ node.name }}</dd>
        <dt>Rôle</dt>
        <dd>{{ node.display.role }}</dd>
        <dt>État</dt>
        <dd>{{ LABELS[node.state] }}</dd>
        <template v-if="node.display.technology">
          <dt>Technologie</dt>
          <dd>{{ node.display.technology }}</dd>
        </template>
        <template v-if="node.needs.length">
          <dt>Consomme</dt>
          <dd>{{ node.needs.join(', ') }}</dd>
        </template>
        <template v-if="node.provides.length">
          <dt>Publie</dt>
          <dd>{{ node.provides.join(', ') }}</dd>
        </template>
        <template v-if="node.cause">
          <dt>Cause</dt>
          <dd>
            {{
              node.cause.kind === 'dependency-gone'
                ? `Dépendance partie : ${node.cause.names.join(', ')}`
                : 'Libération du run'
            }}
          </dd>
        </template>
        <template v-if="node.error">
          <dt>Erreur</dt>
          <dd>{{ node.error.code }} — {{ node.error.message }}</dd>
        </template>
      </dl>

      <template v-if="node.artifact">
        <p class="eyebrow mt-6">Ce qu'il a écrit</p>
        <article class="artifact">
          <h3>{{ node.artifact.title }}</h3>
          <p v-if="node.artifact.derivedFrom" class="artifact-origin">
            Découle de {{ node.artifact.derivedFrom }}.
          </p>
          <pre class="artifact-body">{{ node.artifact.body }}</pre>
        </article>
      </template>

      <template v-if="node.build">
        <p class="eyebrow mt-6">Fabriqué pendant le run</p>
        <p class="artifact-origin">
          Voie :
          {{
            node.build.route === 'composition' ? 'composition de primitives' : 'évaluation de code'
          }}.
        </p>
        <!-- The specification the part follows from and the code that really
             runs, side by side: this is the proof that it was built. -->
        <div class="side-by-side">
          <div>
            <p class="eyebrow">Spécification</p>
            <pre class="code" tabindex="0">{{ node.build.specification }}</pre>
          </div>
          <div>
            <p class="eyebrow">Code chargé</p>
            <pre class="code" tabindex="0">{{ node.build.source }}</pre>
          </div>
        </div>
      </template>

      <template v-if="messages.length">
        <p class="eyebrow mt-6">Ce qu'il a dit</p>
        <div class="panel-thread">
          <p v-for="message in messages" :key="message.sequence">
            {{ message.message }}
          </p>
        </div>
      </template>
    </template>
  </USlideover>
</template>
