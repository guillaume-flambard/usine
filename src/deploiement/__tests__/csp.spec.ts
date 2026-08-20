// La politique de sécurité servie est un contrat, pas un commentaire.
// Ce test lit le fichier réellement copié dans l'image.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const nginx = readFileSync(
  fileURLToPath(new URL('../../../deploiement/nginx.conf', import.meta.url)),
  'utf-8',
)
const index = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf-8')

const politique = nginx.match(/set \$politique "([^"]+)"/)?.[1] ?? ''
const directive = (nom: string) =>
  politique
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${nom} `)) ?? ''

describe('la politique de sécurité servie', () => {
  it('existe et couvre tout par défaut', () => {
    expect(politique.length).toBeGreaterThan(50)
    expect(directive('default-src')).toBe("default-src 'self'")
  })

  it("n'autorise jamais l'évaluation de code", () => {
    // C'est la promesse centrale du mode par défaut.
    expect(politique).not.toContain('unsafe-eval')
    expect(directive('script-src')).toBe("script-src 'self'")
  })

  it("n'ouvre le réseau que vers le fournisseur du mode branché", () => {
    const connect = directive('connect-src')
    expect(connect).toContain("'self'")
    expect(connect).toContain('https://api.anthropic.com')
    // Rien d'autre : une adresse de plus serait une fuite de plus.
    expect(connect.split(/\s+/).filter((part) => part.startsWith('http'))).toEqual([
      'https://api.anthropic.com',
    ])
  })

  it('autorise exactement les hôtes que la page charge vraiment', () => {
    const hotes = [...index.matchAll(/https:\/\/([a-z.]+)/g)].map((m) => m[1])
    for (const hote of new Set(hotes)) {
      expect(politique, `l'hôte ${hote} est chargé mais non autorisé`).toContain(hote as string)
    }
  })

  it('ferme les vecteurs classiques', () => {
    for (const attendu of [
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(politique).toContain(attendu)
    }
  })

  it('redéclare les en-têtes dans chaque bloc, faute d héritage', () => {
    // nginx n'hérite pas les `add_header` dès qu'un bloc en déclare un :
    // les oublier servirait les fragments sans politique.
    const blocs = nginx.split('location ').slice(1)
    expect(blocs).toHaveLength(3)
    for (const bloc of blocs) {
      expect(bloc).toContain('add_header Content-Security-Policy $politique')
      expect(bloc).toContain('X-Content-Type-Options')
      expect(bloc).toContain('Referrer-Policy')
    }
  })

  it('garde le relais du modèle sur la même origine', () => {
    // Une origine tierce imposerait d'ouvrir `connect-src` et de gérer CORS ;
    // surtout, la clé du relais ne doit jamais avoir à voyager côté client.
    const bloc = nginx.split('location ~ ^/api/')[1]?.split('location ')[0] ?? ''
    expect(bloc).toContain('proxy_pass $relais')
    // Résolution à la requête : un relais absent rend 502, il n'empêche pas
    // nginx de démarrer.
    expect(bloc).toContain('resolver')
    expect(directive('connect-src')).toContain("'self'")
  })

  it("ne laisse pas l'index devenir immuable", () => {
    const racine = nginx.split('location /assets/')[1]?.split('location /')[1] ?? ''
    expect(racine).toContain('no-cache')
  })
})
