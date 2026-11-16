/**
 * An assistant answer, rendered as Markdown (Nuxt UI 4, Vue: Comark,
 * https://ui.nuxt.com/docs/components/chat). Before this, answers showed raw
 * `##` and `**`.
 *
 * The text comes from a model, so it is untrusted. Comark builds virtual nodes,
 * never `innerHTML`, and parses no raw HTML without its `html` plugin, which is
 * not loaded. Its security plugin also drops unsafe attributes and links
 * (`on*`, `javascript:`). The browser test holds both.
 */
import { defineMarkdownComponent } from '@comark/vue'
import security from '@comark/vue/plugins/security'

export default defineMarkdownComponent({
  name: 'AnswerMarkdown',
  plugins: [security()],
  class: '*:first:mt-0 *:last:mb-0',
})
