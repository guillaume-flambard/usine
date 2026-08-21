// Sanitising a screen written by a model.
//
// The method matters more than the list: the markup is **parsed and rebuilt**
// node by node, never assigned as a string. Anything not explicitly allowed
// does not survive the rebuild, so a tag or an attribute nobody thought about
// is dropped by default rather than by a pattern that failed to match it.
//
// This is not the only line of defence, and it must not be treated as one. The
// frame is sandboxed with an opaque origin and serves its own strict policy;
// this pass exists so that what an agent writes stays a *screen* — markup that
// declares which behaviours to call — instead of drifting into logic that
// would escape hot replacement.

/**
 * Tags a screen may use. Everything else is dropped, children included.
 *
 * Exporté parce que le fichier emporté doit assainir de la même façon : deux
 * copies de cette liste finiraient par diverger, et la divergence
 * produirait un fichier qui n'affiche pas ce que le produit affichait.
 */
export const TAGS = new Set([
  'section',
  'header',
  'main',
  'footer',
  'article',
  'div',
  'p',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption',
  'label',
  'strong',
  'em',
  'small',
  'code',
  'pre',
  'br',
  'hr',
  'fieldset',
  'legend',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'optgroup',
  'output',
  'progress',
  'meter',
])

/** Tags whose content is dropped with them rather than unwrapped. */
const HOSTILE = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
  'svg',
  'math',
  'form',
  'a',
  'img',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'portal',
])

/** Attributes a screen may carry. `aria-*` and `data-*` are handled apart. */
export const ATTRIBUTES = new Set([
  'class',
  'id',
  'for',
  'name',
  'type',
  'placeholder',
  'rows',
  'cols',
  'maxlength',
  'min',
  'max',
  'step',
  'value',
  'role',
  'colspan',
  'rowspan',
  'lang',
  'dir',
  'title',
  'multiple',
  'selected',
  'checked',
])

/**
 * `type` values allowed on an input. `file` would open a picker, `image` and
 * `button` carry their own behaviours, and a `submit` has nothing to submit.
 */
const INPUT_TYPES = new Set([
  'text',
  'number',
  'search',
  'email',
  'url',
  'tel',
  'date',
  'time',
  'range',
  'checkbox',
  'radio',
  'color',
])

/** The three attributes that carry the whole declarative vocabulary. */
export const WIRING = new Set(['data-invoke', 'data-field', 'data-output'])

const NAME = /^[a-z][a-z0-9-]{0,63}$/

export interface Sanitised {
  /** The rebuilt tree, ready to be adopted into the frame's document. */
  fragment: DocumentFragment
  /** Behaviour names the screen calls, in order of first appearance. */
  slots: readonly string[]
  /** What was refused, deduplicated, so an agent can be told and correct it. */
  refused: readonly string[]
}

/**
 * Parses markup and rebuilds it against the allow-list.
 *
 * @param markup what the agent wrote
 * @param document the frame's document — the rebuilt nodes belong to it
 */
export function sanitize(markup: string, document: Document): Sanitised {
  const refused = new Set<string>()
  const slots: string[] = []
  const parsed = new DOMParser().parseFromString(markup, 'text/html')
  const fragment = document.createDocumentFragment()
  const budget = { left: MAX_NODES }

  rebuildChildren(parsed.body, fragment, document, refused, slots, 0, budget)

  return { fragment, slots, refused: [...refused] }
}

/** How many nodes a screen may still produce. Shared across the whole walk. */
interface Budget {
  left: number
}

/** Depth bound: a deeply nested screen is a screen that recurses on us. */
const MAX_DEPTH = 32
/** Node bound: a screen is an interface, not a document dump. */
const MAX_NODES = 800

function rebuildChildren(
  source: Node,
  target: Node,
  document: Document,
  refused: Set<string>,
  slots: string[],
  depth: number,
  budget: Budget,
): void {
  if (depth > MAX_DEPTH) {
    refused.add('profondeur maximale dépassée')
    return
  }

  for (const child of Array.from(source.childNodes)) {
    if (budget.left <= 0) {
      refused.add('écran trop grand, la fin a été coupée')
      return
    }
    if (child.nodeType === 3 /* text */) {
      budget.left -= 1
      target.appendChild(document.createTextNode(child.nodeValue ?? ''))
      continue
    }
    if (child.nodeType !== 1 /* element */) continue

    const element = child as Element
    const tag = element.tagName.toLowerCase()

    if (HOSTILE.has(tag)) {
      // Dropped whole: unwrapping a `<script>` would hand its source through
      // as text, and unwrapping an `<a>` would lose the reason it was refused.
      refused.add(`<${tag}>`)
      continue
    }

    if (!TAGS.has(tag)) {
      // Unknown but not hostile: the wrapper goes, the content stays. A screen
      // that used an unexpected tag for grouping should not lose its text.
      refused.add(`<${tag}>`)
      rebuildChildren(element, target, document, refused, slots, depth + 1, budget)
      continue
    }

    budget.left -= 1
    const rebuilt = document.createElement(tag)
    copyAttributes(element, rebuilt, tag, refused, slots)
    target.appendChild(rebuilt)
    rebuildChildren(element, rebuilt, document, refused, slots, depth + 1, budget)
  }
}

function copyAttributes(
  source: Element,
  target: Element,
  tag: string,
  refused: Set<string>,
  slots: string[],
): void {
  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value

    // Event handlers are the whole reason this pass exists. They are named
    // first so no later branch can let one through by accident.
    if (name.startsWith('on')) {
      refused.add(`attribut ${name}`)
      continue
    }

    if (WIRING.has(name)) {
      if (!NAME.test(value)) {
        refused.add(`${name}="${value.slice(0, 32)}" — nom invalide`)
        continue
      }
      target.setAttribute(name, value)
      if (name === 'data-invoke' && !slots.includes(value)) slots.push(value)
      continue
    }

    if (name.startsWith('aria-')) {
      target.setAttribute(name, value.slice(0, 200))
      continue
    }

    if (name === 'type' && tag === 'input') {
      // An unknown type falls back to text rather than being dropped: an
      // input with no type still works, but saying so helps the agent.
      if (INPUT_TYPES.has(value)) target.setAttribute('type', value)
      else refused.add(`type="${value.slice(0, 32)}"`)
      continue
    }

    if (!ATTRIBUTES.has(name)) {
      refused.add(`attribut ${name}`)
      continue
    }

    target.setAttribute(name, value.slice(0, 400))
  }
}
