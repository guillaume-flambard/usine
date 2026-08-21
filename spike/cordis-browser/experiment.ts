// Spike — Cordis inside a browser bundle.
// Checks: reversible effect, cascade, reactive coeffect, component generated
// at runtime.
import { Context, FiberState } from 'cordis'

interface Component {
  name: string
  inject?: string[]
  provide?: string[]
  apply(c: Context): void
}

export interface Check {
  id: string
  label: string
  ok: boolean
  detail: string
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const stateName = (state: FiberState): string =>
  ({
    [FiberState.PENDING]: 'PENDING',
    [FiberState.LOADING]: 'LOADING',
    [FiberState.ACTIVE]: 'ACTIVE',
    [FiberState.FAILED]: 'FAILED',
    [FiberState.DISPOSED]: 'DISPOSED',
    [FiberState.UNLOADING]: 'UNLOADING',
  })[state] ?? String(state)

export async function runExperiment(): Promise<Check[]> {
  const checks: Check[] = []
  const add = (id: string, label: string, ok: boolean, detail: string) =>
    checks.push({ id, label, ok, detail })

  const ctx = new Context()

  // --- 1. Reversible effect, teardown in reverse order ----------------------
  const trace: string[] = []
  const toolA = {
    name: 'tool-A',
    apply(c: Context) {
      c.effect(() => {
        trace.push('open:1')
        return () => trace.push('close:1')
      }, 'resource-1')
      c.effect(() => {
        trace.push('open:2')
        return () => trace.push('close:2')
      }, 'resource-2')
    },
  }
  const fiberA = await ctx.plugin(toolA)
  const opened = trace.join(',') === 'open:1,open:2'
  add('1a', 'A component loads and installs its effects', opened, trace.join(' → '))

  await fiberA.dispose()
  const reversed = trace.join(',') === 'open:1,open:2,close:2,close:1'
  add('1b', 'dispose() undoes the effects in reverse order', reversed, trace.join(' → '))

  // --- 2. Cascade: unloading the master releases the child ------------------
  const cascade: string[] = []
  const child = {
    name: 'child',
    apply(c: Context) {
      c.effect(() => {
        cascade.push('child:open')
        return () => cascade.push('child:close')
      }, 'child')
    },
  }
  const master = {
    name: 'master',
    apply(c: Context) {
      c.plugin(child)
    },
  }
  const fiberM = await ctx.plugin(master)
  await tick()
  const childAlive = cascade.includes('child:open')
  add('2a', 'The master spawns a child component', childAlive, cascade.join(' → '))

  await fiberM.dispose()
  await tick()
  const childReleased = cascade.includes('child:close')
  add('2b', 'Unloading the master cascades to its child', childReleased, cascade.join(' → '))

  // --- 3. Reactive coeffect: activation / deactivation ----------------------
  let activations = 0
  let deactivations = 0
  const registryTool = {
    name: 'registry-tool',
    provide: ['registry'],
    apply(c: Context) {
      c.provide('registry', { check: (t: string) => t.includes('guérit') })
    },
  }
  const checkerAgent = {
    name: 'checker-agent',
    inject: ['registry'],
    apply(c: Context) {
      activations++
      c.effect(
        () => () => {
          deactivations++
        },
        'checker-agent',
      )
    },
  }

  const fiberAgent = await ctx.plugin(checkerAgent)
  await tick()
  const pending = activations === 0 && fiberAgent.state === FiberState.PENDING
  add(
    '3a',
    'The agent stays inactive while its dependency is missing',
    pending,
    `activations=${activations} state=${stateName(fiberAgent.state)}`,
  )

  const fiberTool = await ctx.plugin(registryTool)
  await tick()
  const activated = activations === 1
  add(
    '3b',
    'The agent activates by itself when the dependency arrives',
    activated,
    `activations=${activations}`,
  )

  await fiberTool.dispose()
  await tick()
  const deactivated = deactivations === 1
  add(
    '3c',
    'The agent deactivates by itself when the dependency leaves',
    deactivated,
    `deactivations=${deactivations}`,
  )

  const fiberTool2 = await ctx.plugin(registryTool)
  await tick()
  const reactivated = activations === 2
  add(
    '3d',
    'The agent reactivates when the dependency comes back (hot swap)',
    reactivated,
    `activations=${activations}`,
  )

  // --- 4. Generating a component at runtime ---------------------------------
  // The spec is produced "by an upstream agent"; the component does not exist
  // before the run.
  const spec = { name: 'generated-agent', message: 'fabriqué pendant le run' }
  let generatedActive = false
  let source = ''
  let generatedOk = false
  let generatedDetail = ''
  try {
    source = `return {
      name: ${JSON.stringify(spec.name)},
      inject: ['registry'],
      apply(c) {
        c.effect(() => {
          report(true, ${JSON.stringify(spec.message)});
          return () => report(false, 'retiré');
        });
      },
    }`
    const factory = new Function('report', source) as (
      r: (active: boolean, m: string) => void,
    ) => Component
    const generated = factory((active, m) => {
      generatedActive = active
      generatedDetail = m
    })
    const fiberGenerated = await ctx.plugin(generated)
    await tick()
    generatedOk = generatedActive
    add(
      '4a',
      'A component built at runtime loads and runs',
      generatedOk,
      generatedDetail || 'no effect observed',
    )
    await fiberGenerated.dispose()
    await tick()
    add('4b', 'The built component withdraws cleanly', generatedActive === false, generatedDetail)
  } catch (error) {
    add('4a', 'A component built at runtime loads and runs', false, String(error))
    add('4b', 'The built component withdraws cleanly', false, 'not reached')
  }

  // --- 4bis. Generation WITHOUT eval, by composing primitives ---------------
  // Same promise (the component did not exist before the run) without relying
  // on 'unsafe-eval'.
  interface ComponentSpec {
    name: string
    dependencies: string[]
    steps: Array<{ operation: 'announce' | 'derive'; value: string }>
  }
  const primitives = {
    announce: (value: string, log: string[]) => () => {
      log.push(`announce:${value}`)
      return () => log.push(`announce:${value}:removed`)
    },
    derive: (value: string, log: string[]) => () => {
      log.push(`derive:${value.toUpperCase()}`)
      return () => log.push(`derive:${value.toUpperCase()}:removed`)
    },
  }
  const compile = (spec: ComponentSpec, log: string[]): Component => ({
    name: spec.name,
    inject: spec.dependencies,
    apply(c: Context) {
      for (const step of spec.steps) {
        c.effect(primitives[step.operation](step.value, log), step.operation)
      }
    },
  })

  const composedLog: string[] = []
  const specFromAnAgent: ComponentSpec = {
    name: 'composed-agent',
    dependencies: ['registry'],
    steps: [
      { operation: 'announce', value: 'allegations' },
      { operation: 'derive', value: 'verdict' },
    ],
  }
  const fiberComposed = await ctx.plugin(compile(specFromAnAgent, composedLog))
  await tick()
  add(
    '4c',
    'A component built by composition, without eval, loads and runs',
    composedLog.join(',') === 'announce:allegations,derive:VERDICT',
    composedLog.join(' → '),
  )
  await fiberComposed.dispose()
  await tick()
  add(
    '4d',
    'The composed component withdraws cleanly',
    composedLog.length === 4,
    composedLog.join(' → '),
  )

  // --- 5. Topology introspection --------------------------------------------
  const size = ctx.registry.size
  add(
    '5a',
    'The runtime exposes its topology (registry.size)',
    typeof size === 'number',
    `registry.size=${size}, counter=${ctx.registry.counter}`,
  )

  await fiberTool2.dispose()
  await fiberAgent.dispose()

  return checks
}
