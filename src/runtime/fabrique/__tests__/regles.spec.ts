// Le cœur métier : un verdict faux mais accompagné d'une citation
// réglementaire détruit la confiance plus sûrement qu'une absence de verdict.
// Ces tests défendent cette phrase, cas par cas.
import { describe, expect, it } from 'vitest'
import { fabriqueParComposition, type SpecificationComposant } from '../index'
import { motifCorrespond, normaliser, type Verdict } from '../primitives'
import { creerNoyau } from '../../noyau'
import { registreEu } from '../../../outils/registre-eu'
import { claimCheck } from '../../../scenarios/claim-check'
import type { Composant } from '../../contrat'

const SPEC: SpecificationComposant = {
  nom: 'verificateur-allegations',
  libelle: 'Vérificateur',
  role: 'Classe chaque allégation et cite sa source',
  injecte: ['registre'],
  fournit: ['verificateur'],
  etapes: [
    'decouper-allegations',
    'classer-par-regles',
    'ecarter-les-negations',
    'exiger-une-source',
  ],
}

const tick = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

/** Un vérificateur adossé au vrai registre du scénario livré. */
async function verificateurReel() {
  const noyau = creerNoyau()
  let verifier: ((texte: string) => readonly Verdict[]) | undefined
  const regles = (claimCheck.casting.find((e) => e.composant.nom === 'outil-registre')?.composant ??
    registreEu([])) as Composant
  await noyau.charger(regles)
  const resultat = fabriqueParComposition().compiler(SPEC)
  if (!resultat.ok) throw new Error('compilation échouée')
  await noyau.charger(resultat.piece.composant)
  await noyau.charger({
    nom: 'lecteur',
    injecte: ['verificateur'],
    presentation: { libelle: 'Lecteur', role: 'Récupère' },
    applique(contexte) {
      verifier = contexte.lire('verificateur')
    },
  })
  await tick()
  if (verifier === undefined) throw new Error('vérificateur absent')
  return verifier
}

const premier = (verdicts: readonly Verdict[]) => verdicts[0]

describe('frontières de mot', () => {
  it('ne déclenche pas « soigne » sur « soigneusement »', async () => {
    const verifier = await verificateurReel()
    expect(premier(verifier('Fabriqué soigneusement en France.'))?.statut).toBe('a-verifier')
  })

  it('ne déclenche pas « traite » sur « extraite » ni « traitement »', async () => {
    const verifier = await verificateurReel()
    expect(premier(verifier('Une huile extraite à froid.'))?.statut).toBe('a-verifier')
    expect(premier(verifier('Compatible avec votre traitement médical.'))?.statut).toBe(
      'a-verifier',
    )
  })

  it('déclenche bien sur le mot entier', async () => {
    const verifier = await verificateurReel()
    expect(premier(verifier('Ce produit traite les carences.'))?.statut).toBe('interdit')
  })
})

describe('normalisation de la copie réelle', () => {
  it("accepte l'apostrophe droite comme la typographique", async () => {
    const verifier = await verificateurReel()
    for (const apostrophe of ["'", '’']) {
      const verdict = premier(
        verifier(`Il contribue au maintien d${apostrophe}une ossature normale.`),
      )
      expect(verdict?.statut, apostrophe).toBe('autorise')
      expect(verdict?.source, apostrophe).toContain('432/2012')
    }
  })

  it('accepte une copie sans accents', async () => {
    const verifier = await verificateurReel()
    expect(premier(verifier('Ce produit detoxifie en douceur.'))?.raison).toBe('regle-ambigue')
  })

  it('expose ses helpers de normalisation', () => {
    expect(normaliser(' Détoxifie  l’ORGANISME ')).toBe("detoxifie l'organisme")
    expect(motifCorrespond('Une huile extraite', 'traite')).toBe(false)
    expect(motifCorrespond('Il traite les carences', 'traite')).toBe(true)
  })
})

describe('gravité et masquage', () => {
  it('ne laisse pas une allégation autorisée masquer une interdiction', async () => {
    const verifier = await verificateurReel()
    const verdict = premier(verifier("Il contribue à réduire la fatigue et guérit l'anémie."))
    // Une interdiction masquée est une violation non signalée.
    expect(verdict?.statut).toBe('interdit')
    expect(verdict?.source).toContain('1924/2006')
  })
})

describe('négation', () => {
  it("écarte le verdict quand l'allégation est niée", async () => {
    const verifier = await verificateurReel()
    for (const texte of [
      'Ce produit ne guérit pas les rhumes.',
      'Notre gélule ne guérit absolument pas les rhumes.',
      'Il ne vous guérit pas.',
      'Ce produit ne guérit rien.',
    ]) {
      const verdict = premier(verifier(texte))
      expect(verdict?.statut, texte).toBe('a-verifier')
      expect(verdict?.raison, texte).toBe('formulation-negative')
    }
  })

  it('ne laisse pas une négation voisine faire taire une vraie violation', async () => {
    const verifier = await verificateurReel()
    for (const texte of [
      "Il ne remplace pas un médicament mais il guérit l'arthrose.",
      'Ce produit ne contient pas de sucre et guérit les rhumes.',
    ]) {
      expect(premier(verifier(texte))?.statut, texte).toBe('interdit')
    }
  })

  it("ne prend pas « sans sucre » pour une négation d'allégation", async () => {
    const verifier = await verificateurReel()
    expect(premier(verifier('Sans sucre ajouté, il guérit les carences.'))?.statut).toBe('interdit')
  })
})

describe('découpage', () => {
  it('ne casse pas une allégation sur une abréviation', async () => {
    const verifier = await verificateurReel()
    const verdicts = verifier('Vitamine D3 500 U.I. contribue à réduire la fatigue.')
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0]?.statut).toBe('autorise')
  })
})

describe('le registre du scénario livré', () => {
  it('classe chaque motif comme il le déclare', async () => {
    const verifier = await verificateurReel()
    const regles = claimCheck.casting.find((e) => e.composant.nom === 'outil-registre')
      ?.composant as Composant | undefined
    expect(regles).toBeDefined()

    // Chaque règle du registre est exercée : une règle inerte ou mal
    // classée passerait sinon inaperçue.
    for (const { motif, statut, source } of REGLES_ATTENDUES) {
      const verdict = premier(verifier(`Ce produit ${motif}.`))
      expect(verdict?.statut, motif).toBe(statut)
      if (statut !== 'a-verifier') expect(verdict?.source, motif).toContain(source)
    }
  })
})

const REGLES_ATTENDUES = [
  {
    motif: 'contribue au fonctionnement normal du système immunitaire',
    statut: 'autorise',
    source: '432/2012',
  },
  { motif: 'contribue à réduire la fatigue', statut: 'autorise', source: '432/2012' },
  { motif: 'contribue au maintien d’une ossature normale', statut: 'autorise', source: '432/2012' },
  { motif: 'contribue à une fonction musculaire normale', statut: 'autorise', source: '432/2012' },
  { motif: 'contribue au maintien d’une vision normale', statut: 'autorise', source: '432/2012' },
  { motif: 'guérit', statut: 'interdit', source: '1924/2006' },
  { motif: 'soigne', statut: 'interdit', source: '1924/2006' },
  { motif: 'traite', statut: 'interdit', source: '1924/2006' },
  { motif: 'prévient la maladie', statut: 'interdit', source: '1924/2006' },
  { motif: 'remplace un traitement', statut: 'interdit', source: '1924/2006' },
  { motif: 'fait perdre du poids', statut: 'interdit', source: '1924/2006' },
  { motif: 'recommandé par les médecins', statut: 'interdit', source: '1924/2006' },
  { motif: 'renforce les défenses naturelles', statut: 'a-verifier', source: '1924/2006' },
  { motif: 'détoxifie', statut: 'a-verifier', source: '1924/2006' },
  { motif: 'anti-âge', statut: 'a-verifier', source: '1924/2006' },
] as const
