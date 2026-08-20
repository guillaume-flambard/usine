// Les promesses d'interface ne se vérifient que dans un vrai navigateur :
// la page qui ne défile pas, le clavier, la couleur qui ne porte jamais
// seule l'information. Ce fichier ferme le trou consigné depuis l'epic 1.
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import AppUsine from '../AppUsine.vue'
import '../../assets/usine.css'
import '../../assets/app.css'

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function monter() {
  const ecran = render(AppUsine)
  await attendre(60)
  return ecran
}

const lancer = async () => {
  document.querySelector<HTMLButtonElement>('.pane .bouton')?.click()
  await attendre(500)
}

describe('la coquille dans un navigateur', () => {
  it('ne fait jamais défiler la page', async () => {
    await monter()
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
      document.documentElement.clientHeight + 1,
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    )
  })

  it('occupe toute la hauteur, sans page éditoriale', async () => {
    await monter()
    const app = document.querySelector('.app')
    expect(app).not.toBeNull()
    expect(app?.getBoundingClientRect().height ?? 0).toBeGreaterThan(window.innerHeight * 0.9)
    // La page éditoriale d'origine avait un hero ; l'application n'en a pas.
    expect(document.querySelector('.hero')).toBeNull()
  })

  it('atteint le parcours critique au clavier', async () => {
    await monter()
    const brief = document.querySelector<HTMLTextAreaElement>('#brief')
    const bouton = document.querySelector<HTMLButtonElement>('.pane .bouton')
    expect(brief).not.toBeNull()
    expect(bouton).not.toBeNull()

    brief?.focus()
    expect(document.activeElement).toBe(brief)
    bouton?.focus()
    expect(document.activeElement).toBe(bouton)
  })

  it('rend les nœuds focalisables et nommés', async () => {
    await monter()
    await lancer()

    const noeuds = [...document.querySelectorAll<SVGGElement>('.noeud')]
    expect(noeuds.length).toBeGreaterThan(5)
    for (const noeud of noeuds) {
      expect(noeud.getAttribute('tabindex')).toBe('0')
      // Un nœud sans nom accessible n'existe pas pour un lecteur d'écran.
      expect((noeud.getAttribute('aria-label') ?? '').length).toBeGreaterThan(5)
    }
  })

  it('ne confie jamais un état à la seule couleur', async () => {
    await monter()
    await lancer()

    const noeuds = [...document.querySelectorAll<SVGGElement>('.noeud')]
    expect(noeuds.length).toBeGreaterThan(5)
    for (const noeud of noeuds) {
      const etat = noeud.getAttribute('data-etat') ?? '?'
      const cadre = noeud.querySelector('.noeud-cadre')
      const style = cadre === null ? undefined : getComputedStyle(cadre)
      const marque = noeud.querySelector('.noeud-marque')
      const signalDeForme =
        marque !== null ||
        (style?.strokeDasharray ?? 'none') !== 'none' ||
        Number.parseFloat(style?.strokeWidth ?? '1') !== 1
      expect(signalDeForme, `l'état « ${etat} » n'a aucun signal de forme`).toBe(true)
    }
  })

  it('fait défiler le graphe dans son conteneur, jamais la page', async () => {
    await monter()
    await lancer()

    const canvas = document.querySelector<HTMLElement>('.canvas')
    expect(canvas).not.toBeNull()
    expect(getComputedStyle(canvas as HTMLElement).overflow).not.toBe('visible')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    )
  })

  it('donne au graphe un nom et une description lisibles sans le voir', async () => {
    await monter()
    await lancer()

    const svg = document.querySelector('svg[role="group"]')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-label')).toBeTruthy()
    const desc = document.querySelector('desc')
    expect((desc?.textContent ?? '').length).toBeGreaterThan(30)
  })
})

describe('le mouvement réduit', () => {
  it("neutralise l'apparition sans perdre d'information", async () => {
    await monter()
    await lancer()

    // La règle doit exister dans la feuille chargée : sans elle, la
    // préférence système ne changerait rien.
    const regles = [...document.styleSheets].flatMap((feuille) => {
      try {
        return [...feuille.cssRules]
      } catch {
        return []
      }
    })
    const bloc = regles.find(
      (regle): regle is CSSMediaRule =>
        regle instanceof CSSMediaRule && regle.conditionText.includes('prefers-reduced-motion'),
    )
    expect(bloc, 'aucune règle de mouvement réduit dans la feuille chargée').toBeDefined()

    // Et les nœuds restent là, avec leur état : le mouvement disparaît, pas
    // l'information.
    const noeuds = [...document.querySelectorAll('.noeud')]
    expect(noeuds.length).toBeGreaterThan(5)
    for (const noeud of noeuds) {
      expect(noeud.getAttribute('data-etat')).toBeTruthy()
      expect((noeud as HTMLElement).getBoundingClientRect().width).toBeGreaterThan(0)
    }
  })
})

describe('le produit livré, de bout en bout dans un navigateur', () => {
  it('classe un texte tapé par un humain après la porte', async () => {
    await monter()
    await lancer()

    // La porte arrête le run : c'est elle qui rend l'approbation nécessaire.
    const boutons = [...document.querySelectorAll<HTMLButtonElement>('.porte-actions .bouton')]
    expect(boutons).toHaveLength(2)
    boutons[1]?.click()
    await attendre(500)

    const champ = document.querySelector<HTMLTextAreaElement>('#copie')
    expect(champ, 'le produit livré ne s’est pas affiché').not.toBeNull()
    if (champ === null) return
    champ.value = 'Ce complément guérit les carences. Il contribue à réduire la fatigue.'
    champ.dispatchEvent(new Event('input', { bubbles: true }))
    await attendre(60)

    document.querySelector<HTMLButtonElement>('.produit .bouton')?.click()
    await attendre(120)

    const verdicts = [...document.querySelectorAll('.verdicts li')]
    expect(verdicts).toHaveLength(2)
    expect(verdicts[0]?.getAttribute('data-statut')).toBe('interdit')
    expect(verdicts[0]?.textContent ?? '').toContain('1924/2006')
    expect(verdicts[1]?.getAttribute('data-statut')).toBe('autorise')
  })
})
