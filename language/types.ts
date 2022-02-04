import * as Type from './Type'
import { PURITY, getPurityLevel } from './constants'
import { zip } from '../util'

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

interface SymbolData { name?: string | null, value: symbol }
export type SymbolType = Type.ConcreteType<{ name: 'symbol', data: SymbolData }>
const SymbolCategory = Type.createCategory('symbol', {
  repr: (self: SymbolType) => `#typeof(symbol${self.data.name ? ' ' + self.data.name : ''})`,
  compare: (self: SymbolType, other: SymbolType) => self.data.value === other.data.value,
})
export const createSymbol = ({ name, value }: Partial<SymbolData>) => (
  SymbolCategory.create({ data: { name: name ?? null, value: value ?? Symbol() } })
)

// Used only within the content of a private tag, to hold arbitrary information
export type InternalType = Type.ConcreteType<{ name: 'internal', data: undefined }>
const internalCategory = Type.createCategory('internal', {
  repr: (self: InternalType) => '#<internal>',
})
export const createInternal = () => internalCategory.create()

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


// TypeContainer //

interface TypeContainerData {
  readonly containerSentinel: symbol
  readonly containedType: Type.AnyType
}

export type TypeContainerType = Type.ConcreteType<{ name: 'typeContainer', data: TypeContainerData }>
const typeContainerCategory = Type.createCategory('typeContainer', {
  repr: (self: TypeContainerType) => `#typeof(type ${Type.repr(self.data.containedType)})`,
  compare: (self: TypeContainerType, other: TypeContainerType) => self.data.containerSentinel === other.data.containerSentinel,
  matchUpGenerics: (self: TypeContainerType, { usingType, onGeneric }) => {
    // TODO: Not sure if I'm doing this right
    Type.matchUpGenerics(self.data.containedType, { usingType: usingType.data.containedType, onGeneric })
  },
  fillGenericParams: (self: TypeContainerType, { getReplacement }): TypeContainerType => {
    // TODO: Not sure if I'm doing this right
    return createTypeContainer({
      containerSentinel: self.data.containerSentinel,
      containedType: Type.fillGenericParams(self.data.containedType, { getReplacement }),
    })
  },
  // TODO: It should be possible to use template parameters in the type definition
  // (so I shouldn't need to use getConstrainingType)
  createDescendentMatchingType: (self: TypeContainerType) => Type.getConstrainingType(self.data.containedType),
})
export const createTypeContainer = (data: TypeContainerData): TypeContainerType => (
  typeContainerCategory.create({ data })
)


// Tag //

interface TagTypeData {
  readonly tagSentinel: symbol
  readonly boxedType: Type.AnyType
  readonly name?: string | null
}

export type TagType = Type.ConcreteType<{ name: 'tag', data: TagTypeData }>
const tagCategory = Type.createCategory('tag', {
  repr: (self: TagType) => `#typeof(tag ${self.data.name ? self.data.name + ' ' : ''}${Type.repr(self.data.boxedType)})`,
  compare: (self: TagType, other: TagType) => self.data.tagSentinel === other.data.tagSentinel,
  matchUpGenerics: (self: TagType, { usingType, onGeneric }) => {
    Type.matchUpGenerics(self.data.boxedType, { usingType: usingType.data.boxedType, onGeneric })
  },
  fillGenericParams: (self: TagType, { getReplacement }): TagType => {
    return createTag({
      tagSentinel: self.data.tagSentinel,
      boxedType: Type.fillGenericParams(self.data.boxedType, { getReplacement }),
    })
  },
  createDescendentMatchingType: (self: TagType) => createTagged({ tag: self })
})
export const createTag = (data: TagTypeData): TagType => tagCategory.create({ data })


// Tagged //

interface TaggedTypeData {
  readonly tag: TagType
}

export type TaggedType = Type.ConcreteType<{ name: 'tagged', data: TaggedTypeData }>
const taggedCategory = Type.createCategory('tagged', {
  repr: (self: TaggedType) => `#:tag ${Type.repr(self.data.tag.data.boxedType)}`,
  compare: (self: TaggedType, other: TaggedType) => self.data.tag.data.tagSentinel === other.data.tag.data.tagSentinel,
  matchUpGenerics: (self: TaggedType, { usingType, onGeneric }) => {
    // TODO: Not sure if I implemented this right
    Type.matchUpGenerics(self.data.tag, { usingType: usingType.data.tag, onGeneric })
  },
  fillGenericParams: (self: TaggedType, { getReplacement }): TaggedType => {
    const tag = Type.fillGenericParams(self.data.tag, { getReplacement })
    return createTagged({
      // TODO: Not sure if I should be throwing an error here.
      tag: Type.isTypeParameter(tag) ? (()=>{throw new Error()})() : tag,
    })
  },
})
export const createTagged = ({ tag }: TaggedTypeData): TaggedType => taggedCategory.create({
  data: { tag },
})


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
    const comparePotentiallyGenericValues = (assigner: Type.AnyType, assignee: Type.AnyType, { selfIsWider }: { selfIsWider: boolean }) => {
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
        // it could still be generic, but all that needs to happen is for the assigner to be able to assign
        // to the assignee (or vice-versa, depending on the comparison direction).
        // The assigner may still use a generic param from the generic param list
        // (equality of generic param list is calculated elsewhere), or something like this.
        const concreteAssigner = Type.isTypeParameter(assigner) ? assigner.constrainedBy : assigner
        return selfIsWider
          ? Type.isTypeAssignableTo(concreteAssigner, assignee)
          : Type.isTypeAssignableTo(assignee, concreteAssigner)
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
        .every(([ownParamType, otherParamType]) => comparePotentiallyGenericValues(ownParamType, otherParamType, { selfIsWider: false }))
    )

    return (
      genericParamsMatchUp(self.data.genericParamTypes, other.data.genericParamTypes) &&
      paramsMatchUp(self.data.paramTypes, other.data.paramTypes) &&
      comparePotentiallyGenericValues(self.data.bodyType, other.data.bodyType, { selfIsWider: true }) &&
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
