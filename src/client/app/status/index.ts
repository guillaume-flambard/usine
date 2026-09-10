import type { Context } from '@cordisjs/client'
import Status from './status.vue'

// `loading.vue` is gone. It showed a progress bar and "connection lost", both
// waiting on a server this product does not have, so neither could ever say
// something true. The status bar's right side now carries the reasoning trace
// (`app/run`), which is paid for by real run events.

export default function (ctx: Context) {
  ctx.client.router.slot({
    type: 'status',
    component: Status,
    order: -1000,
  })
}
