'use strict'

const runtime_ = module.exports = {
  createRuntime: ({ scopes = [] } = {}) => ({
    scopes,
    update({ scopes } = {}) {
      return runtime_.createRuntime({
        scopes: scopes ?? [],
      })
    },
    lookupVar(identifier) {
      for (let i = scopes.length - 1; i >= 0; --i) {
        if (scopes[i].identifier === identifier) {
          return scopes[i].value
        }
      }
      return null
    }
  }),
}