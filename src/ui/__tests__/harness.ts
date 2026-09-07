// Shared waiting for the browser suites.
//
// The run is born at the replayed model's pace, and that pace is not a
// constant: it depends on what else the page had to load. Every suite used to
// sleep a fixed nine seconds after launching, which passed until the bundle
// grew and then failed on assertions that had nothing to do with the change.
// Wait on the fact instead.
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function waitFor(
  ready: () => boolean,
  { timeout = 20000, why = 'la condition attendue' }: { timeout?: number; why?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`délai dépassé en attendant ${why}`)
    await wait(50)
  }
}

/** The run has gone far enough to be looked at: the gate is asking. */
const gateIsAsking = () => document.querySelector('[data-gate-action]') !== null

/**
 * Launch a run the way a keyless visitor does, and wait until the gate asks.
 * The field starts empty: in demo mode the recorded-run entry writes the one
 * brief the replay knows and launches it.
 */
export async function startRun(): Promise<void> {
  const brief = document.querySelector<HTMLTextAreaElement>('#brief')
  if (brief !== null && brief.value.length === 0) {
    document.querySelector<HTMLButtonElement>('.recorded-run')?.click()
  } else {
    document.querySelector<HTMLButtonElement>('.composer .button')?.click()
  }
  await waitFor(gateIsAsking, { why: 'que la porte demande une décision' })
  // The gate appears while the last nodes are still landing; a short settle
  // keeps the graph assertions looking at a stable picture.
  await wait(400)
}
