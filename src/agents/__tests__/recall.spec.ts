// Ce que le chantier a déjà établi.
//
// Le trou que ça bouche : un agent né au troisième tour n'a aucun chemin vers
// un fait établi au premier — il aurait fallu qu'il devine le nom du coeffet à
// déclarer, avant d'exister.
import { describe, expect, it } from 'vitest'
import { createRecall } from '../recall'

const rules = { author: 'juriste', text: 'les allégations thérapeutiques sont interdites' }
const counting = { author: 'metricien', text: 'un alexandrin compte douze syllabes' }

describe('le rappel', () => {
  it('retrouve le fait qui partage les mots de la question', () => {
    const recall = createRecall()
    recall.remember(rules)
    recall.remember(counting)

    expect(recall.recall('quelles allégations sont interdites')).toEqual([rules])
  })

  it('ne sert rien plutôt que le fait le moins mauvais', () => {
    // Servir le moins mauvais remplirait le contexte de bruit, et l'agent le
    // croirait pertinent parce qu'on le lui a servi.
    const recall = createRecall()
    recall.remember(rules)

    expect(recall.recall('photosynthèse chlorophyllienne')).toEqual([])
  })

  it('garde l’auteur avec le fait', () => {
    const recall = createRecall()
    recall.remember(rules)

    expect(recall.recall('allégations')[0]?.author).toBe('juriste')
  })

  it('ne retient pas deux fois le même fait', () => {
    // Sinon un agent bavard occuperait le rappel de tous les autres.
    const recall = createRecall()
    recall.remember(rules)
    recall.remember(rules)

    expect(recall.size).toBe(1)
  })

  it('ignore un fait sans mot porteur', () => {
    const recall = createRecall()
    recall.remember({ author: 'a', text: 'ok' })

    expect(recall.size).toBe(0)
  })

  it('ne grandit pas sans borne', () => {
    const recall = createRecall(3)
    for (let index = 0; index < 6; index += 1) {
      recall.remember({ author: 'a', text: `allégation numéro ${index} interdite` })
    }

    expect(recall.size).toBe(3)
  })

  it('rend les plus proches d’abord, et pas plus qu’on en demande', () => {
    const recall = createRecall()
    recall.remember({ author: 'a', text: 'les allégations thérapeutiques interdites sont listées' })
    recall.remember({ author: 'b', text: 'les allégations doivent citer une source' })
    recall.remember(counting)

    const found = recall.recall('allégations thérapeutiques interdites', 1)

    expect(found).toHaveLength(1)
    expect(found[0]?.author).toBe('a')
  })
})
