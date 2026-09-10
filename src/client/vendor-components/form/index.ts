import { computed, getCurrentInstance } from 'vue'
import type { App, Component, WritableComputedRef } from 'vue'
import Schema from 'schemastery'

// Upstream delegates the whole schema-driven form to `schemastery-vue`, which
// is built on Element Plus. Keeping it would have pulled a second component
// library back in through the settings pane, so the surface it exposed is
// re-declared here and will be backed by Nuxt UI form components
// (`UForm`, `UFormField`, `UInput`, `USelect`, `USwitch`).
//
// Only what the vendored shell actually consumes is declared: the extension
// registry (`plugins/setting.ts` adds and removes entries), `useModel`, which
// every control calls to reach the value it edits, and the plugin install
// hook. Widgets are registered as they are ported, one schema type at a time,
// so an unported type fails loudly instead of rendering an empty box.

export interface Extension {
  type: string
  role?: string
  component: Component
  important?: boolean
  validate?: (value: unknown, schema: Schema) => boolean
}

const extensions = new Set<Extension>()

function resolve(type: string, role?: string): Extension | undefined {
  let fallback: Extension | undefined
  for (const extension of extensions) {
    if (extension.type !== type) continue
    if (extension.role === role) return extension
    if (!extension.role) fallback ??= extension
  }
  return fallback
}

// A control is always rendered inside a component that owns `modelValue` and
// emits `update:modelValue`; upstream reached that pair through the schema
// form's own machinery. Reading it off the current instance keeps every ported
// control's call site unchanged.
function useModel<T = any>(): WritableComputedRef<T> {
  const instance = getCurrentInstance()
  if (!instance) {
    throw new Error('SchemaBase.useModel() must be called during setup()')
  }
  return computed<T>({
    get: () => (instance.props as Record<string, any>).modelValue,
    set: (value) => instance.emit('update:modelValue', value),
  })
}

export const SchemaBase = {
  extensions,
  resolve,
  useModel,
  install(_app: App) {
    // No global widget registration yet: see the note above.
  },
}

// Upstream wrote this type as `SchemaBase.Extension`. A namespace cannot
// merge with a const, so it is exported on its own and the one call site was
// updated to match.
export default SchemaBase

export { Schema, extensions, resolve, useModel }
