import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import './assets/main.css'
import './assets/app.css'
import App from './App.vue'

// The library's components resolve links through the router, so one has to be
// there. This application has no routing and does not want any: a memory
// history keeps vue-router away from the address bar, which the shell writes
// itself when it replays a run, and a single catch-all keeps it from warning
// about a location it was never meant to match.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:rest(.*)', component: { render: () => null } }],
})

createApp(App).use(router).use(ui).mount('#app')
