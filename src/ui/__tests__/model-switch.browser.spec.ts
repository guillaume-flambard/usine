// The connect path had no test, and it was broken: the shell listened for
// events this component never emitted, so pasting a provider key and confirming
// did nothing. These assertions exist so that cannot come back silently.
//
// The events are captured through real listeners rather than `emitted()`: the
// helper accumulates across every render of the file, so its counts say nothing
// about the instance under test.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import ModelSwitch from '../ModelSwitch.vue'
import '../../assets/main.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Left mounted, an earlier instance keeps its popover content in the document
// and the next test's global queries find it first.
let mounted: { unmount: () => void } | undefined
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

const click = async (selector: string) => {
  document.querySelector<HTMLElement>(selector)?.click()
  await wait(80)
}

type Heard = { keys: string[]; relay: number; disconnect: number }

async function openPanel(props: {
  mode: 'deterministic' | 'llm' | 'demo'
  source: 'none' | 'relay' | 'key'
  relayReady: boolean
}): Promise<Heard> {
  const heard: Heard = { keys: [], relay: 0, disconnect: 0 }
  mounted = render(ModelSwitch, {
    props: {
      ...props,
      onConnectKey: (key: string) => heard.keys.push(key),
      onConnectRelay: () => (heard.relay += 1),
      onDisconnect: () => (heard.disconnect += 1),
    },
  })
  await click('[data-model-toggle]')
  return heard
}

const keyField = () => document.querySelector<HTMLInputElement>('[data-model-key] input, #api-key')

async function type(value: string) {
  const field = keyField()
  expect(field).not.toBeNull()
  field!.value = value
  field!.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(40)
}

describe('the model switch', () => {
  it('hands the typed key over once consent is given', async () => {
    const heard = await openPanel({ mode: 'demo', source: 'none', relayReady: false })

    const connect = () => document.querySelector<HTMLButtonElement>('[data-model-connect]')
    expect(connect()?.disabled).toBe(true)

    await type('sk-ant-test')
    // A key alone is not enough: the consent line is what the screen promises.
    expect(connect()?.disabled).toBe(true)

    // Reka renders the checkbox as a button carrying the role, not as an input.
    const consent = document.querySelector<HTMLElement>('[role="checkbox"]')
    expect(consent, 'la case de consentement doit exister').not.toBeNull()
    consent!.click()
    await wait(40)
    expect(connect()?.disabled).toBe(false)

    await click('[data-model-connect]')
    expect(heard.keys).toEqual(['sk-ant-test'])
  })

  it('offers the site model when the relay is ready', async () => {
    const heard = await openPanel({ mode: 'demo', source: 'none', relayReady: true })
    expect(document.querySelector('[data-model-use-relay]')).not.toBeNull()
    await click('[data-model-use-relay]')
    expect(heard.relay).toBe(1)
  })

  it('hides the site model when the relay is not ready', async () => {
    await openPanel({ mode: 'demo', source: 'none', relayReady: false })
    expect(document.querySelector('[data-model-use-relay]')).toBeNull()
  })

  it('disconnects a connected model', async () => {
    const heard = await openPanel({ mode: 'llm', source: 'key', relayReady: false })
    await click('[data-model-disconnect]')
    expect(heard.disconnect).toBe(1)
  })

  it('does not keep the key on screen after closing the panel', async () => {
    await openPanel({ mode: 'demo', source: 'none', relayReady: false })
    await type('sk-ant-secret')

    await click('[data-model-toggle]')
    await click('[data-model-toggle]')

    expect(keyField()?.value ?? '').toBe('')
  })
})
