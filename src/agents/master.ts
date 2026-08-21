// The master. It has no plan: it seeds.
//
// It publishes what everyone needs, reads the brief, brings the first agents
// into existence — and those bring others if they need to. Then it waits for
// the worksite to settle, asks for one last objection, and opens the human
// gate on what actually exists. Not on what was planned: nothing was planned.

import { CORPUS } from '../corpus'
import type { Component } from '../runtime/contract'
import { deterministicReasoner, type Reasoner } from '../runtime/reasoner'
import { BUDGET, createWorksite, runLoop, think, type Budget, type Worksite } from './free-agent'

export interface MasterOptions {
  brief: string
  reasoner?: Reasoner
  budget?: Budget
  /**
   * Waits until no agent is working any more. Comes from orchestration, which
   * alone sees the topology: the master does not know its grandchildren.
   */
  settled(timeoutMs?: number): Promise<boolean>
  /** What the run actually published, at this instant. */
  outputs(): readonly string[]
}

/** What the human gate shows: only what really exists. */
export interface RunSummary {
  agents: number
  tools: readonly string[]
  publications: readonly string[]
}

const MASTER_MISSION = (brief: string) =>
  [
    "Tu ouvres une usine logicielle qui n'existe pas encore.",
    `Le besoin exprimé : ${brief}`,
    '',
    "Fais naître les premiers agents dont ce besoin a besoin — pas plus. Chacun aura sa propre mission et pourra en créer d'autres, s'interroger entre eux et écrire des outils.",
    "Au moins un agent, quelque part, doit écrire l'outil qui rend le besoin utilisable — avec « build », pas en le décrivant. Dis-le explicitement dans sa mission.",
    'Tu ne fais pas le travail toi-même : tu amorces, puis tu termines.',
  ].join('\n')

export function masterAgent(options: MasterOptions): Component {
  const reasoner = options.reasoner ?? deterministicReasoner()
  const worksite: Worksite = createWorksite(options.brief, reasoner, options.budget ?? BUDGET)

  return {
    name: 'master-agent',
    provides: ['brief', 'reasoner', 'memory', 'corpus'],
    display: {
      label: 'Agent maître',
      role: "Lit le besoin et fait naître les premiers agents ; le reste s'invente",
    },
    apply(context) {
      context.provide('brief', { from: 'master-agent', text: options.brief })
      // The reasoner is a coeffect: no agent talks to a provider, and the graph
      // shows who depends on the faculty of reasoning.
      context.provide('reasoner', reasoner)
      // A resource, not an agent: real rules that whoever wants them can
      // inject. It predetermines no graph — it only keeps the factory from
      // inventing the law when the law exists.
      context.provide('corpus', CORPUS)
      context.provide('memory', {
        from: 'master-agent',
        text: [
          `Besoin : ${options.brief}`,
          reasoner.origin === 'llm'
            ? "Mode LLM branché : ce que vous allez voir n'a pas été écrit d'avance."
            : "Mode déterministe : aucun modèle ne raisonne, l'usine ne peut rien inventer.",
          `Budget : ${worksite.budget.maxAgents} agents, profondeur ${worksite.budget.maxDepth}, ${worksite.budget.maxTurns} tours chacun.`,
        ].join('\n'),
      })
      context.emit('Lit le besoin. Rien n’existe encore.')

      void seed(context, worksite, options)
    },
  }
}

async function seed(
  context: Parameters<Component['apply']>[0],
  worksite: Worksite,
  options: MasterOptions,
): Promise<void> {
  await runLoop(
    context,
    {
      name: 'master-agent',
      label: 'Agent maître',
      role: 'Amorce le chantier',
      mission: MASTER_MISSION(options.brief),
      needs: [],
      provides: [],
      depth: 0,
    },
    worksite,
    // The master is not done: it still has to wait for the worksite to settle
    // and open the gate. Marking it finished here would show the run as over.
    { finishWhenDone: false },
  )

  // The worksite carries on without it: the agents it created create others.
  // It waits for everything to stop moving before asking for a decision.
  const settled = await options.settled()
  const publications = options.outputs()
  const summary: RunSummary = {
    agents: worksite.agentsCreated,
    tools: publications.filter(
      (name) => worksite.publications.get(name) === '(un outil exécutable)',
    ),
    publications,
  }

  const objection = await lastObjection(context, worksite, summary)
  context.publishArtifact({
    title: 'Ce que le run a produit',
    body: [
      `Besoin : ${worksite.brief}`,
      `${summary.agents} agents ont existé.`,
      summary.tools.length > 0
        ? `Outils écrits pendant le run : ${summary.tools.join(', ')}.`
        : "Aucun outil exécutable n'a été écrit.",
      `Noms publiés : ${summary.publications.join(', ') || 'aucun'}.`,
      settled ? '' : "Le chantier ne s'est pas stabilisé dans le temps imparti.",
    ]
      .filter((line) => line.length > 0)
      .join('\n'),
    derivedFrom: 'le besoin',
  })

  context.emit('Le run attend votre décision.')
  context.awaitDecision(
    {
      summary: [
        summary.agents > 0
          ? `${summary.agents} agents ont été créés pendant ce run ; aucun n'existait avant votre brief.`
          : worksite.reasoner.origin === 'deterministic'
            ? "Aucun agent n'a été créé : sans modèle branché, l'usine ne peut rien inventer."
            : "Aucun agent n'a été créé : le modèle n'en a proposé aucun. Le journal dit ce qu'il a répondu.",
        summary.tools.length > 0
          ? `${summary.tools.length} outil(s) ont été écrits et chargés à chaud : ${summary.tools.join(', ')}.`
          : "Aucun outil exécutable n'est sorti du run.",
        'Approuver livre ce qui existe ; écarter défait le chantier.',
      ].join(' '),
      objection,
    },
    (decision) => {
      context.emit(
        decision === 'approved'
          ? 'Décision : approuvé. Le produit est livré.'
          : 'Décision : écarté.',
      )
      context.finish()
    },
  )
}

/** One last critique, asked of the model about what actually exists. */
async function lastObjection(
  context: Parameters<Component['apply']>[0],
  worksite: Worksite,
  summary: RunSummary,
): Promise<string> {
  const fallback =
    summary.tools.length === 0
      ? "Rien d'exécutable n'est sorti de ce run : il n'y a pas de produit à livrer."
      : `Le run a produit ${summary.tools.length} outil(s) sur ${summary.agents} agents ; rien ne prouve qu'ils couvrent le besoin exprimé.`

  const turn = await think(
    context,
    worksite,
    'Formule en deux phrases l\'objection la plus sérieuse contre ce qui a été produit, en citant un élément précis. Réponds par {"thought":"","actions":[{"type":"say","message":"ton objection"}]}.',
    [
      `Besoin : ${worksite.brief}`,
      `Agents créés : ${summary.agents}`,
      `Outils écrits : ${summary.tools.join(', ') || 'aucun'}`,
      `Noms publiés : ${summary.publications.join(', ') || 'aucun'}`,
    ].join('\n'),
  )
  const said = turn?.actions.find((action) => action.type === 'say')
  return said?.type === 'say' && said.message.length > 0 ? said.message : fallback
}
