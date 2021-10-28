'use strict'

const { SemanticError } = require('./exceptions.cjs')
const { getPurityLevel } = require('./constants.cjs')
const anyParams = Symbol('Any Params') // temporary

const typeTools = {
  anyParams,
  isTypeAssignableTo: (type, expectedType) => {
    if (typeTools.isNeverType(type) && !typeTools.isNeverType(expectedType)) return true
    if (typeTools.isUnknownType(expectedType) && !typeTools.isUnknownType(type)) return true
    if (typeTools.isNeverType(expectedType) && !typeTools.isNeverType(type)) return false
    if (type.typeSentinel !== expectedType.typeSentinel) return false
    if (type.typeInstance && !expectedType.typeInstance) return true
    if (!type.typeInstance && expectedType.typeInstance) return false
    if (type.typeInstance && expectedType.typeInstance && type.typeInstance !== expectedType.typeInstance) return false
    return type.compare(expectedType)
  },
  assertType: (type, expectedType, pos, message = null) => {
    if (!typeTools.isTypeAssignableTo(type, expectedType)) {
      throw new SemanticError(message ?? `Found type "${type.repr()}", but expected type "${expectedType.repr()}".`, pos)
    }
  },
  getWiderType: (type1, type2, errMessage, errPos) => {
    if (typeTools.isTypeAssignableTo(type2, type1)) return type1
    else if (typeTools.isTypeAssignableTo(type1, type2)) return type2
    else throw new SemanticError(errMessage, errPos)
  },
  isNeverType: (type) => {
    return type.typeSentinel === types.never.typeSentinel
  },
  isUnknownType: (type) => {
    return type.typeSentinel === types.unknown.typeSentinel
  },
}

const createType = (typeSentinel, { repr, compare = () => true, data = {}, typeInstance = null, matchUpGenerics = null, fillGenericParams = null }) => {
  const update = (newProps) => createType(typeSentinel, {
    repr: newProps.repr ?? repr,
    compare: newProps.compare ?? compare,
    data: newProps.data ?? data,
    typeInstance: newProps.typeInstance ?? typeInstance,
    matchUpGenerics: newProps.matchUpGenerics ?? matchUpGenerics,
    fillGenericParams: newProps.fillGenericParams ?? fillGenericParams,
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
    // Match up one type with this type, and call visit() every time a generic parameter is reached.
    matchUpGenerics: matchUpGenerics ?? (({ usingType, onGeneric }) => {
      if (typeInstance) onGeneric({ self, other: usingType })
    }),
    fillGenericParams: fillGenericParams ?? (({ getReplacement }) => {
      if (!typeInstance) return self
      return getReplacement(self)
    })
  }
}

const types = module.exports = {
  unit: createType(Symbol('unit type'), { repr: () => '#unit' }),
  int: createType(Symbol('int type'), { repr: () => '#int' }),
  string: createType(Symbol('string type'), { repr: () => '#string' }),
  boolean: createType(Symbol('boolean type'), { repr: () => '#boolean' }),
  never: createType(Symbol('never type'), { repr: () => '#never' }),
  _recordSentinel: Symbol('record type'),
  _functionSentinel: Symbol('function type'),
  _tagSentinel: Symbol('tag type'),
  unknown: createType(Symbol('unknown type'), { repr: () => '#unknown' }),
  // createTag: ({ genericDefList, type: innerType, tagSymbol = Symbol('tag') }) => {
  //   return createType(types._tagSentinel, {
  //     repr: () => `tag ${innerType.repr()}`,
  //     data: { genericDefList, innerType, tagSymbol },
  //     compare: other => other.data.tagSymbol === tagSymbol,
  //     matchUpGenerics: ({ usingType, onGeneric }) => {
  //       // innerType.matchUpGenerics({ usingType: usingType.data.get(name), onGeneric, })
  //     },
  //     fillGenericParams: ({ getReplacement }) => {
  //       // const newNameToType = new Map()
  //       // for (const [name, type] of nameToType) {
  //       //   newNameToType.set(name, type.fillGenericParams({ getReplacement }))
  //       // }
  //       // return types.createRecord(newNameToType)
  //     },
  //   })
  // },
  createRecord: nameToType => {
    return createType(types._recordSentinel, {
      repr: () => nameToType.size === 0
        ? '#{}'
        : '#{ ' + [...nameToType.entries()].map(([name, type]) => `${name} ${type.repr()}`).join(', ') + ' }',
      data: nameToType,
      compare: other => {
        for (const [name, type] of other.data) {
          const ourType = nameToType.get(name)
          if (!ourType) return false
          if (!typeTools.isTypeAssignableTo(ourType, type)) return false
        }
        return true
      },
      matchUpGenerics: ({ usingType, onGeneric }) => {
        for (const [name, type] of nameToType) {
          type.matchUpGenerics({ usingType: usingType.data.get(name), onGeneric, })
        }
      },
      fillGenericParams: ({ getReplacement }) => {
        const newNameToType = new Map()
        for (const [name, type] of nameToType) {
          newNameToType.set(name, type.fillGenericParams({ getReplacement }))
        }
        return types.createRecord(newNameToType)
      },
    })
  },
  createFunction: ({ paramTypes, genericParamTypes, bodyType, purity }) => {
    return createType(types._functionSentinel, {
      repr: () => {
        const paramsStr = paramTypes === anyParams ? '...#unknown[]' : paramTypes.map(t => t.repr()).join(', ')
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
          const genericIndex = genericParamTypes.findIndex(p => p.typeInstance === param.typeInstance)
          const otherGenericIndex = other.data.genericParamTypes.findIndex(p => p.typeInstance === otherParam.typeInstance)
          if (otherGenericIndex !== -1) {
            if (genericIndex === -1) return false
            if (genericIndex !== otherGenericIndex) return false
          } else {
            if (!typeTools.isTypeAssignableTo(param.uninstantiate(), otherParam)) return false
          }
          return true
        }

        if (paramTypes !== anyParams && other.data.paramTypes !== anyParams) {
          if (genericParamTypes.length !== other.data.genericParamTypes.length) return false
          for (let i = 0; i < genericParamTypes.length; ++i) {
            if (!typeTools.isTypeAssignableTo(genericParamTypes[i].uninstantiate(), other.data.genericParamTypes[i].uninstantiate())) return false
          }
          if (paramTypes.length !== other.data.paramTypes.length) return false
          
          for (let i = 0; i < paramTypes.length; ++i) {
            if (!comparePotentiallyGenericParams(paramTypes[i], other.data.paramTypes[i])) return false
          }
        }
        if (!comparePotentiallyGenericParams(bodyType, other.data.bodyType)) return false
        if (getPurityLevel(purity) < getPurityLevel(other.data.purity)) return false
        return true
      },
      matchUpGenerics: ({ usingType, onGeneric }) => {
        paramTypes.foreach((t, i) => t.matchUpGenerics({
          usingType: usingType.data.paramTypes[i],
          onGeneric,
        }))
        bodyType.matchUpGenerics({ usingType: usingType.data.bodyType, onGeneric })
      },
      fillGenericParams: ({ getReplacement }) => {
        return types.createFunction({
          paramTypes: paramTypes.map(t => t.fillGenericParams({ getReplacement })),
          genericParamTypes,
          bodyType: bodyType.fillGenericParams({ getReplacement }),
          purity,
        })
      },
    })
  },
  typeTools,
}