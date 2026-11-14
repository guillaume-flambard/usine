/**
 * M1 end to end (MEM-19): a question, an answer in a stream, the graph moving,
 * the run indexed, and with E2E_REAL=1 a Langfuse trace for its thread.
 */
import { expect, test, type APIRequestContext } from '@playwright/test'

const REAL = process.env.E2E_REAL === '1'

/** Observations of a Langfuse session, by its public API (v2, Langfuse 4.80). */
async function langfuseObservations(request: APIRequestContext, sessionId: string) {
  const base = (process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || '').replace(/\/$/, '')
  const auth = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`,
  ).toString('base64')
  const reply = await request.get(`${base}/api/public/v2/observations`, {
    params: { sessionId, fields: 'core,basic,usage,model', limit: 100 },
    headers: { Authorization: `Basic ${auth}` },
  })
  expect(reply.ok()).toBe(true)
  return ((await reply.json()) as { data: Record<string, unknown>[] }).data
}

test('M1: une question, une réponse en flux, un run indexé', async ({ page, request }) => {
  const brief = REAL
    ? 'Donne un avantage de LangGraph puis un avantage de CrewAI, en une phrase chacun.'
    : 'relire les portes puis relire les invites'

  await page.goto('/')
  const chat = page.locator('[data-chat]')
  await expect(chat).toHaveAttribute('data-chat-state', 'ready')

  await page.locator('[data-composer] textarea').fill(brief)
  await page.keyboard.press('Enter')

  // The run streams, and the scene moves while it does: a node is seen running
  // before the run is over.
  await expect(chat).toHaveAttribute('data-chat-state', /submitted|streaming/)
  await expect(page.locator('[data-node-state="running"]').first()).toBeVisible({
    timeout: REAL ? 60_000 : 10_000,
  })
  await expect(chat).toHaveAttribute('data-chat-state', 'ready', {
    timeout: REAL ? 150_000 : 20_000,
  })
  await expect(page.locator('[data-scene-status]')).toContainText('Run terminé')
  await expect(page.locator('[data-node-state="failed"]')).toHaveCount(0)

  const conversation = page.locator('[data-conversation]')
  if (REAL) {
    await expect(conversation).not.toHaveText(new RegExp(`^\\s*${brief}\\s*$`))
  } else {
    await expect(conversation).toContainText('Réponse scriptée : relire les portes')
    await expect(conversation).toContainText('Réponse scriptée : relire les invites')
    await expect(page.locator('[data-node="specialist"]')).toHaveCount(2)
  }

  // The run is indexed under its thread (MEM-18).
  const threadId = await chat.getAttribute('data-thread-id')
  expect(threadId).toBeTruthy()
  const run = await request.get(`/api/runs/${threadId}`)
  expect(run.ok()).toBe(true)
  const detail = (await run.json()) as { status: string; turns: number }
  expect(detail).toMatchObject({ status: 'done', turns: 1 })

  if (!REAL) return

  // And it is traced in Langfuse, under its thread as session (MEM-16).
  let observations: Record<string, unknown>[] = []
  await expect
    .poll(
      async () => {
        observations = await langfuseObservations(request, threadId!)
        return observations.filter((o) => o.type === 'GENERATION').length
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0)
  const generations = observations.filter((o) => o.type === 'GENERATION')
  console.info(
    `langfuse: session ${threadId}, ${observations.length} observations, ` +
      `${generations.length} generations, models ${[...new Set(generations.map((g) => g.model))].join(', ')}`,
  )
})
