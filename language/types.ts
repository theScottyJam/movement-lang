import * as Type from './Type.js'
import { PURITY, getPurityLevel } from './constants.js'

export const anyParams = Symbol('Any Params') // Temporary. Won't be needed once spread syntax is in place, because you could just use the type `(...unknown[]) => unknown`

export type UnitType = Type.ConcreteType<{ name: 'unit', data: undefined }>
const unitCategory = Type.createCategory('unit', {
  repr: (self: UnitType) => '#unit',
})
export const createUnit = (): UnitType => unitCategory.create()

export type IntType = Type.ConcreteType<{ name: 'int', data: undefined }>
const intCategory = Type.createCategory('int', {
  repr: (self: IntType) => '#int',
})
export const createInt = () => intCategory.create()

export type StringType = Type.ConcreteType<{ name: 'string', data: undefined }>
const stringCategory = Type.createCategory('string', {
  repr: (self: StringType) => '#string',
})
export const createString = () => stringCategory.create()

export type BooleanType = Type.ConcreteType<{ name: 'boolean', data: undefined }>
const booleanCategory = Type.createCategory('boolean', {
  repr: (self: BooleanType) => '#boolean',
})
export const createBoolean = () => booleanCategory.create()

export type NeverType = Type.ConcreteType<{ name: 'never', data: undefined }>
const neverCategory = Type.createCategory('never', {
  repr: (self: NeverType) => '#never',
  comparisonOverride: Type.COMPARISON_OVERRIDES.universalAssigner,
})
export const createNever = () => neverCategory.create()
export const isNever = (type: Type.AnyConcreteType): type is NeverType => neverCategory.typeInCategory(type)
export const isEffectivelyNever = (type: Type.AnyType): type is NeverType =>
  Type.isTypeParameter(type)
    ? neverCategory.typeInCategory(type.constrainedBy)
    : neverCategory.typeInCategory(type)

export type UnknownType = Type.ConcreteType<{ name: 'unknown', data: undefined }>
const unknownCategory = Type.createCategory('unknown', {
  repr: (self: UnknownType) => '#unknown',
  comparisonOverride: Type.COMPARISON_OVERRIDES.universalAssignee,
})
export const createUnknown = () => unknownCategory.create()
export const isUnknown = (type: Type.AnyConcreteType): type is UnknownType => unknownCategory.typeInCategory(type)

// createTag: ({ genericDefList, type: innerType, tagSymbol = Symbol('tag') }) => {
//   return createType(types._tagSentinel, {
//     repr: () => `tag ${innerType.repr()}`,
//     data: { genericDefList, innerType, tagSymbol },
//     compare: other => other.data.tagSymbol === tagSymbol,
//     matchUpGenerics: (self, { usingType, onGeneric }) => {
//       // innerType.matchUpGenerics({ usingType: usingType.data.get(name), onGeneric, })
//     },
//     fillGenericParams: (self, { getReplacement }) => {
//       // const newNameToType = new Map()
//       // for (const [name, type] of nameToType) {
//       //   newNameToType.set(name, type.fillGenericParams({ getReplacement }))
//       // }
//       // return types.createRecord(newNameToType)
//     },
//   })
// },


// Record //

interface RecordTypeData {
  readonly nameToType: Map<string, Type.AnyType>
}

export type RecordType = Type.ConcreteType<{ name: 'record', data: RecordTypeData }>
const recordCategory = Type.createCategory('record', {
  repr: (self: RecordType) => self.data.nameToType.size === 0
    ? '#{}'
    : '#{ ' + [...self.data.nameToType.entries()].map(([name, type]) => `${name} ${Type.repr(type)}`).join(', ') + ' }',
  compare: (self: RecordType, other: RecordType) => {
    for (const [name, type] of other.data.nameToType) {
      const ourType = self.data.nameToType.get(name)
      if (!ourType) return false
      if (!Type.isTypeAssignableTo(ourType, type)) return false
    }
    return true
  },
  matchUpGenerics: (self: RecordType, { usingType, onGeneric }) => {
    for (const [name, type] of self.data.nameToType) {
      Type.matchUpGenerics(type, { usingType: usingType.data.nameToType.get(name), onGeneric })
    }
  },
  fillGenericParams: (self: RecordType, { getReplacement }): RecordType => {
    const newNameToType = new Map()
    for (const [name, type] of self.data.nameToType) {
      newNameToType.set(name, Type.fillGenericParams(type, { getReplacement }))
    }
    return createRecord({ nameToType: newNameToType })
  },
})

export const createRecord = (nameToType: RecordTypeData): RecordType => recordCategory.create({ data: nameToType })


// Function //

interface FunctionTypeData {
  readonly paramTypes: readonly Type.AnyType[] | typeof anyParams
  readonly genericParamTypes: readonly Type.AnyParameterType[]
  readonly bodyType: Type.AnyType
  readonly purity: typeof PURITY[keyof typeof PURITY]
}

export type FunctionType = Type.ConcreteType<{ name: 'function', data: FunctionTypeData }>
const functionCategory = Type.createCategory('function', {
  repr: (self: FunctionType) => {
    const paramsStr = self.data.paramTypes === anyParams ? '...#unknown[]' : self.data.paramTypes.map(t => Type.repr(t)).join(', ')
    if (self.data.purity === 'NONE') {
      return `#function(${paramsStr}) ${Type.repr(self.data.bodyType)}`
    } else {
      const prefix = self.data.purity === 'GETS' ? '#gets ' : '#'
      return `${prefix}(${paramsStr}) => ${Type.repr(self.data.bodyType)}`
    }
  },
  compare: (self: FunctionType, other: FunctionType) => {
    const comparePotentiallyGenericParams = (param: Type.AnyType, otherParam: Type.AnyType) => {
      const genericIndex = Type.isTypeParameter(param)
        ? self.data.genericParamTypes.findIndex(p => p.parameterSentinel === param.parameterSentinel)
        : -1
      const otherGenericIndex = Type.isTypeParameter(otherParam)
        ? other.data.genericParamTypes.findIndex(p => p.parameterSentinel === otherParam.parameterSentinel)
        : -1

      if (otherGenericIndex !== -1) {
        return genericIndex === otherGenericIndex
      } else {
        const concreteParam = Type.isTypeParameter(param) ? param.constrainedBy : param
        return Type.isTypeAssignableTo(concreteParam, otherParam)
      }
    }

    if (self.data.paramTypes !== anyParams && other.data.paramTypes !== anyParams) {
      if (self.data.genericParamTypes.length !== other.data.genericParamTypes.length) return false
      for (let i = 0; i < self.data.genericParamTypes.length; ++i) {
        if (!Type.isTypeAssignableTo(self.data.genericParamTypes[i].constrainedBy, other.data.genericParamTypes[i].constrainedBy)) return false
      }
      if (self.data.paramTypes.length !== other.data.paramTypes.length) return false
      
      for (let i = 0; i < self.data.paramTypes.length; ++i) {
        if (!comparePotentiallyGenericParams(self.data.paramTypes[i], other.data.paramTypes[i])) return false
      }
    }
    if (!comparePotentiallyGenericParams(self.data.bodyType, other.data.bodyType)) return false
    if (getPurityLevel(self.data.purity) < getPurityLevel(other.data.purity)) return false
    return true
  },
  matchUpGenerics: (self: FunctionType, { usingType, onGeneric }) => {
    if (self.data.paramTypes !== anyParams) {
      for (const [i, t] of self.data.paramTypes.entries()) {
        Type.matchUpGenerics(t, {
          usingType: usingType.data.paramTypes[i],
          onGeneric,
        })
      }
    }
    Type.matchUpGenerics(self.data.bodyType, { usingType: usingType.data.bodyType, onGeneric })
  },
  fillGenericParams: (self: FunctionType, { getReplacement }) => {
    return createFunction({
      paramTypes: self.data.paramTypes === anyParams ? anyParams : self.data.paramTypes.map(t => Type.fillGenericParams(t, { getReplacement })),
      genericParamTypes: self.data.genericParamTypes,
      bodyType: Type.fillGenericParams(self.data.bodyType, { getReplacement }),
      purity: self.data.purity,
    })
  },
})

export const createFunction = ({ paramTypes, genericParamTypes, bodyType, purity }: FunctionTypeData): FunctionType => functionCategory.create({
  data: {
    paramTypes,
    genericParamTypes,
    bodyType,
    purity,
  },
})
