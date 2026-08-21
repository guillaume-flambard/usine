// Rejouer un run, dans un vrai navigateur.
//
// La promesse tenue ici est la plus forte du produit après le remplacement à
// chaud : un run part en archive, revient, et **son application sert encore**.
// Sans ça, un lien partagé montrerait un graphe mort.
import { describe, expect, it } from 'vitest'
import { createPilot } from '../orchestration/pilot'
import { scriptedModel } from '../agents/__tests__/scripted-model'
import { readArchive, ARCHIVE_VERSION } from './replay'

const BRIEF = 'Un outil qui repère les allégations thérapeutiques interdites.'
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function recordedRun() {
  const pilot = createPilot({ stepMs: 20, settleTimeoutMs: 6000 })
  pilot.connect(scriptedModel())
  await pilot.start(BRIEF)

  const deadline = Date.now() + 14_000
  while (Date.now() < deadline && pilot.store.state.value.gate === undefined) await wait(30)

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
  }, 25_000)

  it('traverse une sérialisation JSON sans rien perdre', async () => {
    const archive = await recordedRun()

    // C'est la seule forme sous laquelle il voyagera : s'il ne survit pas à
    // un aller-retour JSON, il ne survivra pas au réseau.
    const back = readArchive(JSON.parse(JSON.stringify(archive)))

    expect(back?.events).toHaveLength(archive.events.length)
    expect(back?.brief).toBe(BRIEF)
  }, 25_000)

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
  }, 25_000)

  it('rend l’écran que l’agent avait posé', async () => {
    const archive = await recordedRun()
    const viewer = createPilot()

    await viewer.replay(archive, 0)

    // L'écran voyage dans le flux : s'il vivait à côté, un rejeu ouvrirait
    // sur une page vide.
    expect(viewer.screen().revision).toBeGreaterThan(0)
    expect(viewer.screen().markup).toContain('data-invoke')
    await viewer.stop()
  }, 25_000)

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
  }, 25_000)

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
  }, 25_000)
})
