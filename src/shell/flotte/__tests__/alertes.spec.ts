import { describe, expect, it } from 'vitest'
import { grouper } from '../alertes'
import type { Agent } from '../client'

const agent = (nom: string, alertes: string[]): Agent => ({
  nom,
  quoi: '',
  statut: 'running',
  depuis: '1 h',
  redemarrages: 0,
  compteurs: {},
  alertes,
})

const QUOTA = (n: number) =>
  `${n} refus de quota cote MODELE. Les penseurs partagent UN compte b.ai : regarder d'abord ` +
  'leurs heures de demarrage. Le 2026-09-09, un deploiement groupe a aligne trois agents.'

describe('le regroupement des alertes', () => {
  it('replie une alerte que trois agents subissent, malgré des comptes différents', () => {
    // Le cas réel du 2026-09-10 : un seul compte b.ai, trois agents, trois
    // fois cinq lignes. Un problème et trois victimes, pas trois problèmes.
    const groupes = grouper([
      agent('prospecteur', [QUOTA(3)]),
      agent('eclaireur', [QUOTA(3)]),
      agent('debouche', [QUOTA(2)]),
    ])
    expect(groupes).toHaveLength(1)
    expect(groupes[0]!.agents).toEqual(['prospecteur', 'eclaireur', 'debouche'])
    expect(groupes[0]!.resume).toBe('3 refus de quota cote MODELE.')
  })

  it('ne replie pas deux alertes différentes du même agent', () => {
    const groupes = grouper([
      agent('prospecteur', [QUOTA(3), '13/15 cas conformes seulement. Le jugement a change.']),
    ])
    expect(groupes).toHaveLength(2)
  })

  it('rend une liste vide quand rien ne cloche', () => {
    expect(grouper([agent('atelier', [])])).toEqual([])
  })

  it('garde le texte entier, pour qui veut comprendre', () => {
    const groupes = grouper([agent('prospecteur', [QUOTA(3)])])
    expect(groupes[0]!.texte).toContain('2026-09-09')
    expect(groupes[0]!.resume.length).toBeLessThan(groupes[0]!.texte.length)
  })
})
