import type { Context } from '@cordisjs/client'
import Reasoning from './ReasoningStatus.vue'

export default function (ctx: Context) {
  // Registered where upstream registered its loading spinner, and it replaces
  // it: the shell has nothing to load (every view is local and already
  // imported), so a spinner there could only mean something untrue. What can
  // be true is a model working, and that is what shows.
  ctx.client.router.slot({
    type: 'status-right',
    component: Reasoning,
  })
}
