// The screen showed « 1 agents ont été créés » and « 0 remplacement(s) » in
// production. Both are the same defect: a number is known, and the sentence
// was written without it.
import { describe, expect, it } from 'vitest'
import { agree, count } from '../plural'

describe('French agreement', () => {
  it('keeps the singular at one, and at zero', () => {
    expect(count(1, 'agent', 'agents')).toBe('1 agent')
    // Le français traite zéro comme un singulier : « 0 redémarrage ».
    expect(count(0, 'redémarrage', 'redémarrages')).toBe('0 redémarrage')
  })

  it('turns plural from two', () => {
    expect(count(2, 'agent', 'agents')).toBe('2 agents')
    expect(count(12, 'token', 'tokens')).toBe('12 tokens')
  })

  it('agrees a verb with its subject', () => {
    expect(agree(1, 'a été créé', 'ont été créés')).toBe('a été créé')
    expect(agree(3, 'a été créé', 'ont été créés')).toBe('ont été créés')
  })
})
