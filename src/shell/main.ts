import ui from '@nuxt/ui/vue-plugin'
import { createClient } from '@cordisjs/client'
import layout from '../client/app/layout'
import styles from '../client/app/styles'
import theme from '../client/app/theme'
import page from './page'

import '../assets/main.css'
import '../client/app/index.scss'

// The product's entry point into the vendored console shell.
//
// The dependency runs this way round on purpose. `src/client/` is judged by its
// author's compiler settings (`tsconfig.client.json`), which are looser than
// ours: had the vendored entry imported our code, our code would be compiled
// there too, and loose settings silently mis-type code written for strict ones.
// It is not theoretical: `src/agents/recall.ts` collapses to `never` under
// `strictNullChecks: false`. So the vendored tree imports nothing of ours, and
// this file composes it instead. `src/client/app/index.ts` is their entry, kept
// for reference and unused.
//
// Their transport is gone with it: this product's engine runs in the browser,
// so there is no `connect()` and no WebSocket.

const root = createClient()

// Nuxt UI registers its components on the app instance the client service made.
root.client.app.use(ui)

// Theirs, minus what only their product could fill.
//
// `settings` is gone: it registered a second entry in the activity bar, named
// `用户设置`, holding the preferences of a bot console. `status` is gone with
// the bar it sat in, and with it the reasoning trace that had nothing left to
// report: no view drives a run since the chat page was removed, so the strip
// could only ever be empty.
root.plugin(layout)
root.plugin(styles)
root.plugin(theme)

// Ours, in place of theirs. Their home page gates everything on a socket that
// will never exist. One page replaces it, and it is the whole product: what
// the lab's agents are doing, and what they are asking to change.
root.plugin(page)

// Their loading gate only opens on an `entry:init` that a server emits. With no
// server it never opens and the shell spins forever, so it is opened here with
// their own event, declaring what is true: zero remote entries, every view
// local and already registered above.
root.emit('entry:init', { version: 'local', entries: {} })

root.client.mount('#app')
