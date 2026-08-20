// Démonstration du noyau de composition : un mini-casting réel, le flux
// d'événements tel qu'il sort, une dépendance tuée à chaud, puis la cascade.
// Rien n'est simulé — c'est le même code que celui de src/runtime.
import { creerNoyau } from '../../src/runtime/noyau'
import type { Composant, IdComposant } from '../../src/runtime/contrat'

const noyau = creerNoyau()
const T0 = Date.now()

noyau.abonner((e) => {
  const t = String(Date.now() - T0).padStart(4, ' ')
  const seq = String(e.sequence).padStart(2, ' ')
  const cible = 'id' in e ? e.id : 'de' in e ? `${e.de} → ${e.vers}` : ''
  const extra =
    e.type === 'message-emis'
      ? ` « ${e.message} »`
      : e.type === 'composant-desactive'
        ? ` (${e.cause.genre === 'dependance-partie' ? e.cause.noms.join(', ') : 'libération'})`
        : e.type === 'composant-en-erreur'
          ? ` ${e.erreur.code} — ${e.erreur.message}`
          : e.type === 'valeur-transmise'
            ? ` [${e.nom}]`
            : ''
  process.stdout.write(`${t}ms  #${seq}  ${e.type.padEnd(20)} ${cible}${extra}\n`)
})

const registre: Composant = {
  nom: 'outil-registre',
  fournit: ['registre'],
  presentation: { role: 'Source de vérité réglementaire', technologie: 'registre EU' },
  applique(c) {
    c.emettre('Charge 412 allégations autorisées.')
    c.fournir('registre', { allegations: 412 })
    c.terminer()
  },
}

const specification: Composant = {
  nom: 'architecte',
  fournit: ['specification'],
  presentation: { role: 'Choisit la composition' },
  applique(c) {
    c.emettre('Découpe en trois constructeurs parallèles.')
    c.fournir('specification', { constructeurs: 3 })
    c.terminer()
  },
}

const constructeur = (quoi: string, techno?: string): Composant => ({
  nom: `constructeur-${quoi}`,
  injecte: ['specification', 'registre'],
  presentation: { role: `Fabrique ${quoi}`, ...(techno !== undefined ? { technologie: techno } : {}) },
  applique(c) {
    const spec = c.lire<{ constructeurs: number }>('specification')
    c.emettre(`Travaille depuis une spécification à ${spec?.constructeurs} constructeurs.`)
    c.effet(() => () => {}, `sortie-${quoi}`)
    c.terminer()
  },
})

const maitre: Composant = {
  nom: 'agent-maitre',
  presentation: { role: 'Orchestre le run' },
  applique(c) {
    c.emettre('Constitue sa mémoire de run.')
    void c.charger(specification)
    void c.charger(constructeur('regles'))
    void c.charger(constructeur('interface', 'Vue 3'))
    void c.charger(constructeur('tests'))
  },
}

const titre = (t: string) => process.stdout.write(`\n\x1b[1m── ${t}\x1b[0m\n`)

titre("1. On charge l'agent maître : ses enfants attendent leurs dépendances")
await noyau.charger(maitre)
await new Promise((r) => setTimeout(r, 20))
process.stdout.write(
  `\n   vivants: ${noyau.introspecter().composants.length}` +
    `  ·  actifs: ${noyau.introspecter().composants.filter((c) => c.etat === 'actif').length}` +
    `  ·  en attente: ${noyau.introspecter().composants.filter((c) => c.etat === 'en-attente').length}\n`,
)

titre("2. L'outil arrive : les trois constructeurs s'activent seuls")
const idRegistre = await noyau.charger(registre)
await new Promise((r) => setTimeout(r, 20))
const topo = noyau.introspecter()
process.stdout.write(`\n   arêtes réelles: ${topo.dependances.length}\n`)
for (const d of topo.dependances) process.stdout.write(`     ${d.de}  --[${d.nom}]-->  ${d.vers}\n`)

titre('3. On tue le registre à chaud : les dépendants se désactivent seuls')
await noyau.liberer(idRegistre as IdComposant)
await new Promise((r) => setTimeout(r, 20))
process.stdout.write(
  `\n   actifs: ${noyau.introspecter().composants.filter((c) => c.etat === 'actif').length}\n`,
)

titre('4. On le remet : ils se réactivent seuls')
await noyau.charger(registre)
await new Promise((r) => setTimeout(r, 20))
process.stdout.write(
  `\n   actifs: ${noyau.introspecter().composants.filter((c) => c.etat === 'actif').length}\n`,
)

titre("5. On libère l'agent maître : cascade sur tout ce qu'il a chargé")
await noyau.libererTout()
await new Promise((r) => setTimeout(r, 20))
process.stdout.write(`\n   vivants: ${noyau.introspecter().composants.length}\n\n`)
