/** What each graph node is called on screen: one table for the scene and the fork. */
export const NODE_NAMES: Record<string, string> = {
  supervisor: 'Chef d’équipe',
  specialist: 'Agent',
  synthesize: 'Synthèse',
  human_gate: 'Votre accord',
  act: 'Action',
}

export function nodeName(name: string): string {
  return NODE_NAMES[name] ?? name
}
