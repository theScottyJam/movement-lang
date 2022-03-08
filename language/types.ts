import * as Type from './Type'
import * as typeProtocols from './typeProtocols'
import { PURITY, getPurityLevel } from './constants'
import { VARIANCE_DIRECTION, flipVarianceDirection } from './constants'
import { pipe, zip } from '../util'

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
const symbolCategory = Type.createCategory('symbol', {
  repr: (self: SymbolType) => `#typeof(${reprSymbolWithoutTypeText(self)})`,
  compare: (self: SymbolType, other: SymbolType) => self.data.value === other.data.value,
})
export const createSymbol = ({ name, value }: Partial<SymbolData>) => (
  symbolCategory.create({ data: { name: name ?? null, value: value ?? Symbol() } })
)
export const reprSymbolWithoutTypeText = (self: SymbolType) => `symbol${self.data.name ? ' ' + self.data.name : ''}`
export const isSymbol = (type: Type.AnyConcreteType): type is SymbolType => symbolCategory.typeInCategory(type)

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
  neverCategory.typeInCategory(Type.getConcreteConstrainingType(type))

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
  alignTypes: (self: TypeContainerType, other: TypeContainerType, optsToForward) => {
    // TODO: write tests for this
    Type.alignTypes(self.data.containedType, other.data.containedType, optsToForward)
  },
  deepMap: (self: TypeContainerType, optsToForward): TypeContainerType => {
    // TODO: write tests for this
    return createTypeContainer({
      containerSentinel: self.data.containerSentinel,
      containedType: Type.deepMap(self.data.containedType, optsToForward),
    })
  },
  protocols: typeProtocols.typeContainer,
})
export const createTypeContainer = (data: TypeContainerData): TypeContainerType => (
  typeContainerCategory.create({ data })
)
export const isTypeContainer = (type: Type.AnyConcreteType): type is TypeContainerType => typeContainerCategory.typeInCategory(type)


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
  alignTypes: (self: TagType, other: TagType, optsToForward) => {
    Type.alignTypes(self.data.boxedType, other.data.boxedType, optsToForward)
  },
  deepMap: (self: TagType, optsToForward): TagType => {
    return createTag({
      tagSentinel: self.data.tagSentinel,
      boxedType: Type.deepMap(self.data.boxedType, optsToForward),
    })
  },
  protocols: typeProtocols.tag,
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
  alignTypes: (self: TaggedType, other: TaggedType, optsToForward) => {
    // TODO: write tests for this
    Type.alignTypes(self.data.tag, other.data.tag, optsToForward)
  },
  deepMap: (self: TaggedType, optsToForward): TaggedType => {
    // TODO: write tests for this
    const tag = Type.deepMap(self.data.tag, optsToForward)
    if (Type.isTypeParameter(tag) || !tagCategory.typeInCategory(tag)) {
      throw new Error("INTERNAL ERROR: deepMap() changed a tag's content to an invalid value.")
    }
    return createTagged({ tag })
  },
})
export const createTagged = ({ tag }: TaggedTypeData): TaggedType => taggedCategory.create({
  data: { tag },
})


// Record //

interface RecordTypeData {
  readonly nameToType: Map<string, Type.AnyType>
  readonly symbolToInfo: Map<symbol, { symbType: SymbolType, type: Type.AnyType }>
}

export type RecordType = Type.ConcreteType<{ name: 'record', data: RecordTypeData }>
const recordCategory = Type.createCategory('record', {
  repr: (self: RecordType) => self.data.nameToType.size + self.data.symbolToInfo.size === 0
    ? '#{}'
    : (
      '#{ ' +
      [
        ...[...self.data.nameToType.entries()]
          .map(([name, type]) => `${name} ${Type.repr(type)}`),
        ...[...self.data.symbolToInfo.entries()]
          .map(([, { symbType, type }]) => `[${Type.repr(symbType)}] ${Type.repr(type)}`),
      ].join(', ') +
      ' }'
    ),
  compare: (self: RecordType, other: RecordType) => {
    for (const [name, type] of other.data.nameToType) {
      const ourType = self.data.nameToType.get(name)
      if (!ourType) return false
      if (!Type.isTypeAssignableTo(ourType, type)) return false
    }
    for (const [symb, { type }] of other.data.symbolToInfo) {
      const ourType = self.data.symbolToInfo.get(symb)?.type
      if (!ourType) return false
      if (!Type.isTypeAssignableTo(ourType, type)) return false
    }
    return true
  },
  alignTypes: (self: RecordType, other: RecordType, optsToForward) => {
    for (const [name, type] of self.data.nameToType) {
      Type.alignTypes(type, other.data.nameToType.get(name), optsToForward)
    }
    for (const [symb, { type }] of self.data.symbolToInfo) {
      Type.alignTypes(type, other.data.symbolToInfo.get(symb).type, optsToForward)
    }
  },
  deepMap: (self: RecordType, optsToForward): RecordType => {
    const newNameToType = new Map() as RecordTypeData['nameToType']
    const newSymbolToInfo = new Map() as RecordTypeData['symbolToInfo']
    for (const [name, type] of self.data.nameToType) {
      newNameToType.set(name, Type.deepMap(type, optsToForward))
    }
    for (const [symb, { symbType, type }] of self.data.symbolToInfo) {
      newSymbolToInfo.set(symb, { symbType, type: Type.deepMap(type, optsToForward) })
    }
    return createRecord({ nameToType: newNameToType, symbolToInfo: newSymbolToInfo })
  },
  protocols: typeProtocols.record,
})

export const createRecord = (data: RecordTypeData): RecordType => recordCategory.create({ data })


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
    const genericStr = pipe(
      self.data.genericParamTypes.map(t => (
        !Type.isTypeParameter(t.constrainedBy) && isUnknown(t.constrainedBy)
        ? `${t.parameterName}`
        : `${t.parameterName} of ${Type.repr(t.constrainedBy)}`
      )),
      $=> $.length === 0 ? '' : `<${$.join(', ')}>`
    )
    if (self.data.purity === 'NONE') {
      return `#function${genericStr}(${paramsStr}) ${Type.repr(self.data.bodyType)}`
    } else {
      const prefix = self.data.purity === 'GETS' ? '#gets ' : '#'
      return `${prefix}${genericStr}(${paramsStr}) => ${Type.repr(self.data.bodyType)}`
    }
  },
  compare: (self: FunctionType, other: FunctionType) => {
    const comparePotentiallyGenericValues = (assignee: Type.AnyType, assigner: Type.AnyType, { assignerIsWider }: { assignerIsWider: boolean }) => {
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
        return assignerIsWider
          ? Type.isTypeAssignableTo(assigner, Type.getConstrainingType(assignee))
          : Type.isTypeAssignableTo(assignee, Type.getConstrainingType(assigner))
      }
    }

    type GenericParamsType = typeof self.data.genericParamTypes
    const genericTypeParamsMatchUp = (assignerGenerics: GenericParamsType, assigneeGenerics: GenericParamsType) => (
      assignerGenerics.length === assigneeGenerics.length &&
      zip(assignerGenerics, assigneeGenerics)
        .every(([ownGeneric, otherGeneric]) => (
          // The constraints must be exactly equal to each other.
          // This is because, depending on where the generic is used (in a function parameter or return type),
          // the assigner's constraint either has to be wider, less wide, of the same as the assignee.
          // To make things simpler, I'm just going to force them to always be the same, instead of trying
          // to auto-detect what could be possible.
          Type.isTypeAssignableTo(otherGeneric.constrainedBy, ownGeneric.constrainedBy) &&
          Type.isTypeAssignableTo(ownGeneric.constrainedBy, otherGeneric.constrainedBy)
        ))
    )

    type ParamsType = readonly Type.AnyType[]
    const paramsMatchUp = (assignerParams: ParamsType, assigneeParams: ParamsType) => (
      assignerParams.length === assigneeParams.length &&
      zip(assignerParams, assigneeParams)
        .every(([ownParamType, otherParamType]) => comparePotentiallyGenericValues(otherParamType, ownParamType, { assignerIsWider: false }))
    )

    return (
      genericTypeParamsMatchUp(self.data.genericParamTypes, other.data.genericParamTypes) &&
      paramsMatchUp(self.data.paramTypes, other.data.paramTypes) &&
      comparePotentiallyGenericValues(other.data.bodyType, self.data.bodyType, { assignerIsWider: true }) &&
      getPurityLevel(self.data.purity) >= getPurityLevel(other.data.purity)
    )
  },
  alignTypes: (self: FunctionType, other: FunctionType, originalOptsToForward) => {
    for (const [t, usingTypeParamType] of zip(self.data.paramTypes, other.data.paramTypes)) {
      Type.alignTypes(t, usingTypeParamType, {
        ...originalOptsToForward,
        varianceDirection: flipVarianceDirection(originalOptsToForward.varianceDirection),
      })
    }
    Type.alignTypes(self.data.bodyType, other.data.bodyType, originalOptsToForward)
  },
  deepMap: (self: FunctionType, optsToForward_) => {
    const optsToForward: typeof optsToForward_ = {
      ...optsToForward_,
      availableGenerics: [...optsToForward_.availableGenerics, ...self.data.genericParamTypes],
    }
    return createFunction({
      paramTypes: self.data.paramTypes.map(t => Type.deepMap(t, { ...optsToForward, varianceDirection: flipVarianceDirection(optsToForward.varianceDirection) })),
      // The deepMap() will go into the type constraints
      // (but not the types of the generics themselves, just their constraining types)
      genericParamTypes: self.data.genericParamTypes.map(t => pipe(
        Type.deepMap(t.constrainedBy, { ...optsToForward, varianceDirection: VARIANCE_DIRECTION.invariant }),
        $=> Type.withNewConstraint(t, $)
      )),
      bodyType: Type.deepMap(self.data.bodyType, optsToForward),
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
