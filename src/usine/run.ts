// Memo Labs — L'usine agentique — run choréographié + produits (ClaimCheck / Pulse / Tandem).
// Porté depuis l'artefact Open Design, typé pour TypeScript strict. Algorithme d'origine préservé.

interface NodeDef {
  id: string
  label: string
  tech: string
  x: number
  y: number
  w: number
  h: number
  role: string
  gate?: boolean
}
interface ClaimOk {
  re: RegExp
  src: string
  doc: string
}
interface ClaimRules {
  defaultText: string
  forbidden: RegExp[]
  soft: RegExp[]
  ok: ClaimOk[]
}
interface ScenarioDef {
  name: string
  url: string
  scale: number
  brief: string
  nodes: Record<string, [string, string]>
  rail: Array<[string, string]>
  claim: ClaimRules
}
interface Market {
  brand: string
  stat: string
  tag: string
}
interface ClaimRow {
  text: string
  status: string
  src: string
  doc: string
  re: RegExp
}

const gById = (id: string): HTMLElement => document.getElementById(id)!

export function initUsine(): void {
  let CURRENT: ScenarioDef = null as unknown as ScenarioDef

  const NODES: NodeDef[] = [
    {
      id: 'brief',
      label: 'Brief',
      tech: 'besoin du client',
      x: 16,
      y: 232,
      w: 140,
      h: 56,
      role: 'Le besoin brut du client — la source de toute la chaîne.',
    },
    {
      id: 'pm',
      label: 'PM',
      tech: 'brief → spécifications',
      x: 194,
      y: 232,
      w: 140,
      h: 56,
      role: 'Transforme le besoin en spécifications productibles.',
    },
    {
      id: 'archi',
      label: 'Architecte',
      tech: 'spécs → architecture',
      x: 372,
      y: 232,
      w: 140,
      h: 56,
      role: 'Choisit la stack et découpe le travail en chantiers.',
    },
    {
      id: 'front',
      label: 'Outil · Front',
      tech: 'React · Next',
      x: 550,
      y: 40,
      w: 140,
      h: 56,
      role: "Génère l'interface sous la contrainte du design system.",
    },
    {
      id: 'api',
      label: 'Outil · API',
      tech: 'FastAPI',
      x: 550,
      y: 232,
      w: 140,
      h: 56,
      role: "Écrit l'API métier, les endpoints et leurs tests.",
    },
    {
      id: 'db',
      label: 'Outil · DB',
      tech: 'Postgres',
      x: 550,
      y: 424,
      w: 140,
      h: 56,
      role: 'Modélise le schéma, les migrations et les données.',
    },
    {
      id: 'build-ui',
      label: 'Build · UI',
      tech: 'composants · rendu',
      x: 728,
      y: 40,
      w: 140,
      h: 56,
      role: "Assemble l'interface et itère sur le rendu réel.",
    },
    {
      id: 'build-api',
      label: 'Build · API',
      tech: 'logique · tests',
      x: 728,
      y: 232,
      w: 140,
      h: 56,
      role: 'Implémente la logique métier et la bat en tests.',
    },
    {
      id: 'build-data',
      label: 'Build · Data',
      tech: 'schéma · requêtes',
      x: 728,
      y: 424,
      w: 140,
      h: 56,
      role: 'Peuple la base et vérifie les requêtes réelles.',
    },
    {
      id: 'skeptic',
      label: 'Skeptic',
      tech: 'contre-vérification',
      x: 900,
      y: 96,
      w: 140,
      h: 56,
      role: 'Traque les allégations non sourcées du livrable.',
    },
    {
      id: 'gate',
      label: 'Gate humain',
      tech: 'human-in-loop · approbation',
      x: 900,
      y: 296,
      w: 250,
      h: 112,
      role: 'Le point humain — approuver ou écarter la sortie.',
      gate: true,
    },
    {
      id: 'deploy',
      label: 'Deploy',
      tech: 'Vercel · production',
      x: 1174,
      y: 232,
      w: 140,
      h: 56,
      role: 'Met en production et lance les checks finaux.',
    },
  ]

  const EDGES: Array<[string, string]> = [
    ['brief', 'pm'],
    ['pm', 'archi'],
    ['archi', 'front'],
    ['archi', 'api'],
    ['archi', 'db'],
    ['front', 'build-ui'],
    ['api', 'build-api'],
    ['db', 'build-data'],
    ['build-ui', 'skeptic'],
    ['build-api', 'skeptic'],
    ['build-data', 'skeptic'],
    ['skeptic', 'gate'],
    ['gate', 'deploy'],
  ]

  const BASE_TOKENS = [2600, 18400, 41200, 62500, 148000, 179300, 189400, 221000]
  function tk(i: number) {
    return Math.round(BASE_TOKENS[i] * (CURRENT ? CURRENT.scale : 1))
  }
  const SCENARIOS: Record<string, ScenarioDef> = {
    claims: {
      name: 'ClaimCheck v1.0',
      url: "claimcheck.app — vérification d'allégations",
      scale: 1,
      brief: 'Une app qui vérifie les allégations marketing des marques et cite leurs sources.',
      nodes: {
        front: ['Outil · Front', 'React · Next'],
        api: ['Outil · API', 'FastAPI'],
        db: ['Outil · DB', 'Postgres'],
        build_ui: ['Build · UI', 'composants · rendu'],
        build_api: ['Build · API', 'logique · tests'],
        build_data: ['Build · Data', 'schéma · requêtes'],
      },
      rail: [
        ['DOC-01', 'RGPD · art. 5 — conformité attestée'],
        ['DOC-02', 'ISO 27001 — certification référencée'],
        ['DOC-03', "SOC 2 — rapport d'audit"],
        ['DOC-04', 'CNIL — délibération référencée'],
      ],
      claim: {
        defaultText:
          "ClaimCheck réduit la revue de plusieurs heures à quelques minutes.\nL'outil est conforme RGPD et ISO 27001.\nIl garantit une précision de 100 % sur les allégations contrôlées.\nAucun risque : essayez la démo gratuite.\nRejoignez les 10 000 équipes qui nous font déjà confiance.\nNotre modèle est certifié sans danger pour vos données.",
        forbidden: [
          /(?:100\s*%|zéro\s+risque|aucun\s+risque|garantie\s+(?:totale|absolue)|précision\s+(?:absolue|totale)|infaillible|sans\s+aucun\s+risque|médicalement\s+prouvé|guérit|guérison|cure)/i,
        ],
        soft: [
          /(?:plusieurs\s+(?:heures|jours|minutes|secondes|semaines)|quelques\s+(?:minutes|secondes|heures)|moins\s+de\s+\d+|en\s+quelques|10\s?000|des\s+milliers|millions|leader|n°?\s?1|meilleur|plus\s+rapide|sans\s+danger|sans\s+engagement|gratuit|révolution)/i,
        ],
        ok: [
          { re: /rgpd/, src: 'RGPD · art. 5 — conformité attestée', doc: 'DOC-01' },
          { re: /iso\s*27001/, src: 'ISO 27001 — certification référencée', doc: 'DOC-02' },
          { re: /soc\s*2/, src: "SOC 2 — rapport d'audit référencé", doc: 'DOC-03' },
          { re: /cnil/, src: 'CNIL — délibération référencée', doc: 'DOC-04' },
        ],
      },
    },
    pulse: {
      name: 'Pulse v1.0',
      url: 'pulse.app — veille concurrentielle',
      scale: 0.85,
      brief:
        'Une app de veille concurrentielle qui détecte les mouvements de prix et les nouvelles promesses des marques.',
      nodes: {
        front: ['Outil · Front', 'Vue · Nuxt'],
        api: ['Outil · API', 'Node · Express'],
        db: ['Outil · DB', 'MongoDB'],
        build_ui: ['Build · Veille', 'flux · alertes'],
        build_api: ['Build · API', 'scraping · agrégats'],
        build_data: ['Build · Data', 'index · séries'],
      },
      rail: [
        ['DGCCRF', 'conformité prix — directives référencées'],
        ['ARCEP', 'télécom — marché de référence'],
        ['ACPR', 'finance — règles publicitaires'],
        ['HADOPI', 'droits — contrôles éditoriaux'],
      ],
      claim: {
        defaultText:
          "NOVA annonce le prix le plus bas garanti du marché. KITE promet une croissance de 300 % dès le premier trimestre, sans aucun risque pour l'annonceur. ALTAIR se dit leader incontesté de son secteur depuis dix ans.",
        forbidden: [
          /(?:le\s+plus\s+bas\s+garant|prix\s+garanti|sans\s+aucun\s+risque|remboursé\s+à\s+100|garanti\s+à\s+vie|0\s*%\s*de\s+risque)/i,
        ],
        soft: [
          /(?:leader|n°?\s?1|incontest|premier|le\s+moins\s+cher|croissance\s+de\s+\d+|dès\s+le\s+premier|meilleur\s+prix|dès\s+aujourd)/i,
        ],
        ok: [
          { re: /dgccrf/, src: 'DGCCRF — conformité prix attestée', doc: 'DGCCRF' },
          { re: /arcep/, src: 'ARCEP — marché de référence', doc: 'ARCEP' },
          { re: /acpr/, src: 'ACPR — règles publicitaires', doc: 'ACPR' },
          { re: /hadopi/, src: 'HADOPI — contrôles éditoriaux', doc: 'HADOPI' },
        ],
      },
    },
    tandem: {
      name: 'Tandem v1.0',
      url: 'tandem.app — relecture éditoriale',
      scale: 0.74,
      brief:
        'Un assistant de relecture éditoriale qui signale les fautes, les tournures faibles et les promesses exagérées dans un texte.',
      nodes: {
        front: ['Outil · Front', 'Svelte'],
        api: ['Outil · API', 'Go · Chi'],
        db: ['Outil · DB', 'SQLite'],
        build_ui: ['Build · Éditeur', 'suggestions · inline'],
        build_api: ['Build · API', 'grammaire · style'],
        build_data: ['Build · Lexique', 'index · règles'],
      },
      rail: [
        ['ACAD', "Dictionnaire de l'Académie — références"],
        ['GUIDE', 'Guide de style — règles maison'],
        ['FLESCH', 'Lisibilité — seuils calibrés'],
        ['LEX', 'Lexique éditorial — tournures'],
      ],
      claim: {
        defaultText:
          "Ce guide est parfait, sans une seule faute, et reste le plus lisible du marché. Sa méthode est certifiée par le Guide de style et respecte les seuils de lisibilité recommandés. L'Académie le recommande aux rédactions.",
        forbidden: [
          /(?:parfait|zéro\s+faute|sans\s+une\s+seule\s+faute|infaillible|sans\s+faute\s+possible|prouvé\s+par\s+l.académie|aucune\s+erreur)/i,
        ],
        soft: [
          /(?:plus\s+lisib|le\s+plus\s+clair|très\s+fluide|recommandé\s+par|best-seller|référence\s+absolue|mieux\s+que\s+tous|inégal)/i,
        ],
        ok: [
          { re: /guide\s+de\s+style/, src: 'Guide de style — règles maison', doc: 'GUIDE' },
          { re: /lisibilit|flesch/, src: 'Lisibilité — seuils calibrés', doc: 'FLESCH' },
          { re: /académie|acad/, src: "Dictionnaire de l'Académie — références", doc: 'ACAD' },
          { re: /lexique/, src: 'Lexique éditorial — tournures', doc: 'LEX' },
        ],
      },
    },
  }
  CURRENT = SCENARIOS.claims

  const GRAPH_W = 1330
  const graph = gById('graph')
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('viewBox', '0 0 ' + GRAPH_W + ' 520')
  svg.setAttribute('class', 'edges')
  svg.setAttribute('aria-hidden', 'true')
  graph.appendChild(svg)
  const layer = document.createElement('div')
  layer.className = 'node-layer'
  graph.appendChild(layer)

  const nodes: Record<string, HTMLElement> = {}
  const nodeEls: HTMLElement[] = []
  NODES.forEach(function (n: NodeDef) {
    const el = document.createElement('div')
    el.className = 'node' + (n.gate ? ' gate' : '')
    el.style.left = n.x + 'px'
    el.style.top = n.y + 'px'
    el.style.width = n.w + 'px'
    el.style.height = n.h + 'px'
    el.dataset.id = n.id
    el.dataset.label = n.label
    el.dataset.tech = n.tech
    el.dataset.role = n.role
    el.setAttribute('data-od-id', 'node-' + n.id)
    el.setAttribute('tabindex', '0')
    let html =
      '<span class="spinner" aria-hidden="true"></span><span class="node-label">' +
      n.label +
      '</span><span class="node-tech">' +
      n.tech +
      '</span>'
    if (n.gate) {
      html +=
        '<div class="gate-actions"><button class="gate-btn gate-approve" data-od-id="gate-approve" type="button">Approuver</button><button class="gate-btn gate-dismiss" data-od-id="gate-dismiss" type="button">Écarter</button></div>'
    }
    el.innerHTML = html
    layer.appendChild(el)
    nodes[n.id] = el
    nodeEls.push(el)
  })

  function nodeById(id: string): NodeDef | null {
    for (let i = 0; i < NODES.length; i++) if (NODES[i].id === id) return NODES[i]
    return null
  }

  function pathFor(f: NodeDef, t: NodeDef) {
    if (f.id === 'skeptic' && t.id === 'gate') return 'M970,152 C982,214 1006,238 1025,300'
    if (f.id === 'gate' && t.id === 'deploy') return 'M1150,352 C1160,315 1166,285 1174,260'
    const sx = f.x + f.w,
      sy = f.y + f.h / 2
    const tx = t.x,
      ty = t.y + t.h / 2
    const dx = Math.max((tx - sx) * 0.5, 36)
    return (
      'M' +
      sx +
      ',' +
      sy +
      ' C' +
      (sx + dx) +
      ',' +
      sy +
      ' ' +
      (tx - dx) +
      ',' +
      ty +
      ' ' +
      tx +
      ',' +
      ty
    )
  }

  const edgeEls = EDGES.map(function (pair: [string, string]) {
    const p = document.createElementNS(svgNS, 'path') as SVGPathElement
    p.setAttribute('d', pathFor(nodeById(pair[0])!, nodeById(pair[1])!))
    p.setAttribute('pathLength', '1')
    p.setAttribute('class', 'edge')
    svg.appendChild(p)
    return p
  })
  const pulseEls = EDGES.map(function (pair: [string, string]) {
    const p = document.createElementNS(svgNS, 'path') as SVGPathElement
    p.setAttribute('d', pathFor(nodeById(pair[0])!, nodeById(pair[1])!))
    p.setAttribute('pathLength', '1')
    p.setAttribute('class', 'pulse')
    p.setAttribute('aria-hidden', 'true')
    svg.appendChild(p)
    return p
  })

  function setSt(id: string, st: string) {
    const el = nodes[id]
    el.classList.remove('running', 'done')
    if (st === 'running' || st === 'done') el.classList.add('revealed', st)
  }
  function reveal(id: string) {
    nodes[id].classList.add('revealed')
  }
  function edge(i: number, cls: string) {
    edgeEls[i].classList.add(cls)
  }
  function pulseOn(i: number) {
    const p = pulseEls[i]
    p.style.transition = 'none'
    p.style.strokeDashoffset = '1'
    p.style.opacity = '1'
    void p.getBBox()
    p.style.transition = 'stroke-dashoffset .85s cubic-bezier(.45,.05,.3,1)'
    p.style.strokeDashoffset = '0'
  }
  function pulseOff(i: number) {
    const p = pulseEls[i]
    if (p.style.opacity === '0') return
    p.style.transition = 'opacity .3s ease'
    p.style.opacity = '0'
    const rid = runId
    setTimeout(function () {
      if (rid === runId) {
        p.style.transition = 'none'
        p.style.strokeDashoffset = '1'
      }
    }, 320)
  }
  function pulseAllOff() {
    pulseEls.forEach(function (p: SVGPathElement) {
      p.style.transition = 'none'
      p.style.opacity = '0'
      p.style.strokeDashoffset = '1'
    })
  }
  function sweepSpine() {
    const spine = [0, 1, 3, 6, 9, 11, 12]
    spine.forEach(function (k: number, i: number) {
      later(function () {
        pulseOn(k)
      }, i * 160)
      later(
        function () {
          pulseOff(k)
        },
        i * 160 + 540,
      )
    })
  }

  const elAgents = gById('num-agents')
  const elPhase = gById('num-phase')
  const elTokens = gById('num-tokens')
  const elTemps = gById('num-temps')
  const nAgent = gById('n-agent')
  const nLine = gById('n-line')
  const launchBtn = gById('launch-btn')
  const launchLabel = gById('launch-label')
  const payoff = gById('payoff')
  const claimRecap = gById('claim-recap')
  const rerunLink = gById('rerun-link')
  const gateApprove = layer.querySelector('.gate-approve') as HTMLButtonElement
  const gateDismiss = layer.querySelector('.gate-dismiss') as HTMLButtonElement

  function setAgents(n: number) {
    elAgents.textContent = ('0' + n).slice(-2)
  }
  function setPhase(p: string) {
    elPhase.textContent = p
  }
  function fmt(n: number) {
    return n.toLocaleString('fr-FR')
  }
  let tok = 0,
    tokTarget = 0
  let tokTic: number | undefined
  function tokTo(target: number) {
    tokTarget = target
    clearInterval(tokTic)
    tokTic = setInterval(function () {
      const diff = tokTarget - tok
      if (Math.abs(diff) < 8) {
        tok = tokTarget
        clearInterval(tokTic)
      } else tok += Math.round(diff * 0.06)
      elTokens.textContent = fmt(Math.round(tok))
    }, 50)
  }
  function setTokens(v: number) {
    tok = v
    tokTarget = v
    clearInterval(tokTic)
    elTokens.textContent = fmt(v)
  }
  let tic: number | undefined
  function startClock() {
    const t0 = Date.now()
    clearInterval(tic)
    tic = setInterval(function () {
      const s = Math.floor((Date.now() - t0) / 1000)
      elTemps.textContent = ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2)
    }, 500)
  }
  const narrationEl = document.querySelector('.narration') as HTMLElement
  let narrateTimer: number | undefined
  function narrate(agent: string, line: string) {
    narrationEl.classList.add('swap')
    clearTimeout(narrateTimer)
    narrateTimer = setTimeout(function () {
      nAgent.textContent = agent
      nAgent.style.display = agent ? 'inline' : 'none'
      nLine.textContent = line
      narrationEl.classList.remove('swap')
    }, 160)
  }

  let runId = 0
  const timers: number[] = []
  function later(fn: () => void, ms: number) {
    const rid = runId
    const id = setTimeout(function () {
      if (rid === runId) fn()
    }, ms)
    timers.push(id)
  }
  function reset() {
    runId++
    timers.forEach(clearTimeout)
    timers.length = 0
    clearInterval(tokTic)
    clearInterval(tic)
    nodeEls.forEach(function (el: HTMLElement) {
      el.classList.remove('revealed', 'running', 'done')
    })
    edgeEls.forEach(function (e: SVGPathElement) {
      e.classList.remove('draw', 'done')
    })
    pulseAllOff()
    gateApprove.disabled = true
    gateDismiss.disabled = true
    gateOpen = false
    payoff.classList.remove('show')
    gById('claim-results').innerHTML = ''
    gById('claim-summary').innerHTML = ''
    setAgents(0)
    setPhase('—')
    setTokens(0)
    elTemps.textContent = '00:00'
    launchLabel.textContent = "Lancer l'usine"
    narrate('', "L'usine est prête — modifiez le brief ou lancez le run.")
  }

  let gateOpen = false

  function approveGate() {
    if (!gateOpen) return
    gateOpen = false
    gateApprove.disabled = true
    gateDismiss.disabled = true
    setSt('gate', 'done')
    edge(11, 'done')
    pulseOff(11)
    setAgents(11)
    setPhase('LIVE')
    reveal('deploy')
    edge(12, 'draw')
    narrate('Deploy', 'mise en production, checks finaux — le Claim Check se génère.')
    later(function () {
      setSt('deploy', 'running')
      pulseOn(12)
    }, 500)
    later(function () {
      setSt('deploy', 'done')
      edge(12, 'done')
      pulseOff(12)
      setAgents(12)
      tokTo(tk(7))
    }, 3800)
    later(function () {
      narrate('Livré', 'ClaimCheck v1.0 est prêt — le Claim Check fonctionne ci-dessous.')
      launchLabel.textContent = "↻ Re-lancer l'usine"
      sweepSpine()
      showPayoff()
    }, 5200)
  }

  function dismissGate() {
    if (!gateOpen) return
    gateOpen = false
    gateDismiss.disabled = true
    gateApprove.disabled = false
    setSt('gate', 'running')
    narrate('Agent Skeptic', 'points écartés repris — correction, puis contre-vérification.')
    later(function () {
      setSt('skeptic', 'running')
      pulseOn(8)
      pulseOn(9)
      pulseOn(10)
    }, 500)
    later(function () {
      setSt('skeptic', 'done')
      pulseOff(8)
      pulseOff(9)
      pulseOff(10)
      tokTo(tk(6))
    }, 3600)
    later(function () {
      gateOpen = true
      gateApprove.disabled = false
      gateDismiss.disabled = false
      narrate(
        'Gate humain',
        'la sortie corrigée attend de nouveau votre avis — approuvez ou écartez.',
      )
    }, 4200)
  }

  function showPayoff() {
    const agents = parseInt(elAgents.textContent || '0', 10)
    const tokens = parseInt((elTokens.textContent || '').replace(/\s/g, ''), 10)
    claimRecap.textContent =
      agents +
      ' agents · ' +
      fmt(tokens) +
      ' tokens · ' +
      elTemps.textContent +
      ' · sortie vérifiée'
    payoff.classList.add('show')
  }

  function startRun() {
    setPhase('—')
    narrate('', "L'usine démarre — lecture du brief.")
    startClock()
    setTokens(tk(0))
    reveal('brief')
    setSt('brief', 'done')
    setAgents(1)
    later(function () {
      narrate('Brief', "le besoin brut entre dans l'usine.")
    }, 600)
    later(function () {
      setPhase('PLAN')
      reveal('pm')
      edge(0, 'draw')
      narrate('PM', 'le besoin devient spécifications, critères et périmètre.')
    }, 2600)
    later(function () {
      setSt('pm', 'running')
      pulseOn(0)
    }, 3300)
    later(function () {
      setSt('pm', 'done')
      edge(0, 'done')
      pulseOff(0)
      setAgents(2)
      tokTo(tk(1))
    }, 6000)
    later(function () {
      setPhase('ARCHI')
      reveal('archi')
      edge(1, 'draw')
      narrate('Architecte', 'choisit la stack et découpe le travail en chantiers parallèles.')
    }, 6800)
    later(function () {
      setSt('archi', 'running')
      pulseOn(1)
    }, 7500)
    later(function () {
      setSt('archi', 'done')
      edge(1, 'done')
      pulseOff(1)
      setAgents(3)
      tokTo(tk(2))
    }, 10200)
    later(function () {
      setPhase('OUTILS')
      narrate('Outils', "React · Next · FastAPI · Postgres — la chaîne d'outillage s'active.")
      ;['front', 'api', 'db'].forEach(function (id, i) {
        later(function () {
          reveal(id)
          edge(2 + i, 'draw')
        }, i * 200)
      })
    }, 11200)
    ;['front', 'api', 'db'].forEach(function (id, i) {
      later(
        function () {
          setSt(id, 'running')
          pulseOn(2 + i)
        },
        11900 + i * 200,
      )
      later(
        function () {
          setSt(id, 'done')
          edge(2 + i, 'done')
          pulseOff(2 + i)
        },
        14500 + i * 200,
      )
    })
    later(function () {
      setAgents(6)
      tokTo(tk(3))
    }, 15300)
    later(function () {
      setPhase('BUILD')
      narrate('Builders', 'trois chantiers en parallèle — chaque rendu réel est inspecté.')
      ;['build-ui', 'build-api', 'build-data'].forEach(function (id, i) {
        later(function () {
          reveal(id)
          edge(5 + i, 'draw')
        }, i * 200)
      })
    }, 15800)
    ;['build-ui', 'build-api', 'build-data'].forEach(function (id, i) {
      later(
        function () {
          setSt(id, 'running')
          pulseOn(5 + i)
        },
        16500 + i * 200,
      )
      later(
        function () {
          setSt(id, 'done')
          edge(5 + i, 'done')
          pulseOff(5 + i)
        },
        20600 + i * 200,
      )
    })
    later(function () {
      setAgents(9)
      tokTo(tk(4))
    }, 21400)
    later(function () {
      setPhase('VÉRIF')
      reveal('skeptic')
      ;[8, 9, 10].forEach(function (i) {
        edge(i, 'draw')
      })
      narrate('Agent Skeptic', 'contre-vérifie le livrable — traque les allégations non sourcées.')
    }, 22200)
    later(function () {
      setSt('skeptic', 'running')
      pulseOn(8)
      pulseOn(9)
      pulseOn(10)
    }, 22900)
    later(function () {
      setSt('skeptic', 'done')
      ;[8, 9, 10].forEach(function (i) {
        edge(i, 'done')
        pulseOff(i)
      })
      setAgents(10)
      tokTo(tk(5))
    }, 27200)
    later(function () {
      setPhase('GATE')
      reveal('gate')
      edge(11, 'draw')
      narrate('Gate humain', 'la sortie attend votre avis — approuvez ou écartez.')
    }, 28800)
    later(function () {
      setSt('gate', 'running')
      pulseOn(11)
      gateOpen = true
      gateApprove.disabled = false
      gateDismiss.disabled = false
    }, 29500)
  }

  function launch() {
    reset()
    const input = gById('brief-input') as HTMLInputElement
    const v = input.value.trim()
    if (v) {
      const briefTech = v.length > 32 ? v.slice(0, 32) + '…' : v
      nodes['brief'].querySelector('.node-tech')!.textContent = briefTech
    }
    startRun()
  }

  launchBtn.addEventListener('click', launch)
  rerunLink.addEventListener('click', function (e: Event) {
    e.preventDefault()
    launch()
  })
  gateApprove.addEventListener('click', approveGate)
  gateDismiss.addEventListener('click', dismissGate)

  /* Tooltip */
  const tooltip = gById('tooltip')
  let tipPinned = false
  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v))
  }
  function showTip(el: HTMLElement) {
    const n = NODES.length
    let data = null
    for (let i = 0; i < n; i++) if (NODES[i].id === el.dataset.id) data = NODES[i]
    if (!data) return
    tooltip.innerHTML =
      '<span class="t-label">' +
      data.label +
      '</span><span class="t-role">' +
      data.role +
      '</span><span class="t-tech">' +
      data.tech +
      '</span>'
    tooltip.classList.add('show')
    const left = clamp(el.offsetLeft - 8, 8, GRAPH_W - 340)
    tooltip.style.left = left + 'px'
    const h = tooltip.offsetHeight
    let top = el.offsetTop - h - 12
    if (top < 8) top = el.offsetTop + el.offsetHeight + 12
    tooltip.style.top = top + 'px'
  }
  function hideTip() {
    if (tipPinned) return
    tooltip.classList.remove('show')
  }
  nodeEls.forEach(function (el: HTMLElement) {
    el.addEventListener('mouseenter', function () {
      showTip(el)
    })
    el.addEventListener('mouseleave', function () {
      tipPinned = false
      hideTip()
    })
    el.addEventListener('focus', function () {
      showTip(el)
    })
    el.addEventListener('blur', function () {
      tipPinned = false
      hideTip()
    })
    el.addEventListener('click', function (e: Event) {
      if ((e.target as HTMLElement).closest('.gate-actions')) return
      tipPinned = !tipPinned
      if (tipPinned) showTip(el)
      else hideTip()
    })
  })

  /* Claim Check */
  const STATUS_LABEL: Record<string, string> = {
    autorisé: 'Autorisé',
    interdit: 'Interdit',
    avérifier: 'À vérifier',
  }
  function firstMatch(arr: RegExp[], low: string): RegExp | null {
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i].exec(low)
      if (m) return arr[i]
    }
    return null
  }
  function classify(s: string) {
    const low = s.toLowerCase()
    const f = CURRENT.claim.forbidden
    if (
      f.some(function (r: RegExp) {
        return r.test(low)
      })
    ) {
      return {
        status: 'interdit',
        src: 'Allégation absolue ou non démontrable — interdite par le référentiel.',
        doc: 'R-07',
        re: firstMatch(f, low) as RegExp,
      }
    }
    const ok = CURRENT.claim.ok
    for (let i = 0; i < ok.length; i++) {
      if (ok[i].re.test(low))
        return { status: 'autorisé', src: ok[i].src, doc: ok[i].doc, re: ok[i].re }
    }
    const soft = CURRENT.claim.soft
    if (
      soft.some(function (r: RegExp) {
        return r.test(low)
      })
    ) {
      return {
        status: 'avérifier',
        src: 'Chiffre ou engagement non sourcé — à documenter.',
        doc: 'DOC-?',
        re: firstMatch(soft, low) as RegExp,
      }
    }
    return null
  }
  function esc(s: string) {
    return s.replace(/[&<>"']/g, function (c: string) {
      return (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<
          string,
          string
        >
      )[c]
    })
  }
  function highlight(s: string, re: RegExp) {
    const low = s.toLowerCase()
    const m = re.exec(low)
    if (!m) return esc(s)
    const hit = s.slice(m.index, m.index + m[0].length)
    return (
      esc(s.slice(0, m.index)) +
      '<mark>' +
      esc(hit) +
      '</mark>' +
      esc(s.slice(m.index + m[0].length))
    )
  }
  let lastReport = ''
  function runClaims() {
    const ta = gById('claim-textarea') as HTMLTextAreaElement
    const text = ta.value.trim()
    const resultsEl = gById('claim-results')
    const summaryEl = gById('claim-summary')
    resultsEl.innerHTML = ''
    if (!text) {
      resultsEl.innerHTML =
        '<p class="no-claims">Collez une copie marketing pour la passer au contrôle.</p>'
      copyBtn.disabled = true
      return
    }
    const normalized = text.replace(/\s+/g, ' ')
    const m = normalized.match(/[^.!?]+[.!?]+/g)
    const sentences = m
      ? m
          .map(function (s) {
            return s.trim()
          })
          .filter(Boolean)
      : [normalized]
    const rows: ClaimRow[] = []
    let nOk = 0,
      nBad = 0,
      nWarn = 0
    sentences.forEach(function (s: string) {
      const c = classify(s)
      if (!c) return
      if (c.status === 'autorisé') nOk++
      else if (c.status === 'interdit') nBad++
      else nWarn++
      rows.push({ text: s, status: c.status, src: c.src, doc: c.doc, re: c.re })
    })
    if (rows.length === 0) {
      resultsEl.innerHTML =
        '<p class="no-claims">Aucune allégation repérée — la copie passe le contrôle.</p>'
    }
    rows.forEach(function (r: ClaimRow, i: number) {
      const div = document.createElement('div')
      div.className = 'claim-row'
      const cls = r.status === 'autorisé' ? 'ok' : r.status === 'interdit' ? 'bad' : 'warn'
      div.innerHTML =
        '<span class="mark ' +
        cls +
        '" aria-hidden="true"></span>' +
        '<div class="claim-text"><p>' +
        highlight(r.text, r.re) +
        '</p>' +
        '<span class="claim-src"><span class="doc-chip ' +
        cls +
        '">' +
        r.doc +
        '</span>Source — ' +
        r.src +
        '</span></div>' +
        '<span class="claim-tag t-' +
        cls +
        '">' +
        STATUS_LABEL[r.status] +
        '</span>'
      div.style.opacity = '0'
      div.style.transform = 'translateY(6px)'
      resultsEl.appendChild(div)
      setTimeout(
        function () {
          div.style.transition = 'opacity .4s ease, transform .4s ease'
          div.style.opacity = '1'
          div.style.transform = 'none'
        },
        60 + i * 90,
      )
    })
    summaryEl.innerHTML =
      '<span class="sum-chip ok"><span class="swatch" aria-hidden="true"></span><b>' +
      nOk +
      '</b>Autorisé</span>' +
      '<span class="sum-chip bad"><span class="swatch" aria-hidden="true"></span><b>' +
      nBad +
      '</b>Interdit</span>' +
      '<span class="sum-chip warn"><span class="swatch" aria-hidden="true"></span><b>' +
      nWarn +
      '</b>À vérifier</span>'
    lastReport = buildReport(rows, nOk, nBad, nWarn)
    copyBtn.disabled = rows.length === 0
  }
  function buildReport(rows: ClaimRow[], nOk: number, nBad: number, nWarn: number) {
    const lines = ['CLAIM CHECK — Memo Labs · usine agentique', '']
    rows.forEach(function (r: ClaimRow) {
      lines.push('[' + STATUS_LABEL[r.status].toUpperCase() + '] ' + r.text)
      lines.push('  ' + r.doc + ' — ' + r.src)
    })
    lines.push('')
    lines.push(nOk + ' autorisées · ' + nBad + ' interdites · ' + nWarn + ' à vérifier')
    return lines.join('\n')
  }
  function copyReport() {
    if (!lastReport) return
    function done() {
      copyBtn.classList.add('copied')
      copyBtn.textContent = 'Copié'
      setTimeout(function () {
        copyBtn.classList.remove('copied')
        copyBtn.textContent = 'Copier le rapport'
      }, 2000)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastReport).then(done, done)
    } else {
      const ta = document.createElement('textarea')
      ta.value = lastReport
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {}
      document.body.removeChild(ta)
      done()
    }
  }
  const copyBtn = gById('copy-btn') as HTMLButtonElement
  gById('claim-btn').addEventListener('click', runClaims)
  copyBtn.addEventListener('click', copyReport)

  /* Scenarios & product */
  let scanTimer: number | undefined
  const MARKET_DATA: Market[] = [
    { brand: 'NOVA', stat: 'Prix −12 %', tag: 'hot' },
    { brand: 'ALTAIR', stat: 'Nouvelle promesse « sans danger »', tag: 'warn' },
    { brand: 'KITE', stat: 'Hausse du prix de référence', tag: 'hot' },
    { brand: 'MERIDIAN', stat: 'Silence — aucun mouvement', tag: 'ok' },
  ]
  const TANDEM = { strict: false, score: 74 }

  function updateNode(id: string, label: string, tech: string) {
    const n = nodeById(id)
    if (n) {
      n.label = label
      n.tech = tech
    }
    const el = nodes[id]
    if (el) {
      const l = el.querySelector('.node-label')
      if (l) l.textContent = label
      const t = el.querySelector('.node-tech')
      if (t) t.textContent = tech
    }
  }
  function applyScenario(key: string) {
    if (scanTimer) {
      clearInterval(scanTimer)
      scanTimer = undefined
    }
    CURRENT = SCENARIOS[key]
    const nd = CURRENT.nodes
    updateNode('front', nd.front[0], nd.front[1])
    updateNode('api', nd.api[0], nd.api[1])
    updateNode('db', nd.db[0], nd.db[1])
    updateNode('build-ui', nd.build_ui[0], nd.build_ui[1])
    updateNode('build-api', nd.build_api[0], nd.build_api[1])
    updateNode('build-data', nd.build_data[0], nd.build_data[1])
    ;(gById('brief-input') as HTMLInputElement).value = CURRENT.brief
    ;(gById('claim-textarea') as HTMLTextAreaElement).value = CURRENT.claim.defaultText
    document.querySelectorAll<HTMLElement>('.scenario-btn').forEach(function (b: HTMLElement) {
      b.classList.toggle('active', b.dataset.scenario === key)
    })
    const box = document.querySelector('.payoff-box') as HTMLElement
    box.setAttribute('data-product', key)
    gById('claim-title').textContent = CURRENT.name
    gById('app-url').textContent = CURRENT.url
    gById('app-status-name').textContent = 'LIVE'
    document.querySelectorAll<HTMLElement>('.prod-claims, .rail-claims').forEach(function (
      el: HTMLElement,
    ) {
      el.hidden = key !== 'claims'
    })
    document.querySelectorAll<HTMLElement>('.prod-pulse, .rail-pulse').forEach(function (
      el: HTMLElement,
    ) {
      el.hidden = key !== 'pulse'
    })
    document.querySelectorAll<HTMLElement>('.prod-tandem, .rail-tandem').forEach(function (
      el: HTMLElement,
    ) {
      el.hidden = key !== 'tandem'
    })
    setRailSources()
    renderPulse()
    renderTandem()
  }
  function setRailSources() {
    const el = gById('rail-sources')
    if (!el) return
    el.innerHTML = ''
    CURRENT.rail.forEach(function (r: [string, string]) {
      const d = document.createElement('div')
      d.className = 'rail-src'
      d.innerHTML = '<b>' + r[0] + '</b>' + r[1]
      el.appendChild(d)
    })
  }
  function renderPulse() {
    const list = gById('market-list')
    if (!list) return
    list.innerHTML = ''
    MARKET_DATA.forEach(function (m: Market) {
      const row = document.createElement('div')
      row.className = 'market-row'
      const label = m.tag === 'hot' ? 'Alerte' : m.tag === 'warn' ? 'À vérifier' : 'Ok'
      row.innerHTML =
        '<span class="market-brand">' +
        m.brand +
        '</span><span class="market-stat">' +
        m.stat +
        '</span><span class="market-tag ' +
        m.tag +
        '">' +
        label +
        '</span>'
      list.appendChild(row)
    })
    const bars = gById('mini-bars')
    if (!bars) return
    bars.innerHTML = ''
    ;[22, 48, 15, 70, 35, 55, 28, 66, 40, 58, 30, 74, 42, 50, 33, 61].forEach(function (
      h: number,
      i: number,
    ) {
      const s = document.createElement('span')
      s.style.height = h + '%'
      if (i % 4 === 0) s.classList.add('hot')
      bars.appendChild(s)
    })
  }
  function renderTandem() {
    const val = gById('score-value')
    const fill = gById('score-fill')
    if (val) val.textContent = String(TANDEM.score)
    if (fill) {
      fill.style.width = TANDEM.score + '%'
      fill.classList.toggle('low', TANDEM.score < 60)
    }
    const rows = TANDEM.strict
      ? [
          ['Style', '« le plus clair du marché » — comparatif non étayé'],
          ['Garantie', '« aucune faute, garanti » — assertion absolue'],
          ['Forme', '« mieux que tout argument » — tournure faible'],
          ['Rythme', 'phrase de 38 mots — couper en deux'],
        ]
      : [
          ['Style', '« le plus clair du marché » — comparatif à étayer'],
          ['Garantie', '« aucune faute, garanti » — assertion absolue'],
          ['Forme', '« mieux que tout argument » — tournure faible'],
        ]
    const main = gById('tandem-sugg')
    const rail = gById('rail-sugg')
    if (main)
      main.innerHTML = rows
        .map(function (r: string[]) {
          return '<div class="sugg-row"><b>' + r[0] + '</b><span>' + r[1] + '</span></div>'
        })
        .join('')
    if (rail)
      rail.innerHTML = rows
        .slice(0, 2)
        .map(function (r) {
          return '<div class="sugg-row"><b>' + r[0] + '</b><span>' + r[1] + '</span></div>'
        })
        .join('')
  }
  function wireScan() {
    const btn = gById('scan-btn')
    if (!btn) return
    btn.addEventListener('click', function () {
      if (scanTimer) {
        clearInterval(scanTimer)
        scanTimer = undefined
      }
      let i = 0
      scanTimer = setInterval(function () {
        i++
        MARKET_DATA.forEach(function (m: Market, k: number) {
          m.tag = (i + k) % 3 === 0 ? 'hot' : k === 1 ? 'warn' : 'ok'
        })
        renderPulse()
        const h = gById('pulse-hint')
        if (h) h.textContent = 12 + (i % 5) + ' mouvements · ' + (3 + (i % 3)) + ' alertes'
      }, 1200)
    })
  }
  function wireTandem() {
    const relire = gById('relire-btn')
    const mode = gById('mode-btn')
    if (relire)
      relire.addEventListener('click', function () {
        TANDEM.score = TANDEM.strict ? 62 : 72
        renderTandem()
        setTimeout(function () {
          TANDEM.score = TANDEM.strict ? 65 : 78
          renderTandem()
        }, 650)
      })
    if (mode)
      mode.addEventListener('click', function () {
        TANDEM.strict = !TANDEM.strict
        mode.textContent = TANDEM.strict ? 'Strict' : 'Standard'
        TANDEM.score = TANDEM.strict ? 55 : 74
        renderTandem()
      })
  }
  document.querySelectorAll<HTMLElement>('.scenario-btn').forEach(function (b: HTMLElement) {
    b.addEventListener('click', function () {
      applyScenario(b.dataset.scenario!)
      launch()
    })
  })
  wireScan()
  wireTandem()
  setRailSources()
  renderPulse()
  renderTandem()

  setTimeout(launch, 700)
}
