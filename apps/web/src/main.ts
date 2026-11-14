import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import './assets/main.css'
import App from './App.vue'
import { createAppRouter } from './router'

createApp(App).use(createAppRouter()).use(ui).mount('#app')
