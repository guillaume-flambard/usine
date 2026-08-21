<script setup lang="ts">
import type { NodeView } from '../state/model'

defineProps<{ node: NodeView; messages: readonly { sequence: number; message: string }[] }>()
defineEmits<{ close: [] }>()

const LABELS: Record<NodeView['state'], string> = {
  idle: 'Inactif',
  'waiting-for-dependency': 'En attente de dépendance',
  working: 'En cours',
  finished: 'Terminé',
  failed: 'En erreur',
  released: 'Libéré',
}
</script>

<template>
  <aside class="panel" aria-label="Détail du composant">
    <button class="panel-close" @click="$emit('close')">Fermer</button>
    <h2>{{ node.display.label ?? node.name }}</h2>
    <dl>
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
      <p class="eyebrow">Ce qu'il a écrit</p>
      <article class="artifact">
        <h3>{{ node.artifact.title }}</h3>
        <p v-if="node.artifact.derivedFrom" class="artifact-origin">
          Découle de {{ node.artifact.derivedFrom }}.
        </p>
        <pre class="artifact-body">{{ node.artifact.body }}</pre>
      </article>
    </template>

    <template v-if="node.build">
      <p class="eyebrow">Fabriqué pendant le run</p>
      <p class="artifact-origin">
        Voie :
        {{ node.build.route === 'composition' ? 'composition de primitives' : 'évaluation de code' }}.
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
      <p class="eyebrow">Ce qu'il a dit</p>
      <div class="panel-thread">
        <p v-for="message in messages" :key="message.sequence">
          {{ message.message }}
        </p>
      </div>
    </template>
  </aside>
</template>
