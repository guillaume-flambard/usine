import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
// Served by the app itself: the page policy allows `font-src 'self'` only.
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './assets/main.css'
import App from './App.vue'
import { createAppRouter } from './router'

createApp(App).use(createAppRouter()).use(ui).mount('#app')
