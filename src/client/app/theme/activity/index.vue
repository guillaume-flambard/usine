<template>
  <nav
    class="layout-activity flex flex-col justify-evenly"
    @contextmenu.stop="trigger($event, undefined)"
  >
    <template v-for="(data, index) in groups.top" :key="data[0].id">
      <activity-separator position="top" :index="index" />
      <activity-item placement="right" :children="data"></activity-item>
    </template>
    <activity-separator position="top" :index="groups.top.length" />
    <!-- `hidden` vaut désormais toujours un tableau, jamais `undefined` :
         c'est la longueur qui décide, pas l'existence. Un tableau vide est
         truthy, et rendait ici un élément sans le moindre enfant. -->
    <activity-item
      v-if="groups.hidden.length > 0"
      placement="bottom"
      :children="groups.hidden"
    ></activity-item>
    <div v-else class="spacer"></div>
    <activity-separator position="bottom" :index="groups.top.length" />
    <template v-for="(data, index) in groups.bottom" :key="data[0].id">
      <activity-item placement="right" :children="data"></activity-item>
      <activity-separator position="bottom" :index="index" />
    </template>
  </nav>
</template>

<script lang="ts" setup>
import { computed, provide } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { Activity, useConfig, useContext, useMenu } from '@cordisjs/client'
import ActivityItem from './item.vue'
import ActivitySeparator from './separator.vue'

const ctx = useContext()
const config = useConfig()
const trigger = useMenu('theme.activity')
const { height } = useWindowSize()

/** `Activity.order` est optionnel : une activité sans rang se range à zéro. */
const orderOf = (activity: Activity): number => activity.order ?? 0

const groups = computed(() => {
  // Assigné dès la déclaration : la branche qui le remplit est conditionnelle,
  // et le `return` le lit toujours.
  let hidden: Activity[] = []
  const root = getComputedStyle(document.documentElement)
  const navWidth = parseFloat(root.getPropertyValue('--nav-width'))
  const iconMargin = parseFloat(root.getPropertyValue('--nav-icon-margin'))
  const unit = navWidth - iconMargin
  const total = height.value - iconMargin
  const available = Object.fromEntries(
    Object.entries(ctx.client.router.pages)
      .filter(([, data]) => !data.disabled())
      .map(([key, data]) => [key, [data]]),
  )
  for (const id of Object.keys(available)) {
    const override = config.value.activities?.[id]
    if (!override) continue
    if (override.hidden) {
      delete available[id]
      continue
    }
    Object.assign(available[id][0], override)
    const parent = override.parent === undefined ? undefined : available[override.parent]
    if (parent) {
      parent.push(available[id][0])
      delete available[id]
    }
  }
  const list = Object.values(available).sort(([a], [b]) => orderOf(a) - orderOf(b))
  if (list.length * unit > total) {
    hidden = list
      .splice(0, list.length + 1 - Math.floor(total / unit))
      .sort(([a], [b]) => {
        const scale = a.position === 'top' ? -1 : 1
        if (a.position === b.position) {
          return scale * (orderOf(a) - orderOf(b))
        }
        return scale
      })
      .flat()
    hidden.unshift({ icon: 'activity:ellipsis' } as Activity)
  }
  const top = list.filter(([data]) => data.position !== 'bottom').reverse()
  const bottom = list.filter(([data]) => data.position === 'bottom')
  return { top, bottom, hidden }
})

provide('groups', groups)
</script>

<style lang="scss" scoped>
.marker {
  position: absolute;
}

.layout-activity {
  position: fixed;
  box-sizing: border-box;
  z-index: 100;
  top: 0;
  bottom: 0;
  width: var(--nav-width);
  background-color: var(--k-activity-bg);
  border-right: var(--k-activity-divider, var(--k-color-divider-dark)) 1px solid;
  transition: var(--color-transition);

  .spacer {
    flex: 1 0 auto;
  }
}
</style>
