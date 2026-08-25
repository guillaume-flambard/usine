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
import { describe, expect, it, afterEach } from 'vitest'
import { render } from 'vitest-browser-vue'
import FactoryApp from '../FactoryApp.vue'
import { createPilot } from '../../orchestration/pilot'
import { liveBehaviours } from '../../orchestration/factory'
import { createFrameHost } from '../../app/frame-host'
import { createSession } from '../../app/session'
import { behaviourKey } from '../../app/behaviour'
import type { Behaviour } from '../../app/behaviour'
import type { RunArchive } from '../../app/replay'
import type { RunEvent } from '../../runtime/events'
import type { ComponentId } from '../../runtime/contract'
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

// Les cadres de ForkView ont une origine opaque (`sandbox="allow-scripts"`) :
// impossible de lire leur contenu par-dessus. Pour prouver que les panneaux
// rendent **vraiment** une application (l'écran monté, le comportement qui
// répond), on rejoue exactement le même pont — `createFrameHost` avec les
// données du fork — dans un cadre **same-origin** lisible, comme frame.browser.
const APP_SCREEN =
  '<h1>Compteur</h1>' +
  '<textarea data-field="texte"></textarea>' +
  '<button data-invoke="compter">Compter</button>' +
  '<div data-output="compter"></div>'

function withScreenArchive(): RunArchive {
  const M = 'master#0' as ComponentId
  const ev = (make: (s: number) => Omit<RunEvent, 'sequence' | 'at'>, i: number): RunEvent =>
    ({ ...make(i + 1), sequence: i + 1, at: i }) as RunEvent
  const factories: ((s: number) => Omit<RunEvent, 'sequence' | 'at'>)[] = [
    () => ({
      type: 'component-created',
      id: 'compter#1' as ComponentId,
      name: 'compter-v1',
      display: { role: 'compte' },
      needs: [],
      provides: [behaviourKey('compter')],
      parent: M,
    }),
    () => ({
      type: 'component-built',
      id: 'compter#1' as ComponentId,
      parent: M,
      build: { specification: 'compter', source: "(t) => String(t).length + ' car.'", route: 'evaluation' },
    }),
    () => ({ type: 'component-activated', id: 'compter#1' as ComponentId }),
    () => ({ type: 'screen-posted', id: M, markup: APP_SCREEN, revision: 1 }),
  ]
  return { version: 1, brief: 'un run avec écran', events: factories.map(ev) }
}

/** Monte un cadre same-origin et y pousse des comportements + un écran. */
async function renderInto(behaviours: readonly Behaviour[], screen: { markup: string; revision: number }) {
  const frame = document.createElement('iframe')
  frame.src = '/sandbox.html'
  frame.style.cssText = 'width:600px;height:300px'
  document.body.appendChild(frame)
  const host = createFrameHost({
    frame,
    behaviours: () => behaviours,
    screen: () => screen,
    session: createSession(),
  })
  await wait(600)
  const inner = frame.contentDocument
  if (inner === null) throw new Error('cadre inaccessible')
  return { frame, host, inner }
}

describe('les panneaux du fork rendent une vraie application', () => {
  let cleanup: (() => void)[] = []
  afterEach(async () => {
    for (const c of cleanup) c()
    cleanup = []
  })

  it('le tronc monte son écran à N et son comportement répond ; la branche diverge', async () => {
    const pilot = createPilot()
    const fork = await pilot.fork(withScreenArchive(), 4)
    cleanup.push(() => void fork.branch.kernel.releaseAll())

    // — Tronc : l'écran à N est monté, le comportement recompilé répond. —
    const trunk = await renderInto(fork.trunk.behaviours, fork.trunk.screen)
    cleanup.push(() => {
      trunk.host.dispose()
      trunk.frame.remove()
    })
    expect(trunk.inner.querySelector('h1')?.textContent).toBe('Compteur')
    const trunkButton = trunk.inner.querySelector<HTMLButtonElement>('[data-invoke]')
    expect(trunkButton?.disabled).toBe(false) // le comportement du tronc sert
    const field = trunk.inner.querySelector<HTMLTextAreaElement>('[data-field]')
    if (field === null) throw new Error('pas de champ')
    field.value = 'abcd'
    trunkButton?.click()
    await wait(200)
    expect(trunk.inner.querySelector('[data-output="compter"]')?.textContent).toBe('4 car.')

    // — Branche : on fait diverger le comportement, puis on le rend. —
    expect(await fork.branch.replace('compter', "(t) => 'divergé: ' + t")).toBe(true)
    const branch = await renderInto(liveBehaviours(fork.branch.kernel), fork.branch.screen)
    cleanup.push(() => {
      branch.host.dispose()
      branch.frame.remove()
    })
    const branchField = branch.inner.querySelector<HTMLTextAreaElement>('[data-field]')
    if (branchField === null) throw new Error('pas de champ (branche)')
    branchField.value = 'x'
    branch.inner.querySelector<HTMLButtonElement>('[data-invoke]')?.click()
    await wait(200)
    // La branche répond avec le code divergé ; le tronc, lui, disait « N car. ».
    expect(branch.inner.querySelector('[data-output="compter"]')?.textContent).toBe('divergé: x')
  }, 25_000)
})
