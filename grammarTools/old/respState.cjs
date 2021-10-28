'use strict'

const respState_ = module.exports = {
  createRespState: ({ outerScopeVars = [], returnTypes = [], declarations = [] } = {}) => ({
    outerScopeVars,
    returnTypes,
    declarations,
    update: opts => respState_.createRespState({
      outerScopeVars: opts.outerScopeVars ?? outerScopeVars,
      returnTypes: opts.returnTypes ?? returnTypes,
      declarations: opts.declarations ?? declarations,
    }),
    applyDeclarations: state => (
      declarations.reduce((state, { identifier, type, identPos }) => state.addToScope(identifier, type, identPos), state)
    ),
  }),
  mergeRespStates: (...states) => respState_.createRespState({
    outerScopeVars: states.flatMap(s => s.outerScopeVars),
    returnTypes: states.flatMap(s => s.returnTypes),
    declarations: states.flatMap(s => s.declarations),
  }),
}