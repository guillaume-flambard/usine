/**
 * The comparison banner (MEM-25) says where the branch resumes and with which
 * specialist, not only whether it differs (review, 16 November 2026).
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import ui from '@nuxt/ui/vue-plugin'
import ComparisonBanner from '../components/ComparisonBanner.vue'
import { EMPTY_RUN, type RunNode, type RunReadModel } from '../run/readModel'
import '../assets/main.css'

const node = (id: string, name: string, specialist?: string): RunNode => ({
  id,
  name,
  state: 'finished',
  startedAt: 0,
  reasoning: { started: 0, settled: 0 },
  ...(specialist ? { specialists: [{ name: specialist, framework: 'langchain', tokens: 1 }] } : {}),
})
const model = (nodes: RunNode[]): RunReadModel => ({ ...EMPTY_RUN, status: 'finished', nodes })

const ORIGINAL = model([
  node('t1', 'supervisor'),
  node('t2', 'specialist', 'mcp-agent'),
  node('t3', 'specialist', 'mcp-agent'),
  node('t4', 'synthesize'),
])

async function banner(right: RunReadModel) {
  await render(ComparisonBanner, { props: { left: ORIGINAL, right }, global: { plugins: [ui] } })
  return {
    divergence: document.querySelector('[data-divergence-text]')?.textContent?.trim(),
    resume: document.querySelector('[data-resume-text]')?.textContent?.trim(),
  }
}

describe('ComparisonBanner', () => {
  it('names the swap: where the branch resumes and which specialist replaced which', async () => {
    const said = await banner(
      model([
        node('b1', 'specialist', 'chat-model'),
        node('b2', 'specialist', 'chat-model'),
        node('b3', 'synthesize'),
      ]),
    )
    expect(said.divergence).toBe('Premier point de divergence : Agent.')
    expect(said.resume).toBe(
      'La nouvelle version reprend avant les 2 agents, avec chat-model au lieu de mcp-agent.',
    )
  })
})
