import ui from '@nuxt/ui/vue-plugin'
import { createClient } from '@cordisjs/client'
import home from './home'
import layout from './layout'
import settings from './settings'
import status from './status'
import styles from './styles'
import theme from './theme'

import '../../assets/main.css'
import './index.scss'

// Upstream boots against a cordis application running on a server and talks to
// it over a WebSocket (`connect`, `global.endpoint`). This product's engine
// runs in the browser, so there is no endpoint to reach and the transport is
// gone rather than stubbed: `plugins/rpc.ts` stays unused until something
// actually needs to cross a process boundary.
//
// `virtual:uno.css` is gone with unocss. Tailwind 4 and Nuxt UI's own styles
// arrive through `assets/main.css`.

const root = createClient()

// Nuxt UI's Vue plugin registers its components and app config on the app
// instance the client service created for itself.
root.client.app.use(ui)

root.plugin(home)
root.plugin(layout)
root.plugin(settings)
root.plugin(status)
root.plugin(styles)
root.plugin(theme)

root.client.mount('#app')
