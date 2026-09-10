import { defineComponent, h, markRaw, reactive, resolveComponent } from 'vue'
import type { App, Component } from 'vue'
import Default from './activity/default.vue'
import Ellipsis from './activity/ellipsis.vue'
import Home from './activity/home.vue'
import Moon from './activity/moon.vue'
import Settings from './activity/settings.vue'
import Sun from './activity/sun.vue'
import ArrowLeft from './svg/arrow-left.vue'
import ArrowRight from './svg/arrow-right.vue'
import BoxOpen from './svg/box-open.vue'
import CheckFull from './svg/check-full.vue'
import ChevronDown from './svg/chevron-down.vue'
import ChevronLeft from './svg/chevron-left.vue'
import ChevronRight from './svg/chevron-right.vue'
import ChevronUp from './svg/chevron-up.vue'
import ClipboardList from './svg/clipboard-list.vue'
import Download from './svg/download.vue'
import Edit from './svg/edit.vue'
import ExclamationFull from './svg/exclamation-full.vue'
import Expand from './svg/expand.vue'
import FileArchive from './svg/file-archive.vue'
import Filter from './svg/filter.vue'
import GitHub from './svg/github.vue'
import GitLab from './svg/gitlab.vue'
import InfoFull from './svg/info-full.vue'
import Koishi from './svg/koishi.vue'
import Link from './svg/link.vue'
import PaperPlane from './svg/paper-plane.vue'
import Pause from './svg/pause.vue'
import Play from './svg/play.vue'
import QuestionEmpty from './svg/question-empty.vue'
import Redo from './svg/redo.vue'
import Refresh from './svg/refresh.vue'
import Search from './svg/search.vue'
import SearchMinus from './svg/search-minus.vue'
import SearchPlus from './svg/search-plus.vue'
import StarEmpty from './svg/star-empty.vue'
import StarFull from './svg/star-full.vue'
import Start from './svg/start.vue'
import Tag from './svg/tag.vue'
import TimesFull from './svg/times-full.vue'
import Tools from './svg/tools.vue'
import Trash from './svg/trash.vue'
import Undo from './svg/undo.vue'
import User from './svg/user.vue'

import './style.scss'

const registry: Record<string, Component> = reactive({})

register('activity:default', Default)
register('activity:ellipsis', Ellipsis)
register('activity:home', Home)
register('activity:moon', Moon)
register('activity:settings', Settings)
register('activity:sun', Sun)

register('arrow-up', fromNuxtUi('i-lucide-arrow-up'))
register('arrow-down', fromNuxtUi('i-lucide-arrow-down'))
register('arrow-left', ArrowLeft)
register('arrow-right', ArrowRight)
register('box-open', BoxOpen)
register('check-full', CheckFull)
register('chevron-down', ChevronDown)
register('chevron-left', ChevronLeft)
register('chevron-right', ChevronRight)
register('chevron-up', ChevronUp)
register('clipboard-list', ClipboardList)
register('close', fromNuxtUi('i-lucide-x'))
register('delete', fromNuxtUi('i-lucide-trash-2'))
register('download', Download)
register('edit', Edit)
register('ellipsis', fromNuxtUi('i-lucide-ellipsis'))
register('exclamation-full', ExclamationFull)
register('expand', Expand)
register('external', fromNuxtUi('i-lucide-external-link'))
register('eye-slash', fromNuxtUi('i-lucide-eye-off'))
register('eye', fromNuxtUi('i-lucide-eye'))
register('file-archive', FileArchive)
register('filter', Filter)
register('github', GitHub)
register('gitlab', GitLab)
register('info-full', InfoFull)
register('koishi', Koishi)
register('link', Link)
register('paper-plane', PaperPlane)
register('pause', Pause)
register('play', Play)
register('add', fromNuxtUi('i-lucide-plus'))
register('question-empty', QuestionEmpty)
register('redo', Redo)
register('refresh', Refresh)
register('search', Search)
register('search-minus', SearchMinus)
register('search-plus', SearchPlus)
register('star-empty', StarEmpty)
register('star-full', StarFull)
register('start', Start)
register('tag', Tag)
register('times-full', TimesFull)
register('tools', Tools)
register('trash', Trash)
register('undo', Undo)
register('user', User)

export function register(name: string, component: Component) {
  registry[name] = markRaw(component)
}

// Nine icons used to come from `schemastery-vue`, which left with Element
// Plus. They are drawn by Nuxt UI's own icon component instead of being
// re-vendored: `UIcon` resolves Lucide names through the iconify collection
// Nuxt UI already ships, so no new asset and no new dependency enters.
function fromNuxtUi(name: string): Component {
  return defineComponent({
    name: `Icon${name}`,
    setup: () => () => h(resolveComponent('UIcon'), { name }),
  })
}

export function install(app: App) {
  app.component(
    'k-icon',
    defineComponent({
      props: {
        name: String,
      },
      // `render` reçoit les props déclarées juste au-dessus ; les nommer ici
      // évite un `any` implicite sans changer le composant.
      render(props: { name?: string }) {
        const component = props.name === undefined ? undefined : registry[props.name]
        return component && h(component)
      },
    }),
  )
}
