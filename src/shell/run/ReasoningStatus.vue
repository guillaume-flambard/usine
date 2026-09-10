<template>
  <!-- Nothing is rendered while nobody is thinking. A status bar that always
       shows something teaches the eye to ignore it, and there is no honest
       thing to say about a model that is not working. -->
  <ReasoningPulse v-if="thinking.length > 0" :thinking="thinking" data-run-reasoning />
</template>

<script lang="ts" setup>
// What replaced the shell's spinner.
//
// Upstream put a spinning disc and a progress bar here, both waiting on an
// `entry:init` from a server this product does not have: they could never mean
// anything true. What belongs in a status bar is what is actually happening,
// and the only thing that takes real time here is a model thinking.
//
// The component is the one the run already uses (`src/ui/ReasoningPulse.vue`),
// not a copy: two renderings of the same fact drift, and the day they disagree
// the screen starts lying about the run.
import { computed } from 'vue'
import ReasoningPulse from '../../ui/ReasoningPulse.vue'
import { state } from './pilot'

const thinking = computed(() => state.value.thinking)
</script>
