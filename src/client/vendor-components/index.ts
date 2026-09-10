import { ref } from 'vue'
import type { App } from 'vue'
import form from './form'
import Comment from './k-comment.vue'

// `./virtual` is gone. It was a virtual list registered globally and rendered
// by nothing: not by the shell, not by the product. It carried 22 of the type
// errors this tree owed, all in code no screen executes. It comes back from the
// upstream tarball the day something actually needs to scroll a hundred
// thousand rows.

import './index.scss'

// Upstream took this ref from `schemastery-vue`, which left with Element Plus.
// The client service writes it from the saved settings on every change, and
// `useI18nText` reads it, so it has to exist before anything renders. French
// is the default because the product's interface is French; upstream defaulted
// to `en-US` and its own writer still overrides this on boot.
export const locale = ref('fr-FR')

// Also lost with `schemastery-vue`. A label in this codebase is either a plain
// string or a dictionary keyed by locale; `tt` picks the right one. It falls
// back rather than returning nothing, because an untranslated label still has
// to be readable: a missing translation must not blank the activity bar.
export function useI18nText() {
  return (value?: string | Record<string, string>): string => {
    if (!value) return ''
    if (typeof value === 'string') return value
    return value[locale.value] ?? value['en-US'] ?? Object.values(value)[0] ?? ''
  }
}

export * from 'cosmokit'
export * from './form'

export default function (app: App) {
  app.use(form)
  app.component('k-comment', Comment)
}
