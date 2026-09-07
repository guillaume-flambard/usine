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

const policy = nginx.match(/set \$policy "([^"]+)"/)?.[1] ?? ''
const directive = (name: string) =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `)) ?? ''

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
    const blocks = nginx
      .split('location ')
      .slice(1)
      // The frame serves its own policy, stricter than the host's; it is the
      // one block that must *not* carry `$policy`.
      .filter((block) => !block.startsWith('= /sandbox.html'))
    expect(blocks).toHaveLength(3)
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
    const block = nginx.split('location ~ ^/api/')[1]?.split('location ')[0] ?? ''
    expect(block).toContain('proxy_pass http://127.0.0.1:3000/')
    expect(block).not.toMatch(/proxy_pass https?:\/\/(?!127\.0\.0\.1)/)
    // The visitor's address is forwarded: without it the relay would see one
    // address for the whole planet and its per-minute cap would be shared.
    expect(block).toContain('X-Forwarded-For')
    expect(directive('connect-src')).toContain("'self'")
  })

  it('does not let the index become immutable', () => {
    const root = nginx.split('location /assets/')[1]?.split('location /')[1] ?? ''
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
