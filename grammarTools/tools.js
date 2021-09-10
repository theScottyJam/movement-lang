'use strict'

const top = array => array[array.length - 1]

const createType = (typeSentinel, { repr, compare = () => true, data = {}, typeInstance = null, matchUpTemplates = null, fillTemplateParams = null }) => {
  const update = (newProps) => createType(typeSentinel, {
    repr: newProps.repr ?? repr,
    compare: newProps.compare ?? compare,
    data: newProps.data ?? data,
    typeInstance: newProps.typeInstance ?? typeInstance,
    matchUpTemplates: newProps.matchUpTemplates ?? matchUpTemplates,
    fillTemplateParams: newProps.fillTemplateParams ?? fillTemplateParams,
  })
  let self
  return self = {
    typeSentinel,
    repr,
    compare,
    data,
    typeInstance,
    withName: newName => update({ repr: () => newName }),
    asNewInstance: () => update({ typeInstance: Symbol() }),
    uninstantiate: () => update({ typeInstance: null }),
    // Match up one type with this type, and call visit() every time a template parameter is reached.
    matchUpTemplates: matchUpTemplates ?? (({ usingType, onTemplate }) => {
      if (typeInstance) onTemplate({ self, other: usingType })
    }),
    fillTemplateParams: fillTemplateParams ?? (({ getReplacement }) => {
      if (!typeInstance) return self
      return getReplacement(self)
    })
  }
}

class BaseParseTimeError extends Error {
  constructor(message, pos) {
    super(message)
    this.pos = pos
  }
}

const isPos = Symbol('Position')
const throw_ = msg => { throw new Error(msg) }
const truncate = (msg, amount=100) => {
  if (msg.length <= amount) return msg
  return msg.slice(0, amount - 1) + '…'
}

const DUMMY_POS = { [isPos]: true, line: 1, col: 1, length: 0, offset: 0 }

const tools = module.exports = {
  anyParams: Symbol('Any Params'), // temporary
  asPos: token => token.text == null
    ? throw_(`Internal error: Attempted to extract a position out of the non-token '${truncate(JSON.stringify(token))}'`)
    : ({
      [isPos]: true,
      line: token.line,
      col: token.col,
      length: token.text.length,
      offset: token.offset,
    }),
  range: (token1, token2) => {
    const pos1 = token1[isPos] ? token1 : tools.asPos(token1)
    const pos2 = token2[isPos] ? token2 : tools.asPos(token2)
    return {
      [isPos]: true,
      line: pos1.line,
      col: pos1.col,
      length: (pos2.offset - pos1.offset) + pos2.length,
      offset: pos1.offset,
    }
  },
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
      if (identifier === '$') return this
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
      // createType() is a function and not a plain type, so that unknown types can be added
      // to the scope, and each reference to the unknown type will produce a unique unknown instance
      // preventing you from assigning one unknown type to another.
      if (identifier === '$') return this
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
  createRespState: ({ outerScopeVars = [], returnTypes = [], declarations = [] } = {}) => ({
    outerScopeVars,
    returnTypes,
    declarations,
    update: opts => tools.createRespState({
      outerScopeVars: opts.outerScopeVars ?? outerScopeVars,
      returnTypes: opts.returnTypes ?? returnTypes,
      declarations: opts.declarations ?? declarations,
    }),
    applyDeclarations: state => (
      declarations.reduce((state, { identifier, type, identPos }) => state.addToScope(identifier, type, identPos), state)
    ),
  }),
  mergeRespStates: (...states) => tools.createRespState({
    outerScopeVars: states.flatMap(s => s.outerScopeVars),
    returnTypes: states.flatMap(s => s.returnTypes),
    declarations: states.flatMap(s => s.declarations),
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
        matchUpTemplates: ({ usingType, onTemplate }) => {
          for (const [name, type] of nameToType) {
            type.matchUpTemplates({ usingType: usingType.data.get(name), onTemplate, })
          }
        },
        fillTemplateParams: ({ getReplacement }) => {
          const newNameToType = new Map()
          for (const [name, type] of nameToType) {
            newNameToType.set(name, type.fillTemplateParams({ getReplacement }))
          }
          return tools.types.createRecord(newNameToType)
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
        matchUpTemplates: ({ usingType, onTemplate }) => {
          paramTypes.foreach((t, i) => t.matchUpTemplates({
            usingType: usingType.data.paramTypes[i],
            onTemplate,
          }))
          bodyType.matchUpTemplates({ usingType: usingType.data.bodyType, onTemplate })
        },
        fillTemplateParams: ({ getReplacement }) => {
          return tools.types.createFunction({
            paramTypes: paramTypes.map(t => t.fillTemplateParams({ getReplacement })),
            genericParamTypes,
            bodyType: bodyType.fillTemplateParams({ getReplacement }),
            purity,
          })
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
  getWiderType: (type1, type2, errMessage, errPos) => {
    if (tools.isTypeAssignableTo(type2, type1)) return type1
    else if (tools.isTypeAssignableTo(type1, type2)) return type2
    else throw new tools.SemanticError(errMessage, errPos)
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