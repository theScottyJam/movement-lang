'use strict'

const top = array => array[array.length - 1]

const createType = (typeSentinel, { repr, compare = () => true, data = {}, typeInstance = null }) => ({
  typeSentinel,
  repr,
  compare,
  data,
  typeInstance,
  withName: newName => createType(typeSentinel, { repr: () => newName, compare, data, typeInstance }),
  asNewInstance: () => createType(typeSentinel, { repr, compare, data, typeInstance: Symbol() }),
  uninstantiate: () => createType(typeSentinel, { repr, compare, data, typeInstance: null }),
})

class BaseParseTimeError extends Error {
  constructor(message, pos) {
    super(message)
    this.pos = pos
  }
}

const tools = module.exports = {
  anyParams: Symbol('Any Params'), // temporary
  node: ({ exec, typeCheck, data = {}, pos = null }) => ({
    exec,
    typeCheck,
    data,
    pos, // pos can only be omitted on non-expression nodes
  }),
  createValue: ({ raw, type }) => ({ raw, type }),
  createRuntime: ({ scopes = [] } = {}) => ({
    scopes,
    update({ scopes } = {}) {
      return tools.createRuntime({
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
  createTypeState: ({
    scopes = [new Map()],
    definedTypes = [new Map()],
    minPurity = tools.PURITY.pure,
    isBeginBlock = false } = {}
  ) => ({
    scopes,
    definedTypes,
    minPurity,
    isBeginBlock,
    update(opts) {
      return tools.createTypeState({
        scopes: opts.scopes ?? scopes,
        definedTypes: opts.definedTypes ?? definedTypes,
        minPurity: opts.minPurity ?? minPurity,
        isBeginBlock: opts.isBeginBlock ?? isBeginBlock,
      })
    },
    addToScope(identifier, type, pos) {
      const newScope = new Map(top(scopes))
      if (newScope.has(identifier)) {
        throw new tools.SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
      }
      newScope.set(identifier, type)

      return this.update({
        scopes: [...scopes.slice(0, -1), newScope],
      })
    },
    addToTypeScope(identifier, createType, pos) {
      // createType() is a function and not a pure type, so that unknown types can be added
      // to the scope, and each reference to the unknown type will produce a unique unknown instance
      // preventing you from assigning one unknown type to another.
      const newScope = new Map(top(definedTypes))
      if (newScope.has(identifier)) {
        throw new tools.SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
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
  createRespState: ({ outerScopeVars = [], returnTypes = [] } = {}) => ({
    outerScopeVars,
    returnTypes,
    update: opts => tools.createRespState({
      outerScopeVars: opts.outerScopeVars ?? outerScopeVars,
      returnTypes: opts.returnTypes ?? returnTypes,
    }),
  }),
  mergeRespStates: (...states) => tools.createRespState({
    outerScopeVars: states.flatMap(s => s.outerScopeVars),
    returnTypes: states.flatMap(s => s.returnTypes),
  }),
  types: {
    unit: createType(Symbol('unit type'), { repr: () => '#unit' }),
    int: createType(Symbol('int type'), { repr: () => '#int' }),
    string: createType(Symbol('string type'), { repr: () => '#string' }),
    boolean: createType(Symbol('boolean type'), { repr: () => '#boolean' }),
    never: createType(Symbol('never type'), { repr: () => '#never' }),
    _recordSentinel: Symbol('record type'),
    _functionSentinel: Symbol('function type'),
    unknown: createType(Symbol('unknown type'), { repr: () => '#unknown' }),
    createRecord: nameToType => {
      return createType(tools.types._recordSentinel, {
        repr: () => nameToType.size === 0
          ? '#{}'
          : '#{ ' + [...nameToType.entries()].map(([name, type]) => `${name} ${type.repr()}`).join(', ') + ' }',
        data: nameToType,
        compare: other => {
          for (const [name, type] of other.data) {
            const ourType = nameToType.get(name)
            if (!ourType) return false
            if (!tools.isTypeAssignableTo(ourType, type)) return false
          }
          return true
        },
      })
    },
    createFunction: ({ paramTypes, genericParamTypes, bodyType, purity }) => {
      return createType(tools.types._functionSentinel, {
        repr: () => {
          const paramsStr = paramTypes === tools.anyParams ? '...#unknown[]' : paramTypes.map(t => t.repr()).join(', ')
          if (purity === 'NONE') {
            return `#function(${paramsStr}) ${bodyType.repr()}`
          } else {
            const prefix = purity === 'GETS' ? '#gets ' : '#'
            return `${prefix}(${paramsStr}) => ${bodyType.repr()}`
          }
        },
        data: { paramTypes, genericParamTypes, bodyType, purity },
        compare: other => {
          const comparePotentiallyGenericParams = (param, otherParam) => {
            const templateIndex = genericParamTypes.findIndex(p => p.typeInstance === param.typeInstance)
            const otherTemplateIndex = other.data.genericParamTypes.findIndex(p => p.typeInstance === otherParam.typeInstance)
            if (otherTemplateIndex !== -1) {
              if (templateIndex === -1) return false
              if (templateIndex !== otherTemplateIndex) return false
            } else {
              if (!tools.isTypeAssignableTo(param.uninstantiate(), otherParam)) return false
            }
            return true
          }

          if (paramTypes !== tools.anyParams && other.data.paramTypes !== tools.anyParams) {
            if (genericParamTypes.length !== other.data.genericParamTypes.length) return false
            for (let i = 0; i < genericParamTypes.length; ++i) {
              if (!tools.isTypeAssignableTo(genericParamTypes[i].uninstantiate(), other.data.genericParamTypes[i].uninstantiate())) return false
            }
            if (paramTypes.length !== other.data.paramTypes.length) return false
            
            for (let i = 0; i < paramTypes.length; ++i) {
              if (!comparePotentiallyGenericParams(paramTypes[i], other.data.paramTypes[i])) return false
            }
          }
          if (!comparePotentiallyGenericParams(bodyType, other.data.bodyType)) return false
          if (tools.getPurityLevel(purity) < tools.getPurityLevel(other.data.purity)) return false
          return true
        },
      })
    },
  },
  BaseParseTimeError,
  TypeError: class extends BaseParseTimeError {},
  SyntaxError: class extends BaseParseTimeError {},
  SemanticError: class extends BaseParseTimeError {},
  FlowControlError: class extends Error {
    constructor(type, data) {
      super(`This error is intended to control the flow of the program, and should always be caught.`)
      this.type = type
      this.data = data
    }
  },
  RuntimeError: class extends Error {
    constructor(message) {
      super(message)
    }
  },
  isTypeAssignableTo: (type, expectedType) => {
    if (tools.isNeverType(type) && !tools.isNeverType(expectedType)) return true
    if (tools.isUnknownType(expectedType) && !tools.isUnknownType(type)) return true
    if (tools.isNeverType(expectedType) && !tools.isNeverType(type)) return false
    if (type.typeSentinel !== expectedType.typeSentinel) return false
    if (type.typeInstance && !expectedType.typeInstance) return true
    if (!type.typeInstance && expectedType.typeInstance) return false
    if (type.typeInstance && expectedType.typeInstance && type.typeInstance !== expectedType.typeInstance) return false
    return type.compare(expectedType)
  },
  assertType: (type, expectedType, pos, message = null) => {
    if (!tools.isTypeAssignableTo(type, expectedType)) {
      throw new tools.TypeError(message ?? `Found type "${type.repr()}", but expected type "${expectedType.repr()}".`, pos)
    }
  },
  isNeverType: (type) => {
    return type.typeSentinel === tools.types.never.typeSentinel
  },
  isUnknownType: (type) => {
    return type.typeSentinel === tools.types.unknown.typeSentinel
  },
  // Can be monkey-patched if needed, to perform other operations when debugging.
  showDebugOutput: (value) => {
    console.info(value.raw)
  },

  PURITY: {
    none: 'NONE',
    gets: 'GETS',
    pure: 'PURE',
  },
  getPurityLevel: purity => ({ PURE: 2, GETS: 1, NONE: 0 })[purity],
  FLOW_CONTROL: {
    return: 'RETURN',
  },
}