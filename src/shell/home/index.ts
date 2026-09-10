import type { Context } from '@cordisjs/client'
import Home from './HomePage.vue'

export default function (ctx: Context) {
  ctx.client.router.page({
    id: 'home',
    path: '/',
    name: 'Accueil',
    icon: 'activity:home',
    order: 1000,
    component: Home,
  })
}
