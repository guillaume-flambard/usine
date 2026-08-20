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
  if (params.get('approuver') !== null) {
    document.querySelector<HTMLButtonElement>('.porte-actions .bouton:last-child')?.click()
    await attendre(300)
  }
  if (params.get('ecarter') !== null) {
    document.querySelector<HTMLButtonElement>('.porte-actions .bouton:first-child')?.click()
    await attendre(300)
  }
  if (params.get('payoff') !== null) {
    const champ = document.querySelector<HTMLTextAreaElement>('#copie')
    if (champ) {
      champ.value =
        'Notre complément guérit les carences chroniques. ' +
        'Il contribue au maintien d\'une ossature normale. ' +
        'Il ne guérit absolument pas les rhumes. ' +
        'Fabriqué soigneusement en France. ' +
        'Il détoxifie l\'organisme.'
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      await attendre(60)
      const boutons = [...document.querySelectorAll<HTMLButtonElement>('.produit .bouton')]
      boutons[0]?.click()
      await attendre(200)
    }
  }
  if (params.get('choisir') !== null) {
    const cible = params.get('choisir') ?? ''
    const noeuds = [...document.querySelectorAll<SVGGElement>('.noeud')]
    const choisi =
      noeuds.find((n) => (n.getAttribute('aria-label') ?? '').includes(cible)) ??
      noeuds[Math.min(4, noeuds.length - 1)]
    choisi?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  document.title = `pret-${document.querySelectorAll('.noeud').length}`
})()
