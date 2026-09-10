import type { Context } from '@cordisjs/client'
import Usine from './UsinePage.vue'

export default function (ctx: Context) {
  // Une seule page, à la racine. Il n'y a plus de barre d'activités pour en
  // proposer une autre : deux entrées qui portaient la même icône ne disaient
  // pas où elles menaient, et l'une des deux menait aux réglages d'un autre
  // produit.
  ctx.client.router.page({
    id: 'usine',
    path: '/',
    name: "L'usine",
    component: Usine,
  })
}
