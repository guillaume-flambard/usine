<template>
  <schema-base>
    <template #title><slot name="title"></slot></template>
    <template #desc><slot name="desc"></slot></template>
    <template #menu><slot name="menu"></slot></template>
    <template #prefix><slot name="prefix"></slot></template>
    <template #suffix><slot name="suffix"></slot></template>
    <template #control>
      <!-- Element Plus built the option list from child components; Nuxt UI
           takes a flat `items` array and renders each one through `#item`.
           The preview swatch is unchanged, it just moved into the slot. -->
      <USelect
        v-model="model"
        :items="themes"
        :ui="{ content: 'theme-select', item: 'p-0' }"
      >
        <template #item="{ item }">
          <div
            class="theme-root"
            :class="item.value.endsWith('-dark') ? 'dark' : 'light'"
            :theme="item.value"
          >
            <div class="theme-block-1"></div>
            <div class="theme-block-2"></div>
            <div class="theme-block-3"></div>
            <div class="theme-title">{{ item.label }}</div>
          </div>
        </template>
      </USelect>
    </template>
  </schema-base>
</template>

<script setup lang="ts">

import { computed } from 'vue'
import type { PropType } from 'vue'
import { useContext, useI18nText } from '@cordisjs/client'
import { Schema, SchemaBase } from '@cordisjs/components'

const props = defineProps({
  schema: {} as PropType<Schema>,
  modelValue: {} as PropType<any[]>,
  disabled: {} as PropType<boolean>,
  prefix: {} as PropType<string>,
  initial: {} as PropType<{}>,
})

const emit = defineEmits(['update:modelValue'])

const ctx = useContext()

const tt = useI18nText()

const config = SchemaBase.useModel()

const themes = computed(() => Object.keys(ctx.client.theme._themes)
  .filter((key) => key.endsWith('-' + props.schema?.meta.extra.mode))
  .map((key) => ({ value: key, label: tt(ctx.client.theme._themes[key].name) })))

// Upstream read the theme's display NAME here while writing its KEY, which
// left the control unable to match its own value against the option list.
// Nuxt UI binds the model to `valueKey`, so both ends now carry the key and
// the label comes from the item.
const model = computed({
  get() {
    return config.value
  },
  set(value) {
    emit('update:modelValue', value)
  },
})

</script>

<style lang="scss">

.theme-select {
  overflow: hidden;

  .theme-root {
    width: 100%;
    height: 100%;
    position: relative;

    .theme-block-1 {
      position: absolute;
      width: 33%;
      height: 100%;
      background-color: var(--bg1);
    }

    .theme-block-2 {
      position: absolute;
      left: 33%;
      width: 34%;
      height: 100%;
      background-color: var(--bg2);
    }

    .theme-block-3 {
      position: absolute;
      left: 67%;
      width: 33%;
      height: 100%;
      background-color: var(--bg3);
    }

    .theme-title {
      position: absolute;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      font-size: 1em;
      z-index: 100;
      font-family: var(--font-family);
      color: var(--k-color-primary);
    }
  }
}

</style>
