// Rejouer un run, dans un vrai navigateur.
//
// La promesse tenue ici est la plus forte du produit après le remplacement à
// chaud : un run part en archive, revient, et **son application sert encore**.
// Sans ça, un lien partagé montrerait un graphe mort.
import { describe, expect, it, vi } from 'vitest'
import { createPilot } from '../orchestration/pilot'
import { scriptedModel } from '../agents/__tests__/scripted-model'
import { readArchive, ARCHIVE_VERSION } from './replay'
import type { Reasoner } from '../runtime/reasoner'

const BRIEF = 'Un outil qui repère les allégations thérapeutiques interdites.'
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function recordedRun() {
  const pilot = createPilot({ stepMs: 20, settleTimeoutMs: 6000 })
  pilot.connect(scriptedModel())
  await pilot.start(BRIEF)

  // Le run naît au rythme du modèle rejoué, et ce rythme dépend de ce que la
  // page a eu à charger. Passer outre en silence produit une archive tronquée
  // et une assertion qui accuse le mauvais coupable, plus loin.
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && pilot.store.state.value.gate === undefined) await wait(30)
  if (pilot.store.state.value.gate === undefined) {
    await pilot.stop()
    throw new Error("le run n'a pas atteint sa porte dans le délai")
  }

  const archive = pilot.archive()
  if (archive === undefined) throw new Error("le run n'a rien enregistré")
  await pilot.stop()
  return archive
}

describe('un run mis en archive', () => {
  it('porte son brief et son flux entier', async () => {
    const archive = await recordedRun()

    expect(archive.version).toBe(ARCHIVE_VERSION)
    expect(archive.brief).toBe(BRIEF)
    // Le flux, pas un résumé du flux.
    expect(archive.events.length).toBeGreaterThan(10)
    const sequences = archive.events.map((event) => event.sequence)
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
  }, 45_000)

  it('traverse une sérialisation JSON sans rien perdre', async () => {
    const archive = await recordedRun()

    // C'est la seule forme sous laquelle il voyagera : s'il ne survit pas à
    // un aller-retour JSON, il ne survivra pas au réseau.
    const back = readArchive(JSON.parse(JSON.stringify(archive)))

    expect(back?.events).toHaveLength(archive.events.length)
    expect(back?.brief).toBe(BRIEF)
  }, 45_000)

  it('refuse une archive d’une autre version, plutôt que de la deviner', () => {
    expect(readArchive({ version: 99, brief: '', events: [{ type: 'x', sequence: 1 }] })).toBeUndefined()
    expect(readArchive({ version: ARCHIVE_VERSION, events: [] })).toBeUndefined()
    expect(readArchive('un run')).toBeUndefined()
  })
})

describe('un run rejoué', () => {
  it('reconstruit le même graphe, sans modèle et sans noyau', async () => {
    const archive = await recordedRun()
    const viewer = createPilot()

    await viewer.replay(archive, 0)

    const live = viewer.store.state.value
    expect(live.nodes.length).toBeGreaterThan(3)
    // Le même compteur : un rejeu qui perdrait le remplacement perdrait ce
    // qu'on vient le voir démontrer.
    expect(live.replacements).toBe(1)
    expect(viewer.isReplay()).toBe(true)
    // Et sans noyau : rien n'a été composé, tout a été relu.
    expect(viewer.kernel()).toBeUndefined()
    await viewer.stop()
  }, 45_000)

  it('rend l’écran que l’agent avait posé', async () => {
    const archive = await recordedRun()
    const viewer = createPilot()

    await viewer.replay(archive, 0)

    // L'écran voyage dans le flux : s'il vivait à côté, un rejeu ouvrirait
    // sur une page vide.
    expect(viewer.screen().revision).toBeGreaterThan(0)
    expect(viewer.screen().markup).toContain('data-invoke')
    await viewer.stop()
  }, 45_000)

  it('sert encore son application, recompilée dans le fil isolé', async () => {
    const archive = await recordedRun()
    const viewer = createPilot()

    await viewer.replay(archive, 0)
    const [behaviour] = viewer.behaviours()

    expect(behaviour?.name).toBe('detecteur')
    // La version comptée depuis le flux, pas lue dans un champ.
    expect(behaviour?.version).toBe(2)

    const answer = await behaviour?.call('Ce produit guérit tout.')
    const output = JSON.parse(answer?.output ?? '[]') as { motif?: string }[]

    // C'est la v2 qui répond, celle qui nomme le motif — donc le rejeu a bien
    // rejoué le remplacement, pas seulement la première version.
    expect(output[0]?.motif).toBe('guérit')
    await viewer.stop()
  }, 45_000)

  it('ne garde aucun comportement d’un run relâché en route', async () => {
    const archive = await recordedRun()
    const viewer = createPilot()
    await viewer.replay(archive, 0)

    expect(viewer.behaviours()).toHaveLength(1)

    await viewer.stop()

    // Arrêter un rejeu le défait comme un run : sinon un onglet garderait des
    // fils isolés vivants pour une application qui n'est plus à l'écran.
    expect(viewer.isReplay()).toBe(false)
    expect(viewer.behaviours()).toHaveLength(0)
  }, 45_000)
})

// Un run où le remplacement n'est pas autonome mais **causé par le visiteur** :
// une interaction réveille l'agent qui a écrit le comportement, qui le remplace
// en réponse. Le seul remplacement du run est donc réactif — c'est lui que le
// rejeu doit reconstruire, à l'identique, depuis le seul flux.
function reactiveModel(): Reasoner {
  const turn = (thought: string, actions: unknown[]) => JSON.stringify({ thought, actions })
  const tokens = { input: 100, output: 40 }
  const SCREEN =
    '<h1>Outil</h1>' +
    '<textarea data-field="texte"></textarea>' +
    '<button data-invoke="detecteur">Analyser</button>' +
    '<div data-output="detecteur"></div>'
  return {
    origin: 'llm',
    reason: vi.fn(async ({ context }) => {
      if (context.includes('Le visiteur a appelé')) {
        return {
          text: turn('je réagis', [{ type: 'replace', name: 'detecteur', code: "(x) => 'v2'" }]),
          origin: 'llm' as const,
          tokens,
        }
      }
      if (context.includes('Toi : master-agent')) {
        if (context.includes('« artisan » existe maintenant')) {
          return { text: turn('lancé', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('un artisan', [
            {
              type: 'create',
              name: 'artisan',
              label: 'Artisan',
              role: 'écrit le détecteur',
              mission: 'Poser l’écran et écrire « detecteur ».',
              needs: [],
              provides: [],
            },
            { type: 'done', summary: '' },
          ]),
          origin: 'llm' as const,
          tokens,
        }
      }
      if (context.includes('Toi : artisan')) {
        if (context.includes('sert maintenant')) {
          return { text: turn('fait', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
        }
        return {
          text: turn('je pose et j’écris', [
            { type: 'screen', markup: SCREEN },
            { type: 'build', name: 'detecteur', code: "(x) => 'v1'" },
          ]),
          origin: 'llm' as const,
          tokens,
        }
      }
      return { text: turn('rien', [{ type: 'done', summary: '' }]), origin: 'llm' as const, tokens }
    }),
  }
}

async function recordedReactiveRun() {
  const pilot = createPilot({ stepMs: 20, settleTimeoutMs: 6000 })
  pilot.connect(reactiveModel())
  await pilot.start('Un outil que le visiteur va essayer.')

  const gateBy = Date.now() + 14_000
  while (Date.now() < gateBy && pilot.store.state.value.gate === undefined) await wait(30)

  // The visitor uses the app: the interaction goes back to the run and provokes
  // a hot replacement in answer.
  pilot.observe({ index: 1, name: 'detecteur', input: 'un essai', version: 1, output: 'v1' })
  const replacedBy = Date.now() + 10_000
  while (Date.now() < replacedBy && pilot.store.state.value.replacements === 0) await wait(30)

  const archive = pilot.archive()
  if (archive === undefined) throw new Error("le run réactif n'a rien enregistré")
  await pilot.stop()
  return archive
}

describe('un run réactif rejoué', () => {
  it('reconstruit la recomposition causée par le visiteur, depuis le seul flux', async () => {
    const archive = await recordedReactiveRun()
    // La cause est dans le flux : l'interaction précède le remplacement.
    const interacted = archive.events.find((e) => e.type === 'visitor-interacted')?.sequence
    const replaced = archive.events.find((e) => e.type === 'component-replaced')?.sequence
    expect(interacted).toBeDefined()
    expect(replaced).toBeDefined()
    expect(interacted as number).toBeLessThan(replaced as number)

    const viewer = createPilot()
    await viewer.replay(archive, 0)
    const live = viewer.store.state.value

    // Le rejeu ne re-mute pas — il n'a pas de noyau — et pourtant il retrouve
    // le remplacement et l'interaction qui l'a causé, comptés depuis le flux.
    expect(viewer.kernel()).toBeUndefined()
    expect(live.replacements).toBe(1)
    expect(live.interactions).toBe(1)

    // Et l'application recompilée dans le fil isolé sert la v2 — celle que le
    // visiteur a provoquée, pas la v1 d'origine.
    const [behaviour] = viewer.behaviours()
    expect(behaviour?.name).toBe('detecteur')
    expect(behaviour?.version).toBe(2)
    expect((await behaviour?.call('x'))?.output).toBe('v2')
    await viewer.stop()
  }, 60_000)
})
