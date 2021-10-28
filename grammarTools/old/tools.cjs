'use strict'

const { typeTools, ...types } = require('./types.cjs')

module.exports = {
  ...require('./position.cjs'),
  mapMapValues: (map, mapFn) => (
    new Map([...map.entries()].map(([key, value]) => [key, mapFn(value)]))
  ),
  node: ({ exec, typeCheck, contextlessTypeCheck, data = {}, pos = null }) => ({
    exec,
    typeCheck,
    contextlessTypeCheck, // Only needed by assignment targets
    data,
    pos, // pos can only be omitted on non-expression nodes
  }),
  createValue: ({ raw, type }) => ({ raw, type }),
  createRuntime: require('./runtime.cjs').createRuntime,
  createTypeState: require('./typeState.cjs').createTypeState,
  ...require('./respState.cjs'),
  types,
  ...typeTools,
  ...require('./exceptions.cjs'),
  ...require('./constants.cjs'),

  // Can be monkey-patched if needed, to perform other operations when debugging.
  showDebugOutput: (value) => {
    console.info(value.raw)
  },
}