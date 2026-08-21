import { runExperiment, type Check } from './experiment'

const render = (checks: Check[]) => {
  const total = checks.length
  const passed = checks.filter((c) => c.ok).length
  const lines = checks
    .map(
      (c) =>
        `<li data-ok="${c.ok}">${c.ok ? 'OK' : 'FAIL'} · ${c.id} · ${c.label} <small>${c.detail}</small></li>`,
    )
    .join('')
  document.body.innerHTML = `
    <h1 id="verdict" data-passed="${passed}" data-total="${total}">SPIKE ${passed}/${total}</h1>
    <ul id="results">${lines}</ul>`
}

runExperiment()
  .then(render)
  .catch((error: unknown) => {
    document.body.innerHTML = `<h1 id="verdict" data-passed="0" data-total="0">SPIKE CRASHED</h1><pre id="error">${String(error)}\n${(error as Error)?.stack ?? ''}</pre>`
  })
