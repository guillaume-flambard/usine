// La topologie est un contrat, pas un fichier de commodité.
//
// Ce test lit le `compose.yaml` du dépôt. Son existence est l'invariant qui
// rend un changement d'orchestrateur réversible : tant qu'elle n'existait pas,
// la topologie vivait dans la base d'un outil et n'en sortait pas.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf-8')

const compose = read('compose.yaml')
const nginx = read('deployment/nginx.compose.conf')

/**
 * Le bloc d'un service de premier niveau.
 *
 * Découper sur « api: » attraperait aussi le « api: » d'un `depends_on`, qui
 * est indenté plus profond — d'où l'ancrage sur le début de ligne.
 */
const serviceBlock = (name: string): string => {
  const found = compose.match(new RegExp(`\\n {2}${name}:\\n([\\s\\S]*?)(?=\\n {2}\\w|\\nvolumes:)`))
  return found?.[1] ?? ''
}

describe('la topologie déclarée dans le dépôt', () => {
  it('décrit les trois services et rien de plus', () => {
    for (const service of ['  site:', '  api:', '  db:']) {
      expect(compose).toContain(service)
    }
  })

  it('n’expose que le site vers l’extérieur', () => {
    // Le service compagnon porte la clé : un port publié en ferait une porte
    // ouverte, et c'est exactement l'erreur que la topologie précédente avait
    // forcée faute d'alias DNS.
    const api = serviceBlock('api')
    expect(api).toContain('expose:')
    expect(api).not.toMatch(/^\s+ports:/m)

    expect(serviceBlock('db')).not.toMatch(/^\s+ports:/m)
  })

  it('refuse de démarrer sans clé et sans mot de passe, plutôt que de démarrer à moitié', () => {
    // `:?` fait échouer le démarrage. Un service qui monte sans clé annonce
    // qu'il est prêt et ne l'est pas — c'est pire qu'un refus.
    expect(compose).toContain('OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:?')
    expect(compose).toContain('POSTGRES_PASSWORD:?')
    // Et rien qui ait la forme d'une chaîne de connexion : identifiant et mot
    // de passe côte à côte ressemblent à un secret même quand la valeur est
    // une variable, et un scanner qui crie au loup sur son propre dépôt
    // apprend à être ignoré.
    expect(compose).not.toMatch(/postgres(ql)?:\/\/[^\s]*:[^\s]*@/)
  })

  it('ne porte aucun secret en clair', () => {
    // Tout ce qui est sensible vient de l'environnement. Un défaut littéral
    // ici finirait dans l'historique du dépôt.
    expect(compose).not.toMatch(/sk-[A-Za-z0-9]/)
    expect(compose).not.toMatch(/POSTGRES_PASSWORD:\s*[A-Za-z0-9]/)
  })

  it('attend que la base et l’API soient saines avant de servir', () => {
    expect(compose).toContain('condition: service_healthy')
    expect(compose).toContain('pg_isready')
  })

  it('garde la base sur un volume nommé', () => {
    // Sans volume, un redéploiement efface les runs stockés — et la
    // persistance était toute la raison d'ajouter une base.
    expect(compose).toContain('usine-db:/var/lib/postgresql/data')
    expect(compose).toMatch(/^volumes:\s*$/m)
  })
})

describe('le nginx de la topologie à trois conteneurs', () => {
  it('joint l’API par son nom, jamais par la boucle locale', () => {
    // C'est le gain concret du découpage : un nom stable entre conteneurs.
    // Son absence avait produit l'architecture absurde qu'on remplace ici.
    expect(nginx).toContain('proxy_pass http://api:8000/')
    expect(nginx).not.toContain('127.0.0.1:3000')
  })

  it('garde la politique de sécurité et le cadre isolé du site actuel', () => {
    // La migration change le transport, pas les garanties. Un fichier dérivé
    // qui perdrait la politique en route serait une régression silencieuse.
    expect(nginx).toContain("frame-src 'self'")
    expect(nginx).toContain('location = /sandbox.html')
    expect(nginx).toContain('X-Forwarded-For')
  })
})
