// Banc d'aperçu : monte l'application réelle et déclenche un run pour
// pouvoir la capturer sans interaction humaine. Hors application.
import { createApp } from 'vue'
import '../../src/assets/usine.css'
import '../../src/assets/app.css'
import AppUsine from '../../src/ui/AppUsine.vue'

createApp(AppUsine).mount('#app')

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

const params = new URLSearchParams(location.search)
void (async () => {
  await attendre(60)
  document.querySelector<HTMLButtonElement>('.bouton')?.click()
  await attendre(400)
  if (params.get('choisir') !== null) {
    const noeuds = document.querySelectorAll<SVGGElement>('.noeud')
    noeuds[Math.min(4, noeuds.length - 1)]?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
  }
  document.title = `pret-${document.querySelectorAll('.noeud').length}`
})()
