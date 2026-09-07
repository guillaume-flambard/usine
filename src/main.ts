import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import './assets/main.css'
import './assets/tokens.css'
import './assets/app.css'
import App from './App.vue'

createApp(App).use(ui).mount('#app')
