import ui from '@nuxt/ui/vue-plugin'
import { createClient } from '@cordisjs/client'
import layout from '../client/app/layout'
import settings from '../client/app/settings'
import status from '../client/app/status'
import styles from '../client/app/styles'
import theme from '../client/app/theme'
import home from './home'
import run from './run'

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

// Theirs, unchanged.
root.plugin(layout)
root.plugin(settings)
root.plugin(status)
root.plugin(styles)
root.plugin(theme)

// Ours, in place of theirs: the home page they ship gates everything on a
// socket that will never exist.
root.plugin(home)
root.plugin(run)

// Their loading gate only opens on an `entry:init` that a server emits. With no
// server it never opens and the shell spins forever, so it is opened here with
// their own event, declaring what is true: zero remote entries, every view
// local and already registered above.
root.emit('entry:init', { version: 'local', entries: {} })

root.client.mount('#app')
