<script setup lang="ts">
import { onMounted } from 'vue'
import { initUsine } from './usine/run'

onMounted(() => {
  initUsine()
})
</script>

<template>
  <div class="grid-bg" aria-hidden="true"></div>

  <header class="brandbar" data-od-id="brandbar">
    <div class="brandbar-in">
      <a class="brand" href="#" aria-label="Memo Labs — accueil">
        <span class="brand-square" aria-hidden="true"></span>
        <span class="brand-name">Memo&nbsp;Labs</span>
        <span class="brand-divider" aria-hidden="true"></span>
        <span class="brand-label">Lab · Usine agentique</span>
      </a>
      <a class="brand-link" href="https://memolabs.dev/en" target="_blank" rel="noopener"
        >memolabs.dev&nbsp;→</a
      >
    </div>
  </header>

  <main id="content">
    <section class="hero" data-od-id="hero">
      <p class="eyebrow" data-od-id="hero-eyebrow">L'usine agentique</p>
      <h1 data-od-id="hero-title">
        <span class="row">Du besoin</span>
        <span class="row">au produit</span>
      </h1>
      <p class="lede" data-od-id="hero-lede">
        Une chaîne d'agents construit un produit de bout en bout, sous vos yeux. Chaque étape est
        tracée, chaque sortie est vérifiée — et le résultat est un vrai produit fonctionnel, pas une
        démo.
      </p>
      <div class="hero-rule">
        <span class="hero-meta">Atelier n°01 · Paris</span>
        <span class="hero-meta">Le run est en direct</span>
      </div>
    </section>

    <section class="brief" data-od-id="brief-bar">
      <div class="scenario-row" data-od-id="scenario-switch">
        <span class="scenario-label">Scénario</span>
        <div class="scenario-btns">
          <button class="scenario-btn active" data-scenario="claims" type="button">
            ClaimCheck
          </button>
          <button class="scenario-btn" data-scenario="pulse" type="button">Pulse</button>
          <button class="scenario-btn" data-scenario="tandem" type="button">Tandem</button>
        </div>
        <span class="scenario-hint">ou écrivez votre propre brief</span>
      </div>
      <div class="brief-in">
        <label class="brief-label" for="brief-input">Brief</label>
        <input
          id="brief-input"
          type="text"
          value="Une app qui vérifie les allégations marketing des marques et cite leurs sources."
          spellcheck="false"
        />
        <button class="launch-btn" id="launch-btn" data-od-id="launch-btn" type="button">
          <span aria-hidden="true">▶</span><span id="launch-label">Lancer l'usine</span>
        </button>
      </div>
    </section>

    <section class="meta" data-od-id="meta-counters">
      <div class="meta-in">
        <div class="meta-item" data-od-id="counter-agents">
          <span class="meta-label">Agents</span>
          <span class="meta-num" id="num-agents">00</span>
        </div>
        <div class="meta-item" data-od-id="counter-phase">
          <span class="meta-label">Phase</span>
          <span class="meta-num" id="num-phase">—</span>
        </div>
        <div class="meta-item" data-od-id="counter-tokens">
          <span class="meta-label">Tokens</span>
          <span class="meta-num" id="num-tokens">0</span>
        </div>
        <div class="meta-item" data-od-id="counter-temps">
          <span class="meta-label">Temps</span>
          <span class="meta-num" id="num-temps">00:00</span>
        </div>
      </div>
    </section>

    <section class="graph-sec" data-od-id="live-graph">
      <div class="narration" data-od-id="narration" aria-live="polite" aria-atomic="true">
        <span class="n-agent" id="n-agent"></span>
        <span class="n-line" id="n-line"
          >L'usine est prête — modifiez le brief ou lancez le run.</span
        >
      </div>
      <div class="graph-scroll">
        <div class="graph" id="graph" data-od-id="graph">
          <div class="tooltip" id="tooltip" aria-hidden="true"></div>
        </div>
      </div>
      <p class="graph-hint" aria-hidden="true">Le graphe défile →</p>
    </section>

    <section class="payoff" id="payoff" data-od-id="claim-check" aria-live="polite">
      <div class="payoff-box" data-product="claims">
        <div class="payoff-head">
          <div>
            <p class="eyebrow">Livré — produit</p>
            <h2 class="payoff-title" data-od-id="claim-title">ClaimCheck v1.0</h2>
            <p class="payoff-sub" data-od-id="claim-recap"></p>
          </div>
          <p class="payoff-note">Généré par le run · fonctionnel</p>
        </div>
        <div class="app-frame">
          <div class="app-bar">
            <span class="app-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="app-url" id="app-url">claimcheck.app — vérification d'allégations</span>
            <span class="app-status"
              ><i aria-hidden="true"></i><span id="app-status-name">LIVE</span></span
            >
          </div>
          <div class="app-body">
            <div class="app-main">
              <div class="prod-claims">
                <label class="claim-field-label" for="claim-textarea"
                  >Copie marketing à contrôler</label
                >
                <textarea id="claim-textarea" data-od-id="claim-textarea" spellcheck="false">
ClaimCheck réduit la revue de plusieurs heures à quelques minutes.
  L'outil est conforme RGPD et ISO 27001.
  Il garantit une précision de 100 % sur les allégations contrôlées.
  Aucun risque : essayez la démo gratuite.
  Rejoignez les 10 000 équipes qui nous font déjà confiance.
  Notre modèle est certifié sans danger pour vos données.</textarea>
                <div class="claim-actions">
                  <button class="claim-btn" id="claim-btn" data-od-id="claim-btn" type="button">
                    Vérifier les allégations
                  </button>
                  <button
                    class="copy-btn"
                    id="copy-btn"
                    data-od-id="copy-btn"
                    type="button"
                    disabled
                  >
                    Copier le rapport
                  </button>
                  <span class="claim-hint">4 sources compilées pendant le run</span>
                </div>
                <div class="claim-summary" id="claim-summary" data-od-id="claim-summary"></div>
                <div class="claim-results" id="claim-results" data-od-id="claim-results"></div>
              </div>
              <div class="prod-pulse" hidden>
                <p class="claim-field-label">Marchés suivis — veille concurrentielle</p>
                <div class="market-list" id="market-list" aria-live="off"></div>
                <div class="claim-actions">
                  <button class="claim-btn" id="scan-btn" data-od-id="scan-btn" type="button">
                    Relancer le scan
                  </button>
                  <span class="claim-hint">Capture en continu · 60 s</span>
                </div>
              </div>
              <div class="prod-tandem" hidden>
                <p class="claim-field-label">Texte relu</p>
                <div class="tandem-text" id="tandem-text">
                  <p>
                    Notre guide est <span class="sugg">le plus clair du marché</span> et ne contient
                    <span class="sugg err">aucune faute, garanti</span>. Relisez-le : la fluidité
                    vous convaincra <span class="sugg">mieux que tout argument</span>.
                  </p>
                </div>
                <div class="claim-actions">
                  <button class="claim-btn" id="relire-btn" data-od-id="relire-btn" type="button">
                    Relire
                  </button>
                  <button class="copy-btn" id="mode-btn" data-od-id="mode-btn" type="button">
                    Standard
                  </button>
                  <span class="claim-hint">Style · Lisibilité · Fautes</span>
                </div>
                <div class="sugg-list" id="tandem-sugg" aria-live="off"></div>
              </div>
            </div>
            <div class="app-rail">
              <div class="rail-claims">
                <p class="claim-field-label">Sources du run</p>
                <div id="rail-sources"></div>
              </div>
              <div class="rail-pulse" hidden>
                <p class="claim-field-label">Mouvements détectés</p>
                <div class="mini-bars" id="mini-bars" aria-hidden="true"></div>
                <p class="claim-hint" id="pulse-hint" aria-live="off">12 mouvements · 3 alertes</p>
              </div>
              <div class="rail-tandem" hidden>
                <p class="claim-field-label">Score de lisibilité</p>
                <div class="score-value" id="score-value" aria-live="off">74</div>
                <div class="score-bar">
                  <span class="score-fill" id="score-fill" style="width: 74%"></span>
                </div>
                <p class="claim-hint">Cible 60+</p>
                <p class="claim-field-label" style="margin-top: 18px">Suggestions</p>
                <div class="sugg-list" id="rail-sugg" aria-live="off"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <footer class="footer" data-od-id="footer">
      <span>Memo Labs — L'usine agentique · run de démonstration</span>
      <span
        ><a href="https://memolabs.dev/en" target="_blank" rel="noopener">memolabs.dev</a> ·
        <a href="#" id="rerun-link">re-lancer</a></span
      >
    </footer>
  </main>
</template>
