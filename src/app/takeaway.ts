// Emporter l'application.
//
// Un visiteur qui repart les mains vides n'a rien vu qu'une démonstration.
// Ce module produit un fichier autonome : l'écran, les comportements, et le
// pont — le tout s'ouvre hors ligne, hors du site.
//
// Le fichier reprend l'isolement du produit plutôt que de s'en dispenser : les
// comportements y tournent dans un Worker, pas dans le document. Un fichier
// qui exécuterait le code d'un modèle dans sa propre page serait un cadeau
// empoisonné pour celui qui l'ouvre.

import type { Behaviour } from './behaviour'
import { ATTRIBUTES, TAGS, WIRING } from './sanitize'

/** Ce qu'il faut pour reconstituer l'application ailleurs. */
export interface Takeaway {
  brief: string
  screen: string
  behaviours: readonly { name: string; version: number; code: string }[]
}

/** Échappe pour une insertion dans du HTML. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Le code des comportements est passé en JSON, jamais concaténé.
 *
 * `</script>` dans une chaîne fermerait la balise et ferait sortir le reste du
 * code dans le document. `JSON.stringify` seul ne protège pas de ça.
 */
const asData = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e')

/**
 * Compose le fichier autonome.
 *
 * Tout est inline — un fichier qui dépendrait du réseau ne serait pas
 * autonome, et c'est le seul mot qui compte ici.
 */
export function takeawayHtml(takeaway: Takeaway): string {
  const behaviours = takeaway.behaviours.map((behaviour) => ({
    name: behaviour.name,
    version: behaviour.version,
    code: behaviour.code,
  }))

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(takeaway.brief.slice(0, 80)) || 'Application'}</title>
<style>
  :root { color-scheme: light; --ink:#16130f; --bg:#faf9f7; --muted:#6b6055; --line:#e7e2da; }
  *{box-sizing:border-box}
  body{margin:0;padding:24px;max-width:760px;background:var(--bg);color:var(--ink);
       font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
  h1{font-size:20px;font-weight:400;margin:0 0 12px}
  label{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
        color:var(--muted);margin-bottom:6px}
  input,textarea,select{width:100%;max-width:560px;padding:8px 10px;border:1px solid var(--line);
        border-radius:0;background:#fff;color:inherit;font:inherit}
  textarea{min-height:76px}
  button{padding:8px 16px;border:1px solid var(--ink);border-radius:0;background:var(--ink);
        color:var(--bg);font:inherit;cursor:pointer}
  button[disabled]{border-color:var(--line);background:transparent;color:var(--muted)}
  [data-output]{margin:8px 0 12px;padding:10px 12px;border-left:2px solid var(--line);
        white-space:pre-wrap;word-break:break-word}
  [data-output][data-failed=true]{border-left-color:#ad4c16;color:#ad4c16}
  footer{margin-top:28px;padding-top:12px;border-top:1px solid var(--line);
        font-size:12px;color:var(--muted)}
</style>
</head>
<body>
<main id="screen"></main>
<footer>
  Application écrite pendant un run de l'usine agentique, à partir du besoin :
  « ${escapeHtml(takeaway.brief)} ».
  Ses comportements tournent dans un fil isolé, sans accès au document ni au réseau.
</footer>
<script type="application/json" id="screen-source">${asData(takeaway.screen)}</script>
<script type="application/json" id="behaviours">${asData(behaviours)}</script>
<script>
(() => {
  const read = (id) => JSON.parse(document.getElementById(id).textContent)
  const markup = read('screen-source')
  const behaviours = read('behaviours')

  // Le même parcours que dans le produit : on reconstruit le balisage plutôt
  // que de l'assigner, et rien de ce qui n'est pas prévu ne survit.
  // Les mêmes listes que celles du produit, sérialisées depuis leur unique
  // définition. Une seconde copie écrite à la main finirait par diverger, et
  // le fichier emporté n'afficherait plus ce que le produit affichait.
  const ALLOWED = new Set(${asData([...TAGS])})
  const ATTRS = new Set(${asData([...ATTRIBUTES, ...WIRING])})

  const rebuild = (source, target) => {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === 3) { target.appendChild(document.createTextNode(child.nodeValue || '')); continue }
      if (child.nodeType !== 1) continue
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED.has(tag)) continue
      const fresh = document.createElement(tag)
      for (const attribute of Array.from(child.attributes)) {
        const name = attribute.name.toLowerCase()
        if (name.startsWith('on')) continue
        if (ATTRS.has(name) || name.startsWith('aria-')) fresh.setAttribute(name, attribute.value)
      }
      target.appendChild(fresh)
      rebuild(child, fresh)
    }
  }
  rebuild(new DOMParser().parseFromString(markup, 'text/html').body, document.getElementById('screen'))

  // Un worker par comportement : le code vient d'un modèle, il ne s'exécute
  // pas dans ce document, et une boucle infinie s'arrête.
  const WORKER = ${asData(
    "self.fetch=undefined;delete self.fetch;let f;onmessage=(e)=>{const m=e.data;if(m.type==='define'){try{f=new Function('\"use strict\"; return ('+m.code+')')()}catch(c){postMessage({type:'settled',call:m.call,failure:String(c)})}return}try{const out=f(m.input);Promise.resolve(out).then((v)=>postMessage({type:'settled',call:m.call,output:typeof v==='string'?v:JSON.stringify(v,null,2)}),(c)=>postMessage({type:'settled',call:m.call,failure:String(c)}))}catch(c){postMessage({type:'settled',call:m.call,failure:String(c)})}}",
  )}

  const spawn = (code) => {
    const worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })))
    worker.postMessage({ type: 'define', code })
    return worker
  }

  const running = new Map()
  for (const behaviour of behaviours) running.set(behaviour.name, spawn(behaviour.code))

  let call = 0
  for (const button of document.querySelectorAll('[data-invoke]')) {
    const name = button.getAttribute('data-invoke')
    if (!running.has(name)) { button.disabled = true; continue }
    button.addEventListener('click', () => {
      const target = document.querySelector('[data-output="' + name + '"]')
      const field = document.querySelector('[data-field]')
      const worker = running.get(name)
      const id = ++call
      if (target) target.textContent = '…'
      const timer = setTimeout(() => {
        worker.terminate()
        running.set(name, spawn(behaviours.find((b) => b.name === name).code))
        if (target) { target.setAttribute('data-failed', 'true'); target.textContent = 'arrêté : pas de réponse' }
      }, 2000)
      worker.addEventListener('message', (event) => {
        if (event.data.call !== id) return
        clearTimeout(timer)
        if (!target) return
        if (event.data.failure) { target.setAttribute('data-failed', 'true'); target.textContent = event.data.failure }
        else { target.removeAttribute('data-failed'); target.textContent = event.data.output || '(aucune réponse)' }
      }, { once: false })
      worker.postMessage({ type: 'run', call: id, input: field ? field.value : '' })
    })
  }
})()
</script>
</body>
</html>
`
}

/** Ce qu'on emporte, à partir de ce qui sert et du code qui a été écrit. */
export function takeawayOf(
  brief: string,
  screen: string,
  behaviours: readonly Behaviour[],
  sourceOf: (name: string) => string | undefined,
): Takeaway | undefined {
  const kept = behaviours
    .map((behaviour) => ({
      name: behaviour.name,
      version: behaviour.version,
      code: sourceOf(behaviour.name) ?? '',
    }))
    .filter((behaviour) => behaviour.code.length > 0)

  // Sans écran ou sans comportement, il n'y a pas d'application à emporter —
  // et livrer un fichier vide serait pire que de ne rien proposer.
  if (screen.length === 0 || kept.length === 0) return undefined
  return { brief, screen, behaviours: kept }
}
