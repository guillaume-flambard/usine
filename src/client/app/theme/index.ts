import { Context } from '@cordisjs/client'
import App from './index.vue'

// Ce qui reste du thème amont : la racine, et rien d'autre.
//
// Il déclarait aussi le menu contextuel de la barre d'activités (« réinitialiser
// la barre »). La barre n'existe plus, donc le menu ne pouvait plus s'ouvrir sur
// rien, et son action réécrivait un réglage que plus personne ne lit.
export default function (ctx: Context) {
  ctx.client.router.slot({
    type: 'root',
    component: App,
    order: -1000,
  })
}
