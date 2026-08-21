// Un modèle factice mais scripté : il répond selon ce qu'on lui donne à lire,
// comme le ferait un vrai. Le produit ne connaît aucune de ces réponses — c'est
// tout l'intérêt : rien de ce que ce fichier décide n'existe dans src/.
import { vi } from 'vitest'
import type { Demande, Raisonneur } from '../../runtime/raisonneur'

const json = (objet: unknown) => JSON.stringify(objet)

/**
 * Un modèle scripté : il répond selon ce qu'on lui donne à lire, comme le
 * ferait un vrai. Rien dans le produit ne connaît ces réponses.
 */
export function modeleScripte(): Raisonneur {
  return {
    origine: 'llm',
    raisonner: vi.fn(async (demande: Demande) => {
      const texte = repondre(demande.contexte)
      return { texte, origine: 'llm' as const, tokens: { entree: 200, sortie: 80 } }
    }),
  }
}

function repondre(contexte: string): string {
  const tour = (pensee: string, actions: unknown[]) => json({ pensee, actions })

  // Une question posée par un agent à un autre.
  if (contexte.includes('Question posée par')) {
    return tour('on m’interroge', [
      { type: 'dire', message: 'Les motifs interdits doivent citer leur article.' },
    ])
  }

  // L'objection finale demandée par le maître.
  if (contexte.includes('Agents créés :')) {
    return tour('je critique', [
      { type: 'dire', message: 'Le détecteur ne couvre que trois motifs sur le corpus entier.' },
    ])
  }

  // Le maître, premier tour : il fait naître deux agents.
  if (contexte.includes('Toi : agent-maitre')) {
    if (contexte.includes('« juriste » existe maintenant')) {
      return tour('le chantier est lancé', [{ type: 'terminer', resume: 'Amorçage terminé.' }])
    }
    return tour('il faut un juriste et un artisan', [
      {
        type: 'creer',
        nom: 'juriste',
        libelle: 'Juriste',
        role: 'Connaît les textes opposables',
        mission: 'Répondre aux questions sur les règles et publier les motifs interdits.',
        injecte: ['corpus'],
        fournit: ['motifs-interdits'],
      },
      {
        type: 'creer',
        nom: 'artisan',
        libelle: 'Artisan',
        role: 'Écrit le code du produit',
        mission: 'Écrire un détecteur à partir des motifs interdits.',
        injecte: ['motifs-interdits'],
        fournit: ['rapport-outil'],
      },
      { type: 'terminer', resume: 'Amorçage terminé.' },
    ])
  }

  // Le juriste publie ce qu'il a tiré du corpus.
  if (contexte.includes('Toi : juriste')) {
    return tour('je lis le corpus', [
      { type: 'publier', nom: 'motifs-interdits', texte: 'guérit ; soigne ; traite' },
      { type: 'terminer', resume: 'Motifs publiés.' },
    ])
  }

  // L'artisan interroge le juriste, puis écrit un vrai outil.
  if (contexte.includes('Toi : artisan')) {
    if (contexte.includes('l’outil « detecteur » tourne') || contexte.includes('est publié')) {
      return tour('fini', [{ type: 'terminer', resume: 'Outil livré.' }])
    }
    return tour('je demande confirmation puis j’écris', [
      { type: 'demander', a: 'juriste', question: 'Faut-il citer un article ?' },
      {
        type: 'fabriquer',
        nom: 'detecteur',
        fournit: 'detecteur',
        code: "(texte) => String(texte).split('.').map((p) => p.trim()).filter((p) => p.length > 0).map((phrase) => ({ phrase, interdit: ['guérit','soigne','traite'].some((m) => phrase.toLowerCase().includes(m)) }))",
      },
      { type: 'publier', nom: 'rapport-outil', texte: 'Détecteur écrit et chargé.' },
      { type: 'terminer', resume: 'Outil livré.' },
    ])
  }

  return tour('rien à faire', [{ type: 'terminer', resume: '' }])
}
