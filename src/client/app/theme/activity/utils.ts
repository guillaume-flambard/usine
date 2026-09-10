import { Activity } from '@cordisjs/client'
import type { Dict } from '@cordisjs/client'

// `'theme.activity'` reste OBLIGATOIRE ici, et c'est `Flatten` qui rend chaque
// branche facultative. Le rendre optionnel à la source paraît plus juste et ne
// l'est pas : `[K in keyof S]` conserve l'optionalité, donc `[keyof S]` fait
// entrer `undefined` dans l'union, et `Intersect<X | undefined>` vaut `never`.
// Tout le typage des scopes s'effondrait en silence.
declare module '@cordisjs/client' {
  interface ActionContext {
    'theme.activity': Activity
  }

  interface Config {
    activities?: Dict<ActivityOverride>
  }
}

interface ActivityOverride {
  hidden?: boolean
  parent?: string
  order?: number
  position?: 'top' | 'bottom'
}
