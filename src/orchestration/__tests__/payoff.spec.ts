// Epic 4 — le produit livré. Ce qui compte ici n'est pas qu'un bloc
// s'affiche : c'est qu'il donne un verdict juste, sourcé, reproductible,
// sur un texte que personne n'avait prévu.
import { describe, expect, it } from 'vitest'
import { creerPilote } from '../pilote'
import { claimCheck } from '../../scenarios/claim-check'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

async function runApprouve() {
  const pilote = creerPilote(claimCheck)
  await pilote.demarrer(claimCheck.brief)
  await tick()
  pilote.approuver()
  await tick()
  return pilote
}

const TEXTE =
  'Notre complément guérit les carences chroniques. Il contribue à réduire la fatigue. ' +
  'Il ne traite pas les maladies. Il rend la peau lumineuse.'

describe('le produit livré', () => {
  it("n'est disponible qu'une fois la porte approuvée", async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer(claimCheck.brief)
    await tick()
    // Le run est arrêté à la porte : rien n'est livré.
    expect(pilote.verificateur()).toBeUndefined()

    pilote.approuver()
    await tick()
    expect(pilote.verificateur()).toBeDefined()
  })

  it("n'est plus disponible quand on écarte", async () => {
    const pilote = creerPilote(claimCheck)
    await pilote.demarrer(claimCheck.brief)
    await tick()
    await pilote.ecarter()
    await tick()
    expect(pilote.verificateur()).toBeUndefined()
  })

  it('classe chaque allégation du texte, avec sa source', async () => {
    const pilote = await runApprouve()
    const verdicts = pilote.verificateur()?.(TEXTE) ?? []

    expect(verdicts).toHaveLength(4)
    expect(verdicts[0]).toMatchObject({ statut: 'interdit' })
    expect(verdicts[0]?.source).toContain('1924/2006')
    expect(verdicts[1]).toMatchObject({ statut: 'autorise' })
    expect(verdicts[1]?.source).toContain('432/2012')
    // Une allégation niée n'est pas l'allégation : « ne traite pas » ne
    // vaut pas « traite ».
    expect(verdicts[2]?.statut).toBe('a-verifier')
    // Dire « aucune règle » serait faux : une règle a correspondu, c'est la
    // négation qui a écarté le verdict.
    expect(verdicts[2]?.raison).toBe('formulation-negative')
    // Rien au registre ne la couvre : jamais de verdict tranché.
    expect(verdicts[3]?.statut).toBe('a-verifier')
    expect(verdicts[3]?.raison).toBe('aucune-regle')
  })

  it('ne rend jamais un verdict tranché sans source', async () => {
    const pilote = await runApprouve()
    const verdicts = pilote.verificateur()?.(TEXTE) ?? []
    for (const verdict of verdicts) {
      if (verdict.statut !== 'a-verifier') {
        expect(verdict.source, verdict.texte).toBeDefined()
        expect((verdict.source ?? '').trim().length, verdict.texte).toBeGreaterThan(0)
      }
    }
  })

  it('est déterministe : deux pièces fabriquées séparément classent pareil', async () => {
    // Appeler deux fois la même fonction ne prouverait qu'une absence d'état
    // caché. Ce qui compte, c'est que deux runs indépendants fabriquent une
    // pièce qui rend le même verdict.
    const premier = await runApprouve()
    const second = await runApprouve()
    expect(premier.verificateur()?.(TEXTE)).toEqual(second.verificateur()?.(TEXTE))
  })

  it('rend son verdict en moins de 300 ms sur 2000 caractères, au pire cas', async () => {
    const pilote = await runApprouve()
    const verifier = pilote.verificateur()
    // Le pire cas n'est pas un texte qui déclenche vite : c'est un texte fait
    // de nombreuses allégations courtes qui ne correspondent à rien, donc
    // chacune balaie les quinze règles jusqu'au bout.
    const pire = 'Une phrase neutre et courte. '.repeat(72).slice(0, 2000)
    expect(pire.length).toBe(2000)

    const depart = performance.now()
    const verdicts = verifier?.(pire) ?? []
    const duree = performance.now() - depart

    expect(verdicts.length).toBeGreaterThan(50)
    expect(verdicts.every((v) => v.statut === 'a-verifier')).toBe(true)
    expect(duree).toBeLessThan(300)
  })

  it('rend une liste vide sur un texte vide, sans lever', async () => {
    const pilote = await runApprouve()
    expect(pilote.verificateur()?.('')).toEqual([])
    expect(pilote.verificateur()?.('   \n  ')).toEqual([])
  })
})
