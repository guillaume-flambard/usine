// The served security policy is a contract, not a comment.
// This test reads the file actually copied into the image.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const nginx = readFileSync(
  fileURLToPath(new URL('../../../deployment/nginx.conf', import.meta.url)),
  'utf-8',
)
const index = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf-8')

// Two hosts share this file: the public showcase, and the workshop behind a
// password. They carry different policies on purpose, so a test that reads
// "the" policy would only ever guard the first one it found.
const [vitrine, atelier] = nginx.split(/\nserver \{\n/).slice(1)

const policyOf = (section: string) => section.match(/set \$policy "([^"]+)"/)?.[1] ?? ''
const directiveOf = (section: string, name: string) =>
  policyOf(section)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `)) ?? ''

const policy = policyOf(vitrine)
const directive = (name: string) => directiveOf(vitrine, name)

describe('the served security policy', () => {
  it('exists and covers everything by default', () => {
    expect(policy.length).toBeGreaterThan(50)
    expect(directive('default-src')).toBe("default-src 'self'")
  })

  it('only allows evaluation for the code the agents write', () => {
    // A deliberate trade-off: without `unsafe-eval`, an agent can only assemble
    // a closed vocabulary and nothing unexpected ever comes out of a run.
    expect(directive('script-src')).toBe("script-src 'self' 'unsafe-eval'")
    // What is not negotiable: no external script source.
    expect(directive('script-src')).not.toMatch(/https?:/)
    expect(policy).not.toContain("unsafe-inline'; script")
  })

  it('only opens the network toward the connected mode provider', () => {
    const connect = directive('connect-src')
    expect(connect).toContain("'self'")
    expect(connect).toContain('https://api.anthropic.com')
    // Nothing else: one more address would be one more leak.
    expect(connect.split(/\s+/).filter((part) => part.startsWith('http'))).toEqual([
      'https://api.anthropic.com',
    ])
  })

  it('allows exactly the hosts the page really loads', () => {
    const hosts = [...index.matchAll(/https:\/\/([a-z.]+)/g)].map((m) => m[1])
    for (const host of new Set(hosts)) {
      expect(policy, `host ${host} is loaded but not allowed`).toContain(host as string)
    }
  })

  it('closes the classic vectors', () => {
    for (const expected of [
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(policy).toContain(expected)
    }
  })

  it('opens frames only to ourselves, and to nothing else', () => {
    // The single loosening the live application asked for. The frame it
    // allows is a page we serve, sandboxed without `allow-same-origin`.
    expect(directive('frame-src')).toBe("frame-src 'self'")
  })

  it('redeclares the headers in every block, for lack of inheritance', () => {
    // nginx does not inherit `add_header` as soon as a block declares one:
    // forgetting them would serve the assets with no policy.
    const blocks = [vitrine, atelier]
      .flatMap((section) => section.split('location ').slice(1))
      // The frame serves its own policy, stricter than the host's; it is the
      // one block that must *not* carry `$policy`. The workshop's 404 answers
      // before any body exists, so it carries no header either.
      .filter((block) => !block.startsWith('= /sandbox.html'))
      .filter((block) => !block.startsWith('= /atelier.html'))
    expect(blocks).toHaveLength(6)
    for (const block of blocks) {
      expect(block).toContain('add_header Content-Security-Policy $policy')
      expect(block).toContain('X-Content-Type-Options')
      expect(block).toContain('Referrer-Policy')
    }
  })

  it('keeps the model relay on the same origin, and on the loopback', () => {
    // A third-party origin would force opening `connect-src` and handling
    // CORS; above all, the relay's key must never travel client-side. The
    // relay lives in the same container, so nginx never leaves the machine.
    const block = vitrine.split('location ~ ^/api/')[1]?.split('location ')[0] ?? ''
    expect(block).toContain('proxy_pass http://127.0.0.1:3000/')
    expect(block).not.toMatch(/proxy_pass https?:\/\/(?!127\.0\.0\.1)/)
    // The visitor's address is forwarded: without it the relay would see one
    // address for the whole planet and its per-minute cap would be shared.
    expect(block).toContain('X-Forwarded-For')
    expect(directive('connect-src')).toContain("'self'")
  })

  it('does not let the index become immutable', () => {
    const root = vitrine.split('location /assets/')[1]?.split('location /')[1] ?? ''
    expect(root).toContain('no-cache')
  })
})

describe("the isolated frame's own policy", () => {
  const frame =
    nginx.match(/location = \/sandbox\.html \{[\s\S]*?Content-Security-Policy "([^"]+)"/)?.[1] ??
    ''

  it('is stricter than the host page, not laxer', () => {
    expect(frame).toContain("default-src 'none'")
    // No evaluation: the code an agent writes runs in the isolated thread, in
    // the host, never here. The frame only ever renders markup.
    expect(frame).not.toContain('unsafe-eval')
    // And it talks to nobody: everything it needs comes by message.
    expect(frame).toContain("connect-src 'none'")
  })

  it('names the host explicitly, because an opaque origin has no `self`', () => {
    // The frame is sandboxed without `allow-same-origin`, so `'self'` would
    // match nothing and its own bridge would be blocked.
    expect(frame).toContain('script-src $client_scheme://$host')
    expect(frame).not.toContain("script-src 'self'")
  })

  it('names the scheme the client sees, not the one nginx sees', () => {
    // Traefik terminates TLS and speaks plain HTTP to this container, so
    // `$scheme` is `http` there while the visitor is on `https`. A policy
    // built on it names the wrong origin, and the bridge — which cannot fall
    // back on `'self'` — gets nothing. Measured in production on 2026-09-07:
    // `/sandbox.html` answered 200 and its module was never requested.
    expect(frame).not.toContain('$scheme://')
    expect(nginx).toMatch(/map \$http_x_forwarded_proto \$client_scheme \{/)
    // The fallback matters as much: served with no proxy in front, nginx's own
    // scheme is the right one.
    expect(nginx).toMatch(/default \$scheme;/)
  })

  it('lets the opaque origin read the bridge it is told to load', () => {
    // Naming the host is not enough. The bridge is an ES module, and a module
    // is always fetched in CORS mode — the bundler's `crossorigin` attribute
    // changes nothing. From an opaque origin the request carries `Origin:
    // null`, so without this header the browser refuses the response before
    // executing it: the bridge never announces itself and no screen mounts.
    // Measured in production on 2026-09-07.
    const assets =
      nginx.match(/location \/assets\/ \{([\s\S]*?)\n  \}/)?.[1] ?? ''
    expect(assets).toMatch(/add_header Access-Control-Allow-Origin "\*" always;/)
  })
})


describe("the workshop's own host", () => {
  it('is served under its own name, not under a path', () => {
    // The password Traefik puts on this host only holds if the page has no
    // other way in. A path on the showcase would have been served by the
    // showcase's router, without the middleware.
    expect(atelier).toContain('server_name atelier.memolabs.dev')
    expect(vitrine).toContain('server_name _')
    // And the showcase is the default host, explicitly. Without the keyword,
    // nginx makes the FIRST block the default: the day the workshop moved up
    // the file it would answer every unknown `Host`, outside the password
    // Traefik only puts on the `atelier` router.
    expect(vitrine).toContain('listen 80 default_server')
    expect(atelier).not.toContain('default_server')
  })

  it('is refused by the public showcase', () => {
    const refusal = vitrine.split('location = /atelier.html')[1]?.split('location ')[0] ?? ''
    expect(refusal).toContain('return 404')
  })

  it('carries a stricter policy than the showcase, never a laxer one', () => {
    // It runs no model-written code, mounts no sandboxed frame, and talks to
    // no provider. Every loosening the showcase pays for would be unpaid here.
    expect(directiveOf(atelier, 'script-src')).toBe("script-src 'self'")
    expect(policyOf(atelier)).not.toContain('unsafe-eval')
    expect(directiveOf(atelier, 'connect-src')).toBe("connect-src 'self'")
    expect(directiveOf(atelier, 'frame-src')).toBe("frame-src 'none'")
  })

  it('is the only host that reaches the service', () => {
    // `/flotte` and `/portes` carry no authentication of their own, and one of
    // them rewrites the prompts the agents run in production. The password on
    // this host is the whole gate.
    const block = atelier.split('location ~ ^/api/')[1]?.split('location ')[0] ?? ''
    expect(block).toContain('proxy_pass http://127.0.0.1:3111/')
    expect(vitrine).not.toContain('127.0.0.1:3111')
  })

  it('falls back to its own page, not to the showcase', () => {
    // Both files live in the same root: without a named fallback, `/portes`
    // would serve the showcase and the router would find no route.
    const root = atelier.split('location /assets/')[1]?.split('location /')[1] ?? ''
    expect(root).toContain('try_files $uri $uri/ /atelier.html')
  })
})
