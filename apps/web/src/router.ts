import { createMemoryHistory, createRouter } from 'vue-router'

// Nuxt UI resolves links through a router, so one must exist. The application
// does not route yet: a memory history keeps vue-router away from the address
// bar, and a catch-all keeps it from warning about unmatched locations.
export function createAppRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)', component: { render: () => null } }],
  })
}
