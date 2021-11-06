import * as Type from './Type.js'
import { PURITY, getPurityLevel } from './constants.js'
import { zip } from '../util.js'

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
  readonly paramTypes: readonly Type.AnyType[]
  readonly genericParamTypes: readonly Type.AnyParameterType[]
  readonly bodyType: Type.AnyType
  readonly purity: typeof PURITY[keyof typeof PURITY]
}

export type FunctionType = Type.ConcreteType<{ name: 'function', data: FunctionTypeData }>
const functionCategory = Type.createCategory('function', {
  repr: (self: FunctionType) => {
    const paramsStr = self.data.paramTypes.map(t => Type.repr(t)).join(', ')
    if (self.data.purity === 'NONE') {
      return `#function(${paramsStr}) ${Type.repr(self.data.bodyType)}`
    } else {
      const prefix = self.data.purity === 'GETS' ? '#gets ' : '#'
      return `${prefix}(${paramsStr}) => ${Type.repr(self.data.bodyType)}`
    }
  },
  compare: (self: FunctionType, other: FunctionType) => {
    const comparePotentiallyGenericValues = (assigner: Type.AnyType, assignee: Type.AnyType) => {
      const assignerGenericIndex = Type.isTypeParameter(assigner)
        ? self.data.genericParamTypes.findIndex(p => p.parameterSentinel === assigner.parameterSentinel)
        : -1
      const assigneeGenericIndex = Type.isTypeParameter(assignee)
        ? other.data.genericParamTypes.findIndex(p => p.parameterSentinel === assignee.parameterSentinel)
        : -1

      if (assigneeGenericIndex !== -1) {
        // If the assignee has a generic param found in the function's generic param list
        // then the assigner must also have it
        return assignerGenericIndex === assigneeGenericIndex
      } else {
        // If the assignee does not have a generic param found in the function's generic param list,
        // it could still be generic, but all that needs to happen is for the assigner to be able to assign to the assignee.
        // The assigner may still use a generic param from the generic param list
        // (equality of generic param list is calculated elsewhere), or something like this.
        const concreteAssigner = Type.isTypeParameter(assigner) ? assigner.constrainedBy : assigner
        return Type.isTypeAssignableTo(concreteAssigner, assignee)
      }
    }

    type GenericParamsType = typeof self.data.genericParamTypes
    const genericParamsMatchUp = (assignerGenerics: GenericParamsType, assigneeGenerics: GenericParamsType) => (
      assignerGenerics.length === assigneeGenerics.length &&
      zip(assignerGenerics, assigneeGenerics)
        .every(([ownGeneric, otherGeneric]) => Type.isTypeAssignableTo(ownGeneric.constrainedBy, otherGeneric.constrainedBy))
    )

    type ParamsType = readonly Type.AnyType[]
    const paramsMatchUp = (assignerParams: ParamsType, assigneeParams: ParamsType) => (
      assignerParams.length === assigneeParams.length &&
      zip(assignerParams, assigneeParams)
        .every(([ownParamType, otherParamType]) => comparePotentiallyGenericValues(ownParamType, otherParamType))
    )

    return (
      genericParamsMatchUp(self.data.genericParamTypes, other.data.genericParamTypes) &&
      paramsMatchUp(self.data.paramTypes, other.data.paramTypes) &&
      comparePotentiallyGenericValues(self.data.bodyType, other.data.bodyType) &&
      getPurityLevel(self.data.purity) >= getPurityLevel(other.data.purity)
    )
  },
  matchUpGenerics: (self: FunctionType, { usingType, onGeneric }) => {
    for (const [t, usingTypeParamType] of zip(self.data.paramTypes, usingType.data.paramTypes)) {
      Type.matchUpGenerics(t, {
        usingType: usingTypeParamType,
        onGeneric,
      })
    }
    Type.matchUpGenerics(self.data.bodyType, { usingType: usingType.data.bodyType, onGeneric })
  },
  fillGenericParams: (self: FunctionType, { getReplacement }) => {
    return createFunction({
      paramTypes: self.data.paramTypes.map(t => Type.fillGenericParams(t, { getReplacement })),
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
export const isFunction = (type: Type.AnyConcreteType): type is FunctionType => functionCategory.typeInCategory(type)
