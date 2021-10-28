'use strict'

const { SemanticError } = require('./exceptions.cjs')
const { PURITY } = require('./constants.cjs')

const top = array => array[array.length - 1]

const typeState_ = module.exports = {
  createTypeState: ({
    scopes = [new Map()],
    definedTypes = [new Map()],
    minPurity = PURITY.pure,
    isBeginBlock = false
  } = {}) => ({
    scopes,
    definedTypes,
    minPurity,
    isBeginBlock,
    update(opts) {
      return typeState_.createTypeState({
        scopes: opts.scopes ?? scopes,
        definedTypes: opts.definedTypes ?? definedTypes,
        minPurity: opts.minPurity ?? minPurity,
        isBeginBlock: opts.isBeginBlock ?? isBeginBlock,
      })
    },
    addToScope(identifier, type, pos) {
      if (identifier === '$') return this
      const newScope = new Map(top(scopes))
      if (newScope.has(identifier)) {
        throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
      }
      newScope.set(identifier, type)

      return this.update({
        scopes: [...scopes.slice(0, -1), newScope],
      })
    },
    addToTypeScope(identifier, createType, pos) {
      // createType() is a function and not a plain type, so that unknown types can be added
      // to the scope, and each reference to the unknown type will produce a unique unknown instance
      // preventing you from assigning one unknown type to another.
      if (identifier === '$') return this
      const newScope = new Map(top(definedTypes))
      if (newScope.has(identifier)) {
        throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
      }
      newScope.set(identifier, createType)

      return this.update({
        definedTypes: [...definedTypes.slice(0, -1), newScope],
      })
    },
    lookupVar(identifier) {
      for (let scope of [...scopes].reverse()) {
        const type = scope.get(identifier)
        if (type) return { type, fromOuterScope: scope !== top(scopes) }
      }
      return null
    },
    lookupType(identifier) {
      for (let scope of [...definedTypes].reverse()) {
        const createType = scope.get(identifier)
        if (createType) return { createType }
      }
      return null
    },
  }),
}