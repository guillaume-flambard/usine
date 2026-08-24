// Le panneau à deux futurs, dans un vrai navigateur (story 6b).
//
// Ce que la suite node ne peut pas montrer : la scène qui se dédouble en deux
// panneaux dans la zone scène, la divergence par édition d'un comportement, le
// bandeau qui mesure l'écart, et le teardown au rejet — tout à travers la vraie
// page, avec de vrais cadres sablés et de vrais fils isolés.
//
// Les deux cadres ont une origine opaque (`sandbox="allow-scripts"`) : la page
// hôte ne peut pas lire leur contenu. La divergence s'observe donc là où elle
// est honnête — le bandeau de comparaison, payé par `measureRun` — pas en
// fouillant dans les iframes.
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import FactoryApp from '../FactoryApp.vue'
import '../../assets/tokens.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function mount() {
  const screen = render(FactoryApp)
  await wait(60)
  return screen
}

// Le run naît au rythme du modèle rejoué : on attend ce rythme, on ne le devine
// pas. Repris tel quel de la suite du shell.
const startRun = async () => {
  const brief = document.querySelector<HTMLTextAreaElement>('#brief')
  if (brief !== null && brief.value.length === 0) {
    document.querySelector<HTMLButtonElement>('.picker')?.click()
    await wait(120)
  }
  document.querySelector<HTMLButtonElement>('.composer .button')?.click()
  await wait(9000)
}

/** Entre en fork depuis un run qui sert, et attend les deux panneaux. */
async function enterFork() {
  await mount()
  await startRun()
  const start = document.querySelector<HTMLButtonElement>('.fork-start')
  expect(start, 'le bouton « Forker ce run » est absent').not.toBeNull()
  start?.click()
  // Le fork recompile les comportements du tronc et hydrate un kernel de
  // branche dans de vrais fils isolés : on lui laisse le temps.
  await wait(2500)
}

/** La cellule d'une ligne du bandeau : [tronc, branche, écart]. */
function compareRow(key: string): [string, string, string] | undefined {
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('.fork-table tbody tr')]
  const row = rows.find((r) => r.querySelector('th')?.textContent?.trim() === key)
  if (row === undefined) return undefined
  const cells = [...row.querySelectorAll('td')].map((c) => c.textContent?.trim() ?? '')
  return [cells[0] ?? '', cells[1] ?? '', cells[2] ?? '']
}

describe('le panneau à deux futurs', () => {
  it('montre deux panneaux — tronc (enregistrement) et branche (exécution) — dans la zone scène', async () => {
    await enterFork()

    const fork = document.querySelector('.fork')
    expect(fork, 'la vue fork n’est pas apparue').not.toBeNull()

    // La scène normale a cédé la place : plus une cinquième zone, la même zone.
    expect(document.querySelector('.zone')).toBeNull()

    const panels = [...document.querySelectorAll('.fork-panel')]
    expect(panels).toHaveLength(2)

    const trunk = document.querySelector('.fork-panel[data-side="trunk"]')
    const branch = document.querySelector('.fork-panel[data-side="branch"]')
    expect(trunk?.textContent ?? '').toContain('Tronc')
    expect(trunk?.textContent ?? '').toContain('enregistrement')
    expect(branch?.textContent ?? '').toContain('Branche')
    expect(branch?.textContent ?? '').toContain('exécution neuve')

    // L'honnêteté du périmètre est dite, pas cachée (AD-41).
    expect(document.querySelector('.fork')?.textContent ?? '').toContain('intra-runtime')

    // Chaque panneau rend une application dans un cadre sablé, inatteignable.
    const frames = [...document.querySelectorAll<HTMLIFrameElement>('.fork-frame')]
    expect(frames).toHaveLength(2)
    for (const frame of frames) {
      expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
      expect(frame.contentDocument).toBeNull()
    }

    // Le tronc est en lecture seule : aucun contrôle d'édition de son côté.
    expect(trunk?.querySelector('.fork-edit')).toBeNull()
    // La branche est vivante : elle porte l'éditeur de comportement.
    expect(branch?.querySelector('.fork-edit')).not.toBeNull()
  })

  it('fait diverger la branche par édition — le tronc ne bouge pas — et le bandeau montre l’écart', async () => {
    await enterFork()

    const before = compareRow('Remplacements')
    expect(before, 'la ligne « Remplacements » manque au bandeau').toBeDefined()
    if (before === undefined) return
    const [trunkBefore, branchBefore] = before
    // La branche part sans remplacement propre : son flux ne porte encore que
    // le `branch-forked` (AD-38/44).
    expect(branchBefore).toBe('0')

    // Éditer un comportement de la branche : un code valide, puis valider.
    const code = document.querySelector<HTMLTextAreaElement>('.fork-code')
    expect(code, 'l’éditeur de comportement manque').not.toBeNull()
    if (code === null) return
    code.value = "(input) => 'diverged: ' + input"
    code.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(30)
    document.querySelector<HTMLButtonElement>('.fork-apply')?.click()
    // Le remplacement compile dans un fil isolé, puis le kernel de branche
    // rejoue le hot-swap : on attend le va-et-vient.
    await wait(1200)

    const after = compareRow('Remplacements')
    expect(after).toBeDefined()
    if (after === undefined) return
    const [trunkAfter, branchAfter, deltaAfter] = after

    // La branche a divergé : son compteur de remplacements a monté d'un cran.
    expect(Number(branchAfter)).toBe(Number(branchBefore) + 1)
    // Le tronc n'a pas bougé : c'est un recording (AD-37).
    expect(trunkAfter).toBe(trunkBefore)
    // Et l'écart est mesuré, jamais affirmé (AD-40) : branche − tronc.
    expect(deltaAfter).toBe(
      Number(branchAfter) - Number(trunkAfter) >= 0
        ? `+${Number(branchAfter) - Number(trunkAfter)}`
        : `${Number(branchAfter) - Number(trunkAfter)}`,
    )
  })

  it('rejette la branche — teardown — et rend la scène normale du run', async () => {
    await enterFork()
    expect(document.querySelector('.fork')).not.toBeNull()

    const reject = [...document.querySelectorAll<HTMLButtonElement>('.fork-gate .button')].find(
      (b) => (b.textContent ?? '').includes('Rejeter'),
    )
    expect(reject, 'le bouton « Rejeter la branche » manque').toBeDefined()
    reject?.click()
    await wait(400)

    // La vue fork est défaite, et le run reprend sa scène : l'application
    // normale ressert, intacte.
    expect(document.querySelector('.fork')).toBeNull()
    expect(document.querySelector('.zone')).not.toBeNull()
    expect(document.querySelector('.live-frame')).not.toBeNull()
  })

  it('revient au run en gardant la branche, sans casser la scène normale', async () => {
    await enterFork()

    const exit = [...document.querySelectorAll<HTMLButtonElement>('.fork-gate .button')].find((b) =>
      (b.textContent ?? '').includes('revenir au run'),
    )
    expect(exit, 'le bouton « revenir au run » manque').toBeDefined()
    exit?.click()
    await wait(200)

    expect(document.querySelector('.fork')).toBeNull()
    expect(document.querySelector('.live-frame')).not.toBeNull()
  })
})
