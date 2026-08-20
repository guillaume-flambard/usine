/// <reference types="vite/client" />

// Les imports de feuilles de style à effet de bord (tests en navigateur).
declare module '*.css' {
  const feuille: string
  export default feuille
}
