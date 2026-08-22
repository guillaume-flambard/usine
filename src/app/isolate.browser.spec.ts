import { describe, expect, it } from 'vitest'
import { createIsolate, type Isolate } from './isolate'

async function isolateFor(code: string): Promise<Isolate> {
  const made = await createIsolate(code)
  if (!('isolate' in made)) throw new Error(`compilation refusée : ${made.failure}`)
  return made.isolate
}

describe('running a behaviour in an isolated thread', () => {
  it('runs it and hands the answer back as text', async () => {
    const isolate = await isolateFor('(input) => input.split(" ").length')

    await expect(isolate.run('trois mots ici')).resolves.toEqual({ output: '3' })

    isolate.dispose()
  })

  it('refuses code that does not evaluate to a function, before any call', async () => {
    const made = await createIsolate('42')

    expect(made).toEqual({ failure: "le code ne s'évalue pas en fonction" })
  })

  it('reports a syntax error as a refusal, not as a crash', async () => {
    const made = await createIsolate('(input) => {')

    expect('failure' in made).toBe(true)
  })

  it('turns a behaviour that throws into an answer, never an exception', async () => {
    const isolate = await isolateFor('() => { throw new Error("cassé") }')

    const answer = await isolate.run('a')

    expect(answer.output).toBeUndefined()
    expect(answer.failure).toContain('cassé')
    isolate.dispose()
  })

  it('stops a behaviour that never returns — the only defence that works', async () => {
    const isolate = await isolateFor('() => { while (true) {} }')

    const answer = await isolate.run('a', 200)

    expect(answer.failure).toContain('arrêté')
    isolate.dispose()
  })

  it('survives a stop: the abandoned call is lost, the behaviour is not', async () => {
    const isolate = await isolateFor('(input) => input === "boucle" ? eternity() : "ok"')

    const stopped = await isolate.run('boucle', 200)
    const after = await isolate.run('autre chose')

    expect(stopped.failure).toBeDefined()
    expect(after.output).toBe('ok')
    isolate.dispose()
  })

  it('has no network: the globals are gone, not merely forbidden', async () => {
    const isolate = await isolateFor('() => [typeof fetch, typeof WebSocket, typeof XMLHttpRequest].join(",")')

    await expect(isolate.run('')).resolves.toEqual({ output: 'undefined,undefined,undefined' })

    isolate.dispose()
  })

  it('has no document and no local storage', async () => {
    const isolate = await isolateFor('() => [typeof document, typeof localStorage].join(",")')

    await expect(isolate.run('')).resolves.toEqual({ output: 'undefined,undefined' })

    isolate.dispose()
  })

  it('awaits a behaviour that answers later, under the same clock', async () => {
    const isolate = await isolateFor(
      '(input) => new Promise((done) => setTimeout(() => done(input.toUpperCase()), 20))',
    )

    await expect(isolate.run('tard')).resolves.toEqual({ output: 'TARD' })

    isolate.dispose()
  })

  it('answers with a failure once released, rather than reviving itself', async () => {
    const isolate = await isolateFor('() => "ok"')

    isolate.dispose()

    await expect(isolate.run('a')).resolves.toEqual({ failure: 'ce comportement a été retiré' })
  })
})

describe('un comportement branché sur une source', () => {
  it('reçoit la donnée sans jamais avoir de réseau', async () => {
    // Le comportement lit `donnees`. Il n'a pas `fetch` — c'est le service qui
    // est allé chercher, et l'agent n'a nommé qu'une source.
    const { behaviourComponent } = await import('./behaviour')
    const made = await behaviourComponent(
      {
        name: 'taux',
        version: 1,
        author: 'artisan',
        source: 'exchange-rates',
        code: '(entree) => { const p = JSON.parse(entree); return `${p.entree} vaut ${JSON.parse(p.donnees).taux}` }',
      },
      undefined,
      async () => ({ body: '{"taux":1.09}', truncated: false }),
    )
    if (!('component' in made)) throw new Error(made.failure)

    // Le composant expose son branchement : le graphe doit le montrer.
    expect(made.component.display?.technology).toContain('exchange-rates')
  })
})
