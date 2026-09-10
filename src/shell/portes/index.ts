import type { Context } from '@cordisjs/client'
import Portes from './PortesPage.vue'

export default function (ctx: Context) {
  ctx.client.router.page({
    id: 'portes',
    path: '/portes',
    name: 'Portes',
    icon: 'activity:home',
    order: 900,
    component: Portes,
  })
}
