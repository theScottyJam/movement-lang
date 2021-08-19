const createType = (typeSentinel, { repr, compare = () => true, data = null }) => ({
  typeSentinel,
  repr,
  compare,
  data,
})

const grammar = module.exports = {
  node: ({ exec, typeCheck, pos }) => ({
    exec,
    typeCheck,
    pos,
  }),
  createRuntime: ({ scopes = [] } = {}) => ({
    scopes,
    update({ scopes } = {}) {
      return grammar.createRuntime({
        scopes: scopes ?? [],
      })
    },
    lookupVar(identifier) {
      for (let i = scopes.length - 1; i >= 0; --i) {
        if (scopes[i].identifier === identifier) {
          return scopes[i]
        }
      }
      return null
    }
  }),
  createTypeState: ({ scopes = [] } = {}) => ({
    scopes,
    update({ scopes } = {}) {
      return grammar.createRuntime({
        scopes: scopes ?? [],
      })
    },
    lookupVar(identifier) {
      for (let i = scopes.length - 1; i >= 0; --i) {
        if (scopes[i].identifier === identifier) {
          return scopes[i]
        }
      }
      return null
    }
  }),
  types: {
    unit: createType(Symbol('unit type'), { repr: () => '#unit' }),
    int: createType(Symbol('int type'), { repr: () => '#int' }),
    string: createType(Symbol('string type'), { repr: () => '#string' }),
    boolean: createType(Symbol('boolean type'), { repr: () => '#boolean' }),
    recordSentinel: Symbol('record type'),
    functionSentinel: Symbol('function type'),
    createRecord: nameToType => {
      return createType(grammar.types.recordSentinel, {
        repr: () => nameToType.size === 0
          ? '#{}'
          : '#{ ' + [...nameToType.entries()].map(([name, type]) => `${name} ${type.repr()}`).join(', ') + ' }',
        data: nameToType,
        compare: other => {
          for (const [name, type] of nameToType) {
            const otherType = other.data.get(name)
            if (!otherType) return false
            if (!grammar.compareType(type, otherType)) return false
          }
          return true
        },
      })
    },
    createFunction: ({ paramTypes, bodyType }) => {
      return createType(grammar.types.functionSentinel, {
        repr: () => `#(${paramTypes.map(t => t.repr()).join(', ')})${bodyType.repr()}`,
        data: { paramTypes, bodyType },
        compare: other => {
          if (paramTypes.length !== other.data.paramTypes.length) return false
          for (let i = 0; i < paramTypes.length; ++i) {
            if (!grammar.compareType(paramTypes[i], other.data.paramTypes[i])) return false
          }
          if (!grammar.compareType(bodyType, other.data.bodyType)) return false
          return true
        },
      })
    },
  },
  TypeError: class extends Error {
    constructor(message, pos) {
      super(message)
      this.pos = pos
    }
  },
  SemanticError: class extends Error {
    constructor(message, pos) {
      super(message)
      this.pos = pos
    }
  },
  compareType: (type, expectedType) => {
    if (type.typeSentinel !== expectedType.typeSentinel) {
      return false
    }
    return type.compare(expectedType)
  },
  assertType: (type, expectedType, pos) => {
    if (!grammar.compareType(type, expectedType)) {
      throw new grammar.TypeError(`Found type "${type.repr()}", but expected type "${expectedType.repr()}".`, pos)
    }
  },
  assertTypeSentinel: (type, expectedTypeSentinel, name, pos) => {
    if (type.typeSentinel !== expectedTypeSentinel) {
      throw new grammar.TypeError(`Found type "${type.repr()}", but expected type "${name}".`, pos)
    }
  },
  parseType: (typeStr, pos) => {
    if (typeStr === '#int') {
      return grammar.types.int
    } else if (typeStr === '#string') {
      return grammar.types.string
    } else {
      throw new grammar.SemanticError(`Invalid type ${typeStr}`, pos)
    }
  }
}