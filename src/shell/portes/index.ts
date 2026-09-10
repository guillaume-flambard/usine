import type { Context } from '@cordisjs/client'
import Portes from './PortesPage.vue'

export default function (ctx: Context) {
  ctx.client.router.page({
    id: 'portes',
    path: '/',
    name: 'Portes',
    icon: 'activity:home',
    order: 1000,
    component: Portes,
  })
}
