import { describe, expect, it } from 'vitest'
import { sanitize } from './sanitize'

/** Renders the rebuilt tree back to markup, to assert on what survived. */
function render(markup: string): { html: string; slots: readonly string[]; refused: string[] } {
  const result = sanitize(markup, document)
  const host = document.createElement('div')
  host.appendChild(result.fragment)
  return { html: host.innerHTML, slots: result.slots, refused: [...result.refused] }
}

describe('sanitising a screen written by a model', () => {
  it('keeps a plain screen and its wiring intact', () => {
    const { html, slots, refused } = render(
      '<section><label for="t">Texte</label>' +
        '<textarea id="t" data-field="texte" rows="3"></textarea>' +
        '<button data-invoke="compter">Compter</button>' +
        '<div data-output="compter"></div></section>',
    )

    expect(html).toContain('data-invoke="compter"')
    expect(html).toContain('data-field="texte"')
    expect(html).toContain('rows="3"')
    expect(slots).toEqual(['compter'])
    expect(refused).toEqual([])
  })

  it('drops a script whole — its source must not come through as text', () => {
    const { html, refused } = render('<p>avant</p><script>fetch("//ailleurs")</script><p>après</p>')

    expect(html).toBe('<p>avant</p><p>après</p>')
    expect(html).not.toContain('fetch')
    expect(refused).toContain('<script>')
  })

  it('drops every event handler, whatever its casing', () => {
    const { html, refused } = render(
      '<button data-invoke="a" OnClick="steal()" onmouseover="x">Go</button>',
    )

    expect(html).not.toContain('nclick')
    expect(html).not.toContain('steal')
    expect(html).toContain('data-invoke="a"')
    expect(refused).toEqual(expect.arrayContaining(['attribut onclick', 'attribut onmouseover']))
  })

  it('refuses a frame, a link and an anchor: nothing navigates, nothing loads', () => {
    const { html, refused } = render(
      '<iframe src="//ailleurs"></iframe><link rel="stylesheet" href="//ailleurs">' +
        '<a href="https://ailleurs">partir</a>',
    )

    expect(html).toBe('')
    expect(refused).toEqual(expect.arrayContaining(['<iframe>', '<link>', '<a>']))
  })

  it('unwraps an unknown tag but keeps its text', () => {
    const { html, refused } = render('<marquee><p>toujours là</p></marquee>')

    expect(html).toBe('<p>toujours là</p>')
    expect(refused).toContain('<marquee>')
  })

  it('refuses a slot name that is not a name', () => {
    const { html, slots, refused } = render('<button data-invoke="../../etc">x</button>')

    expect(html).not.toContain('data-invoke')
    expect(slots).toEqual([])
    expect(refused.join(' ')).toContain('nom invalide')
  })

  it('lists each slot once, in order of first appearance', () => {
    const { slots } = render(
      '<button data-invoke="trier">a</button>' +
        '<button data-invoke="compter">b</button>' +
        '<button data-invoke="trier">c</button>',
    )

    expect(slots).toEqual(['trier', 'compter'])
  })

  it('keeps aria attributes: accessibility must survive the pass', () => {
    const { html } = render('<button data-invoke="a" aria-label="Compter les syllabes">x</button>')

    expect(html).toContain('aria-label="Compter les syllabes"')
  })

  it('refuses a file input, keeps a number input', () => {
    const { html, refused } = render(
      '<input type="file" data-field="a"><input type="number" data-field="b">',
    )

    expect(html).not.toContain('type="file"')
    expect(html).toContain('type="number"')
    expect(refused).toContain('type="file"')
  })

  it('bounds a screen that would flood the frame', () => {
    const { refused } = render('<p>x</p>'.repeat(900))

    expect(refused.join(' ')).toContain('écran trop grand')
  })

  it('never lets a style attribute through', () => {
    const { html, refused } = render('<div style="position:fixed;inset:0">x</div>')

    expect(html).not.toContain('style')
    expect(refused).toContain('attribut style')
  })
})
