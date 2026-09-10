<template>
  <UTooltip :content="{ side: placement }">
    <template #content>
      <div class="k-hint-content">
        <slot></slot>
      </div>
    </template>
    <span class="k-hint" :class="{ active: modelValue, pointer }" @click="onClick">
      <k-icon :name="name" />
    </span>
  </UTooltip>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

// `placement` used to carry an Element Plus placement, which allowed the
// twelve `-start` / `-end` variants. Nuxt UI forwards a reka-ui side, which
// has four values and takes alignment separately, so the prop is narrowed
// here rather than silently dropping a variant at runtime.
const props = withDefaults(
  defineProps<{
    placement?: 'top' | 'right' | 'bottom' | 'left'
    modelValue?: unknown
    name?: string
  }>(),
  {
    name: 'question-empty',
  },
)

const emit = defineEmits(['update:modelValue'])

const pointer = computed(() => props.modelValue !== undefined)

function onClick() {
  if (!pointer.value) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<style lang="scss">
.k-hint {
  opacity: 0.5;
  color: var(--k-text-normal);
  margin-left: 0.25rem;
  transition: 0.3s ease;
  vertical-align: -2px;

  &:hover,
  &.active {
    opacity: 1;
  }
}

.k-hint.pointer {
  cursor: pointer;
}

.k-hint-content {
  line-height: 1.5;
  max-width: 20rem;
}
</style>
