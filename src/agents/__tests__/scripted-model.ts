// A fake but scripted model: it answers according to what it is given to
// read, as a real one would. The product knows none of these answers — that is
// the whole point: nothing this file decides exists in src/.
import { vi } from 'vitest'
import type { Reasoner, ReasoningRequest } from '../../runtime/reasoner'

const json = (value: unknown) => JSON.stringify(value)

export function scriptedModel(): Reasoner {
  return {
    origin: 'llm',
    reason: vi.fn(async (request: ReasoningRequest) => {
      const text = answer(request.context)
      return { text, origin: 'llm' as const, tokens: { input: 200, output: 80 } }
    }),
  }
}

function answer(context: string): string {
  const turn = (thought: string, actions: unknown[]) => json({ thought, actions })

  // A question one agent asked another.
  if (context.includes('Question posée par')) {
    return turn('on m’interroge', [
      { type: 'say', message: 'Les motifs interdits doivent citer leur article.' },
    ])
  }

  // The final objection the master asks for.
  if (context.includes('Agents créés :')) {
    return turn('je critique', [
      { type: 'say', message: 'Le détecteur ne couvre que trois motifs sur le corpus entier.' },
    ])
  }

  // The master, first turn: it brings two agents into existence.
  if (context.includes('Toi : master-agent')) {
    if (context.includes('« juriste » existe maintenant')) {
      return turn('le chantier est lancé', [{ type: 'done', summary: 'Amorçage terminé.' }])
    }
    return turn('il faut un juriste et un artisan', [
      {
        type: 'create',
        name: 'juriste',
        label: 'Juriste',
        role: 'Connaît les textes opposables',
        mission: 'Répondre aux questions sur les règles et publier les motifs interdits.',
        needs: ['corpus'],
        provides: ['motifs-interdits'],
      },
      {
        type: 'create',
        name: 'artisan',
        label: 'Artisan',
        role: 'Écrit le code du produit',
        mission: 'Écrire un détecteur à partir des motifs interdits.',
        needs: ['motifs-interdits'],
        provides: ['rapport-outil'],
      },
      { type: 'done', summary: 'Amorçage terminé.' },
    ])
  }

  // The lawyer publishes what it drew from the corpus.
  if (context.includes('Toi : juriste')) {
    return turn('je lis le corpus', [
      { type: 'publish', name: 'motifs-interdits', text: 'guérit ; soigne ; traite' },
      { type: 'done', summary: 'Motifs publiés.' },
    ])
  }

  // The artisan questions the lawyer, then writes a real tool.
  if (context.includes('Toi : artisan')) {
    if (context.includes('l’outil « detecteur » tourne') || context.includes('est publié')) {
      return turn('fini', [{ type: 'done', summary: 'Outil livré.' }])
    }
    return turn('je demande confirmation puis j’écris', [
      { type: 'ask', to: 'juriste', question: 'Faut-il citer un article ?' },
      {
        type: 'build',
        name: 'detecteur',
        provides: 'detecteur',
        code: "(texte) => String(texte).split('.').map((p) => p.trim()).filter((p) => p.length > 0).map((phrase) => ({ phrase, interdit: ['guérit','soigne','traite'].some((m) => phrase.toLowerCase().includes(m)) }))",
      },
      { type: 'publish', name: 'rapport-outil', text: 'Détecteur écrit et chargé.' },
      { type: 'done', summary: 'Outil livré.' },
    ])
  }

  return turn('rien à faire', [{ type: 'done', summary: '' }])
}
