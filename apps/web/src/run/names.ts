/** What each graph node is called on screen: one table for the scene and the fork. */
export const NODE_NAMES: Record<string, string> = {
  supervisor: 'Superviseur',
  specialist: 'Spécialiste',
  synthesize: 'Synthèse',
  human_gate: 'Porte humaine',
  act: 'Action',
}

export function nodeName(name: string): string {
  return NODE_NAMES[name] ?? name
}
