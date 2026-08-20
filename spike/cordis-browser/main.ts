import { runExperiment, type Check } from './experiment'

const rendu = (checks: Check[]) => {
  const total = checks.length
  const reussis = checks.filter((c) => c.ok).length
  const lignes = checks
    .map(
      (c) =>
        `<li data-ok="${c.ok}">${c.ok ? 'OK' : 'ECHEC'} · ${c.id} · ${c.label} <small>${c.detail}</small></li>`,
    )
    .join('')
  document.body.innerHTML = `
    <h1 id="verdict" data-reussis="${reussis}" data-total="${total}">SPIKE ${reussis}/${total}</h1>
    <ul id="resultats">${lignes}</ul>`
}

runExperiment()
  .then(rendu)
  .catch((error: unknown) => {
    document.body.innerHTML = `<h1 id="verdict" data-reussis="0" data-total="0">SPIKE PLANTE</h1><pre id="erreur">${String(error)}\n${(error as Error)?.stack ?? ''}</pre>`
  })
