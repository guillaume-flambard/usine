// Le fichier qu'on emporte.
//
// Ce qu'il doit être : autonome, et pas plus dangereux que le produit dont il
// sort. Un fichier qui exécuterait le code d'un modèle dans sa propre page
// serait un cadeau empoisonné pour celui qui l'ouvre.
import { describe, expect, it } from 'vitest'
import { takeawayHtml, takeawayOf } from '../takeaway'
import type { Behaviour } from '../behaviour'

const behaviour = (name: string, version = 1): Behaviour => ({
  name,
  version,
  call: async () => ({ output: '' }),
})

const SCREEN = '<button data-invoke="compter">Compter</button><div data-output="compter"></div>'

describe('ce qu’on emporte', () => {
  it('ne retient que les comportements dont on a le code', () => {
    const made = takeawayOf('un besoin', SCREEN, [behaviour('compter'), behaviour('perdu')], (n) =>
      n === 'compter' ? '(x) => x.length' : undefined,
    )

    expect(made?.behaviours.map((b) => b.name)).toEqual(['compter'])
  })

  it('refuse de produire un fichier vide', () => {
    // Livrer un fichier qui ne fait rien serait pire que ne rien proposer.
    expect(takeawayOf('un besoin', '', [behaviour('a')], () => '(x) => x')).toBeUndefined()
    expect(takeawayOf('un besoin', SCREEN, [], () => '(x) => x')).toBeUndefined()
    expect(takeawayOf('un besoin', SCREEN, [behaviour('a')], () => undefined)).toBeUndefined()
  })
})

describe('le fichier autonome', () => {
  const html = () =>
    takeawayHtml({
      brief: 'un besoin <script>alert(1)</script>',
      screen: SCREEN,
      behaviours: [{ name: 'compter', version: 2, code: '(x) => x.length' }],
    })

  it('ne dépend de rien : ni script externe, ni feuille de style, ni police', () => {
    const page = html()

    expect(page).not.toMatch(/<script[^>]+src=/)
    expect(page).not.toMatch(/<link[^>]+href=/)
    expect(page).not.toContain('http://')
    // Seule exception admise : rien. Un fichier qui joint le réseau n'est pas
    // autonome, et c'est le seul mot qui compte ici.
    expect(page).not.toContain('https://')
  })

  it('exécute les comportements dans un worker, pas dans le document', () => {
    const page = html()

    expect(page).toContain('new Worker(')
    // Et il peut arrêter une boucle infinie, comme le produit.
    expect(page).toContain('terminate()')
  })

  it('échappe le brief plutôt que de le rendre exécutable', () => {
    const page = html()

    // Le brief vient du visiteur ; le rendre tel quel ferait de son propre
    // texte un vecteur d'exécution dans le fichier qu'il emporte.
    expect(page).not.toContain('<script>alert(1)</script>')
    expect(page).toContain('&lt;script&gt;')
  })

  it('ne laisse pas un code refermer la balise qui le porte', () => {
    // `JSON.stringify` seul ne protège pas de `</script>` : la balise se
    // fermerait et le reste du code sortirait dans le document.
    const page = takeawayHtml({
      brief: 'x',
      screen: SCREEN,
      behaviours: [{ name: 'a', version: 1, code: '(x) => "</script><img onerror=alert(1)>"' }],
    })

    expect(page).not.toContain('</script><img')
    expect(page).toContain('\\u003c/script')
  })

  it('porte l’écran et le code, sans quoi il n’y aurait rien à ouvrir', () => {
    const page = html()

    expect(page).toContain('data-invoke')
    expect(page).toContain('x.length')
  })
})

describe('les listes blanches', () => {
  it('sont celles du produit, jamais une copie', async () => {
    const { TAGS, ATTRIBUTES, WIRING } = await import('../sanitize')
    const page = takeawayHtml({
      brief: 'x',
      screen: SCREEN,
      behaviours: [{ name: 'a', version: 1, code: '(x) => x' }],
    })

    // Sérialisées depuis leur unique définition : une seconde liste écrite à
    // la main finirait par diverger, et le fichier emporté n'afficherait plus
    // ce que le produit affichait.
    for (const tag of TAGS) expect(page).toContain(`"${tag}"`)
    for (const attribute of [...ATTRIBUTES, ...WIRING]) expect(page).toContain(`"${attribute}"`)
  })
})

// L'iframe et le fichier emporté ont une origine opaque : ils ne peuvent pas
// consommer le CSS du produit et gardent chacun leur copie des jetons. Elles
// divergeaient — `--muted` valait deux valeurs différentes — et rien ne le
// signalait. La troisième copie, `tokens.css`, n'existe plus : la refonte l'a
// supprimée au profit de la bibliothèque.
describe('les deux copies de jetons, celles qu’aucune feuille ne peut atteindre', () => {
  const tokensOf = (source: string): Record<string, string> =>
    Object.fromEntries(
      [...source.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{3,8})/gi)].map(([, name, value]) => [
        name,
        value.toLowerCase(),
      ]),
    )

  it('déclare les mêmes jetons, aux mêmes valeurs', async () => {
    // `sandbox.html` est à la racine du dépôt ; le fichier emporté est produit.
    const { readFileSync } = await import('node:fs')
    const inSandbox = tokensOf(
      readFileSync(new URL('../../../sandbox.html', import.meta.url), 'utf8'),
    )
    const made = takeawayOf('un besoin', SCREEN, [behaviour('compter')], () => 'x => x')
    expect(made, "le fichier emporté n'a pas été produit").toBeDefined()
    const inTakeaway = tokensOf(takeawayHtml(made!))

    // Sans ces deux gardes, un fichier illisible ferait passer le test à vide.
    expect(Object.keys(inTakeaway).length).toBeGreaterThan(0)
    expect(Object.keys(inSandbox).length).toBe(Object.keys(inTakeaway).length)
    expect(inTakeaway).toEqual(inSandbox)
  })
})
