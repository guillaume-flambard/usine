import type { Context } from '@cordisjs/client'
import Flotte from './FlottePage.vue'

export default function (ctx: Context) {
  ctx.client.router.page({
    id: 'flotte',
    path: '/',
    name: 'Mes agents',
    icon: 'activity:home',
    order: 1000,
    component: Flotte,
  })
}
