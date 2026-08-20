import { claimCheck } from './claim-check'
import type { Scenario } from './types'

export const SCENARIOS: readonly Scenario[] = [claimCheck]

export const scenarioParDefaut = (): Scenario => claimCheck

export const trouverScenario = (cle: string): Scenario | undefined =>
  SCENARIOS.find((scenario) => scenario.cle === cle)
