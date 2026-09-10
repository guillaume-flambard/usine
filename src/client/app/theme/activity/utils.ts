import { Activity } from '@cordisjs/client'
import type { Dict } from '@cordisjs/client'

// Both members are optional here, where upstream wrote them required.
// Upstream compiles `client/` and `app/` as two separate TypeScript projects,
// so this augmentation is invisible from `client/` and its own code passes
// `{}` freely (`ActionService.scope`, `createScope`). Vendored into one
// project the augmentation becomes visible, and required members would reject
// that code. Optional is also what the runtime says: an action scope opened
// outside the activity bar genuinely has no activity, and a fresh config has
// no overrides.
declare module '@cordisjs/client' {
  interface ActionContext {
    'theme.activity'?: Activity
  }

  interface Config {
    activities?: Dict<ActivityOverride>
  }
}

interface ActivityOverride {
  hidden?: boolean
  parent?: string
  order?: number
  position?: 'top' | 'bottom'
}
