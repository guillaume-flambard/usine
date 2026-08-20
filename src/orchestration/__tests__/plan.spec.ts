// Le plan est ce qui remplace le casting déclaré. Ce qui se vérifie ici :
// deux briefs ne donnent pas le même graphe, et aucun plan incohérent
// n'atteint le noyau — un plan vient possiblement d'un modèle.
import { describe, expect, it, vi } from 'vitest'
import { CONTRAINTES, ordreDeChargement, verifierPlan, type Plan } from '../plan'
import { corpusDuBrief, planifier, planifierSansModele } from '../planifier'
import { nomsDePrimitives } from '../../runtime/fabrique/primitives'
import type { Raisonneur } from '../../runtime/raisonneur'

const noms = (plan: Plan) => plan.agents.map((agent) => agent.nom)

describe('le plan déterministe', () => {
  it('tient debout quel que soit le brief', () => {
    for (const brief of [
      'Je veux vérifier mes allégations santé.',
      'Un écran pour contrôler mes publicités, avec des tests.',
      '',
      'azerty',
    ]) {
      expect(verifierPlan(planifierSansModele(brief)), brief).toEqual([])
    }
  })

  it('ne donne pas le même graphe à deux briefs différents', () => {
    const minimal = planifierSansModele('Vérifier des allégations santé.')
    const complet = planifierSansModele(
      "Je veux un écran pour coller mon texte, des tests de non-régression, une API pour l'automatiser, et une relecture juridique.",
    )

    expect(noms(complet).length).toBeGreaterThan(noms(minimal).length)
    expect(noms(complet)).toEqual(expect.arrayContaining(['constructeur-interface']))
    expect(noms(minimal)).not.toContain('constructeur-interface')
    expect(noms(minimal)).not.toContain('constructeur-tests')
  })

  it('choisit sa source de vérité dans le brief, pas par défaut', () => {
    expect(corpusDuBrief('Mes publicités et mes prix soldés').cle).toBe('pratiques-commerciales')
    expect(corpusDuBrief('Mes compléments alimentaires et leurs vitamines').cle).toBe(
      'allegations-sante',
    )
    // Rien de reconnaissable : on ne devine pas, on prend le premier corpus.
    expect(corpusDuBrief('bonjour').cle).toBe('allegations-sante')
  })

  it('adapte la chaîne fabriquée à ce que le brief demande, sans jamais lâcher la source', () => {
    const simple = planifierSansModele('Vérifier des allégations.')
    const nuance = planifierSansModele(
      'Vérifier des allégations, formulations négatives comprises.',
    )
    const outil = (plan: Plan) => plan.agents.find((a) => a.outil !== undefined)?.outil

    expect(outil(simple)?.etapes).not.toContain('ecarter-les-negations')
    expect(outil(nuance)?.etapes).toContain('ecarter-les-negations')
    // « Pas de verdict sans source » est une promesse du produit, pas une option.
    for (const plan of [simple, nuance]) {
      expect(outil(plan)?.etapes).toContain('exiger-une-source')
      expect(outil(plan)?.etapes.every((e) => nomsDePrimitives().includes(e))).toBe(true)
    }
  })

  it('charge chaque agent après ce dont il dépend', () => {
    const plan = planifierSansModele('Un écran, des tests, une API, une relecture juridique.')
    const ordre = ordreDeChargement(plan)

    expect(ordre).toHaveLength(plan.agents.length)
    const place = new Map(ordre.map((agent, rang) => [agent.nom, rang]))
    const publiePar = new Map(
      plan.agents.flatMap((agent) =>
        [...agent.fournit, ...(agent.outil ? [agent.outil.fournit] : [])].map(
          (nom) => [nom, agent.nom] as const,
        ),
      ),
    )
    for (const agent of plan.agents) {
      for (const nom of agent.injecte) {
        const fournisseur = publiePar.get(nom)
        if (fournisseur === undefined || fournisseur === agent.nom) continue
        expect(place.get(fournisseur), `${fournisseur} avant ${agent.nom}`).toBeLessThan(
          place.get(agent.nom) as number,
        )
      }
    }
  })
})

const PLAN_MINIMAL: Plan = {
  produit: 'Vérificateur',
  aide: 'Collez un texte.',
  corpus: 'allegations-sante',
  origine: 'modele',
  agents: [
    { nom: 'source', libelle: 'Source', role: 'r', injecte: [], fournit: ['registre'] },
    {
      nom: 'fabricant',
      libelle: 'Fabricant',
      role: 'r',
      injecte: ['registre', 'fabrique'],
      fournit: ['sortie-produit'],
      outil: { fournit: 'verificateur', etapes: ['decouper-allegations', 'classer-par-regles'] },
    },
    {
      nom: 'sceptique',
      libelle: 'Sceptique',
      role: 'r',
      injecte: ['sortie-produit'],
      fournit: ['objection'],
    },
  ],
}

const avec = (modifier: (plan: Plan) => Plan): readonly string[] =>
  verifierPlan(modifier(structuredClone(PLAN_MINIMAL))).map((defaut) => defaut.code)

describe('la vérification du plan', () => {
  it('accepte un plan cohérent', () => {
    expect(verifierPlan(PLAN_MINIMAL)).toEqual([])
  })

  it('refuse une dépendance que personne ne publie', () => {
    // Elle ne lèverait rien : l'agent resterait en attente pour toujours.
    expect(
      avec((plan) => ({
        ...plan,
        agents: plan.agents.map((a) =>
          a.nom === 'sceptique' ? { ...a, injecte: [...a.injecte, 'sortie-fantome'] } : a,
        ),
      })),
    ).toContain('dependance-sans-fournisseur')
  })

  it('refuse un cycle', () => {
    expect(
      avec((plan) => ({
        ...plan,
        agents: plan.agents.map((a) =>
          a.nom === 'source' ? { ...a, injecte: ['sortie-produit'] } : a,
        ),
      })),
    ).toContain('cycle')
  })

  it("refuse une primitive qui n'existe pas", () => {
    expect(
      avec((plan) => ({
        ...plan,
        agents: plan.agents.map((a) =>
          a.outil ? { ...a, outil: { ...a.outil, etapes: ['inventer-un-verdict'] } } : a,
        ),
      })),
    ).toContain('primitive-inconnue')
  })

  it('refuse deux agents qui publient le même nom, et le vol des noms du maître', () => {
    expect(
      avec((plan) => ({
        ...plan,
        agents: plan.agents.map((a) => (a.nom === 'source' ? { ...a, fournit: ['objection'] } : a)),
      })),
    ).toContain('nom-en-double')
    expect(
      avec((plan) => ({
        ...plan,
        agents: plan.agents.map((a) => (a.nom === 'source' ? { ...a, fournit: ['besoin'] } : a)),
      })),
    ).toContain('nom-du-maitre')
  })

  it('refuse un plan qui ne tient pas les promesses de la suite', () => {
    expect(
      avec((plan) => ({ ...plan, agents: plan.agents.filter((a) => a.nom !== 'sceptique') })),
    ).toContain('promesse-non-tenue')
  })

  it('refuse un agent décoratif et un plan démesuré', () => {
    expect(
      avec((plan) => ({
        ...plan,
        agents: [
          ...plan.agents,
          { nom: 'figurant', libelle: 'F', role: 'r', injecte: [], fournit: [] },
        ],
      })),
    ).toContain('agent-inutile')

    const foule = {
      ...PLAN_MINIMAL,
      agents: Array.from({ length: CONTRAINTES.maximumAgents + 1 }, (_, i) => ({
        nom: `agent-${i}`,
        libelle: 'A',
        role: 'r',
        injecte: [],
        fournit: [`sortie-${i}`],
      })),
    }
    expect(verifierPlan(foule).map((d) => d.code)).toContain('trop-d-agents')
  })
})

const raisonneurQuiRend = (texte: string): Raisonneur => ({
  origine: 'llm',
  raisonner: vi.fn(async () => ({
    texte,
    origine: 'llm' as const,
    tokens: { entree: 900, sortie: 300 },
  })),
})

describe('la planification par un modèle', () => {
  it('adopte le plan du modèle quand il tient', async () => {
    const { plan, echec, tokens } = await planifier(
      'peu importe',
      raisonneurQuiRend(`Voici le plan :\n${JSON.stringify(PLAN_MINIMAL)}\nBonne journée.`),
    )

    expect(echec).toBeUndefined()
    expect(plan.origine).toBe('modele')
    expect(noms(plan)).toEqual(['source', 'fabricant', 'sceptique'])
    expect(tokens).toEqual({ entree: 900, sortie: 300 })
  })

  it('retombe sur le plan déterministe et dit pourquoi', async () => {
    const illisible = await planifier(
      'des allégations',
      raisonneurQuiRend("je préfère t'expliquer"),
    )
    expect(illisible.plan.origine).toBe('deterministe')
    expect(illisible.echec).toContain('aucun objet JSON')

    const incoherent = await planifier(
      'des allégations',
      raisonneurQuiRend(
        JSON.stringify({
          ...PLAN_MINIMAL,
          agents: [
            {
              nom: 'seul',
              libelle: 'S',
              role: 'r',
              injecte: ['inexistant'],
              fournit: ['objection'],
            },
          ],
        }),
      ),
    )
    expect(incoherent.plan.origine).toBe('deterministe')
    expect(incoherent.echec).toContain('plan refusé')
  })

  it("n'appelle pas le modèle quand aucun n'est branché", async () => {
    const raisonneur: Raisonneur = { origine: 'deterministe', raisonner: vi.fn() }
    const { plan } = await planifier('des allégations', raisonneur)

    expect(raisonneur.raisonner).not.toHaveBeenCalled()
    expect(plan.origine).toBe('deterministe')
  })
})
