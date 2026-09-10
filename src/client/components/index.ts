import type { App } from 'vue'
import components from '@cordisjs/components'

import common from './common'
import * as icons from './icons'
import layout from './layout'
import link from './link'
import slot from './slot'

// Upstream registers Element Plus here and re-exports its imperative helpers
// (`ElLoading.service`, `ElMessage`, `ElMessageBox`). Nothing in the vendored
// shell calls them: they exist for downstream plugins. They are dropped rather
// than shimmed, so that the first caller has to choose a Nuxt UI equivalent
// deliberately (`useToast`, `UModal`) instead of inheriting a second component
// library through a compatibility layer.
//
// Base components come from Nuxt UI and are registered globally by its Vite
// plugin, so templates use `UButton`, `UTooltip`, `UScrollArea` and friends
// with no registration here.

export * from './common'
export * from './layout'
export * from './link'
export * from './slot'

export * from '@cordisjs/components'

export { icons }

export default function (app: App) {
  app.use(common)
  app.use(components)
  app.use(icons)
  app.use(layout)
  app.use(link)
  app.use(slot)
}
