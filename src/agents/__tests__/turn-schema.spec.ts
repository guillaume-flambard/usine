// Le vocabulaire, en outils.
//
// Ce que ces tests protègent : le vocabulaire décrit au fournisseur est celui
// que la relecture accepte, et il ne peut plus se faire brouiller par l'ordre
// des clés — c'est ce qui a cassé la version précédente en production.
import { describe, expect, it } from 'vitest'
import { TOOLS, TOOL_NAMES } from '../turn-schema'
import { readAction, readCalls } from '../actions'

describe('le vocabulaire décrit au fournisseur', () => {
  it('décrit exactement les actions que la relecture accepte', () => {
    const accepted = [
      'create',
      'ask',
      'screen',
      'build',
      'replace',
      'publish',
      'remove',
      'say',
      'done',
    ]

    expect([...TOOL_NAMES].sort()).toEqual([...accepted].sort())
  })

  it('déclare chaque champ requis, comme le mode strict l’exige', () => {
    // Un champ absent de `required` rend le schéma non conforme, et un
    // décodeur devant un schéma non conforme se comporte d'une façon que
    // personne ne documente. Un champ facultatif se déclare « ou nul ».
    for (const entry of TOOLS) {
      const parameters = entry.function.parameters as {
        properties: Record<string, unknown>
        required: readonly string[]
        additionalProperties: boolean
      }
      expect(parameters.additionalProperties).toBe(false)
      expect([...parameters.required].sort()).toEqual(Object.keys(parameters.properties).sort())
      expect(entry.function.strict).toBe(true)
    }
  })

  it('décrit chaque outil, parce qu’un modèle choisit sur la description', () => {
    for (const entry of TOOLS) {
      expect((entry.function.description as string).length).toBeGreaterThan(20)
    }
  })

  it('contraint les noms comme la relecture les contraint', () => {
    const build = TOOLS.find((entry) => entry.function.name === 'build')
    // Sans cette garde, le `?.` ci-dessous ne protégeait de rien : il
    // court-circuitait vers `undefined` et l'accès suivant levait.
    expect(build).toBeDefined()
    const parameters = build?.function.parameters as {
      properties: Record<string, { pattern?: string }>
    }
    const pattern = new RegExp(parameters.properties.name?.pattern ?? '$^')

    expect(pattern.test('compter')).toBe(true)
    expect(readAction({ type: 'build', name: 'compter', code: '() => 1' })).toBeDefined()
    expect(pattern.test('Compter')).toBe(false)
    expect(readAction({ type: 'build', name: 'Compter', code: '() => 1' })).toBeUndefined()
  })
})

describe('un tour rendu en appels d’outils', () => {
  it('prend le nom de l’action hors du corps JSON', () => {
    // C'est tout le point. Dans l'union précédente, le fournisseur sérialisait
    // les clés par ordre alphabétique : « name » sortait avant « type », et le
    // décodeur se retrouvait enfermé dans la seule branche compatible —
    // « remove ». Un « create » devenait un « remove », six fois de suite.
    const turn = readCalls('je crée l’agent', [
      {
        name: 'create',
        arguments: JSON.stringify({
          name: 'poseur-ecran',
          label: 'Poseur',
          role: 'Pose l’écran',
          mission: 'Poser l’écran et un premier comportement',
          needs: [],
          provides: [],
        }),
      },
    ])

    expect(turn.actions).toHaveLength(1)
    expect(turn.actions[0]?.type).toBe('create')
    expect(turn.thought).toContain('crée')
  })

  it('laisse tomber un appel illisible sans emporter le tour', () => {
    const turn = readCalls('', [
      { name: 'say', arguments: '{pas du json' },
      { name: 'done', arguments: '{"summary":"fini"}' },
    ])

    expect(turn.actions.map((action) => action.type)).toEqual(['done'])
  })

  it('laisse tomber un outil qu’il ne connaît pas', () => {
    const turn = readCalls('', [{ name: 'deploy_to_prod', arguments: '{}' }])

    expect(turn.actions).toEqual([])
  })

  it('accepte un tour sans texte : un modèle qui agit n’a rien à dire', () => {
    const turn = readCalls('', [{ name: 'done', arguments: '{"summary":"fini"}' }])

    expect(turn.actions).toHaveLength(1)
    expect(turn.thought).toBe('')
  })
})
