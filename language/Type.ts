import { SemanticError } from './exceptions'
import type { Position } from './Position'

const categoryBehaviors = Symbol('Category behaviors')

export const COMPARISON_OVERRIDES = {
  universalAssigner: 'UNIVERSAL_ASSIGNER',
  universalAssignee: 'UNIVERSAL_ASIGNEE',
} as const

//
// Types
//

interface CategoryGenerics {
  readonly name: string
  readonly data: unknown
}

type onGenricFn = <T extends CategoryGenerics>(opts: { self: ParameterType<T>, other: ConcreteType<T> }) => void
type getReplacementFn = <T extends CategoryGenerics>(self: ParameterType<T>) => Type<T>

interface MatchUpGenericsFnOpts<T extends CategoryGenerics> {
  readonly usingType: ConcreteType<T>
  readonly onGeneric: onGenricFn
}

interface ExportedMatchUpGenericsFnOpts<T extends CategoryGenerics> {
  readonly usingType: Type<T>
  readonly onGeneric: onGenricFn
}

interface FillGenericParamsFnOpts {
  readonly getReplacement: getReplacementFn
}

export interface CategoryInfo<T extends CategoryGenerics> {
  readonly name: T['name']
  readonly comparisonOverride: typeof COMPARISON_OVERRIDES[keyof typeof COMPARISON_OVERRIDES]
  readonly [categoryBehaviors]: {
    readonly repr: (self: ConcreteType<T>) => string,
    readonly compare: (self: ConcreteType<T>, other: ConcreteType<T>) => boolean,
    readonly matchUpGenerics: (self: Type<T>, opts: MatchUpGenericsFnOpts<T>) => void,
    readonly fillGenericParams: (self: Type<T>, opts: FillGenericParamsFnOpts) => Type<T>,
  }
}

export interface ConcreteType<T extends CategoryGenerics> {
  readonly category: CategoryInfo<T>
  readonly data: T['data']
  readonly reprOverride?: string
}

export interface ParameterType<T extends CategoryGenerics> {
  readonly constrainedBy: ConcreteType<T>
  readonly parameterName: string
  readonly parameterSentinel: symbol
}

export type Type<T extends CategoryGenerics> = ConcreteType<T> | ParameterType<T>

export type AnyType = Type<{ name: string, data: unknown }>
export type AnyConcreteType = ConcreteType<{ name: string, data: unknown }>
export type AnyParameterType = ParameterType<{ name: string, data: unknown }>

interface CreateCategoryOpts<T extends CategoryGenerics> {
  readonly repr: (self: ConcreteType<T>) => string
  readonly compare?: (self: ConcreteType<T>, other: ConcreteType<T>) => boolean
  readonly comparisonOverride?: typeof COMPARISON_OVERRIDES[keyof typeof COMPARISON_OVERRIDES]
  readonly matchUpGenerics?: (self: Type<T>, opts: MatchUpGenericsFnOpts<T>) => void
  readonly fillGenericParams?: (self: Type<T>, opts: FillGenericParamsFnOpts) => Type<T>
}

interface CreateTypeOpts<Data> {
  readonly data?: Data
  readonly reprOverride?: string
  readonly typeInstance?: symbol
}

interface CreateParameterTypeOpts<T extends CategoryGenerics> {
  readonly constrainedBy: ConcreteType<T>
  readonly parameterName: string
}

interface UpdateParameterTypeOpts<T extends CategoryGenerics> {
  readonly constrainedBy?: ConcreteType<T>
  readonly parameterName?: string
  readonly parameterSentinel?: symbol
}

//
// Implementations
//

export function isTypeParameter<T extends CategoryGenerics>(type: Type<T>): type is ParameterType<T> {
  return 'parameterSentinel' in type
}

export function assertIsTypeParameter<T extends CategoryGenerics>(type: Type<T>, errMessage = 'INTERNAL ERROR: Expected a parameter type'): ParameterType<T> {
  if (!('parameterSentinel' in type)) throw new Error(errMessage)
  return type
}

export function assertIsConcreteType<T extends CategoryGenerics>(type: Type<T>, errMessage = 'INTERNAL ERROR: Expected a concrete type'): ConcreteType<T> {
  if ('parameterSentinel' in type) throw new Error(errMessage)
  return type
}

function defaultMatchUpGenericsFn<T extends CategoryGenerics>(self: ConcreteType<T>, { usingType, onGeneric }: MatchUpGenericsFnOpts<T>) {
  
}

function defaultFillGenericParamsFn<T extends CategoryGenerics>(self: ConcreteType<T>, { getReplacement }: FillGenericParamsFnOpts) {
  return self
}

export function createCategory<T extends CategoryGenerics>(name: T['name'], opts: CreateCategoryOpts<T>) {
  const {
    repr,
    compare = (self, other) => true,
    comparisonOverride = null,
    matchUpGenerics = defaultMatchUpGenericsFn,
    fillGenericParams = defaultFillGenericParamsFn,
  } = opts

  const categoryInfo: CategoryInfo<T> = {
    name,
    comparisonOverride,
    [categoryBehaviors]: {
      repr,
      compare,
      matchUpGenerics,
      fillGenericParams,
    }
  }

  return {
    create: (opts: CreateTypeOpts<T['data']> = {}) => createType(categoryInfo, opts),
    typeInCategory: (type: AnyConcreteType): type is ConcreteType<T> => type.category.name === categoryInfo.name,
  }
}

function createType<T extends CategoryGenerics>(categoryInfo: CategoryInfo<T>, opts: CreateTypeOpts<T['data']> = {}): ConcreteType<T> {
  return {
    category: categoryInfo,
    data: opts.data ?? undefined,
    reprOverride: opts.reprOverride ?? null,
  }
}

export function createParameterType<T extends CategoryGenerics>(opts: CreateParameterTypeOpts<T>): ParameterType<T> {
  return {
    constrainedBy: opts.constrainedBy,
    parameterName: opts.parameterName,
    parameterSentinel: Symbol('Generic parameter type sentinel'),
  }
}

function update<T extends CategoryGenerics>(type: ConcreteType<T>, newProps: Partial<CreateTypeOpts<T>>): ConcreteType<T> {
  return createType(type.category, {
    reprOverride: newProps.reprOverride ?? type.reprOverride,
    data: newProps.data ?? type.data,
  })
}

function updateParameterType<T extends CategoryGenerics>(type: ParameterType<T>, newProps: Partial<UpdateParameterTypeOpts<T>>): ParameterType<T> {
  return {
    constrainedBy: newProps.constrainedBy ?? type.constrainedBy,
    parameterName: newProps.parameterName ?? type.parameterName,
    parameterSentinel: newProps.parameterSentinel ?? type.parameterSentinel,
  }
}

export function withName<T extends CategoryGenerics>(type: Type<T>, newName: string): Type<T> {
  if (isTypeParameter(type)) {
    return updateParameterType(type, { parameterName: newName })
  } else {
    return update(type, { reprOverride: newName })
  }
}

export function repr<T extends CategoryGenerics>(type: Type<T>): string {
  if (isTypeParameter(type)) return type.parameterName
  else return type.reprOverride ?? type.category[categoryBehaviors].repr(type)
}

// Match up one type with this type, and call onGeneric() every time a generic parameter is reached.
export function matchUpGenerics<T extends CategoryGenerics>(type: Type<T>, { usingType, onGeneric }: ExportedMatchUpGenericsFnOpts<T>): void {
  if (isTypeParameter(usingType)) throw new Error('INTERNAL ERROR')
  if (isTypeParameter(type)) {
    onGeneric({ self: type, other: usingType })
    return
  }
  type.category[categoryBehaviors].matchUpGenerics(type, { usingType, onGeneric })
}

// Return a new type, where all generic params have been replaced with concrete types.
export function fillGenericParams<T extends CategoryGenerics>(type: Type<T>, { getReplacement }: FillGenericParamsFnOpts): Type<T> {
  if (isTypeParameter(type)) return getReplacement(type)
  return type.category[categoryBehaviors].fillGenericParams(type, { getReplacement })
}

//
// Type comparison functions
//

export function isTypeAssignableTo(assigner: AnyType, assignee: AnyType): boolean {
  const isUniversalAssigner = (type: AnyType) =>
    !isTypeParameter(type) && type.category.comparisonOverride === COMPARISON_OVERRIDES.universalAssigner

  const isUniversalAssignee = (type: AnyType) =>
    isTypeParameter(type)
      ? type.constrainedBy.category.comparisonOverride === COMPARISON_OVERRIDES.universalAssignee
      : type.category.comparisonOverride === COMPARISON_OVERRIDES.universalAssignee

  if (isUniversalAssigner(assigner) || isUniversalAssignee(assignee)) return true
  if (isUniversalAssigner(assignee) || isUniversalAssignee(assigner)) return false

  if (!isTypeParameter(assigner) && isTypeParameter(assignee)) {
    return false
  } else if (isTypeParameter(assigner) && !isTypeParameter(assignee)) {
    return isTypeAssignableTo(assigner.constrainedBy, assignee)
  } else if (isTypeParameter(assigner) && isTypeParameter(assignee)) {
    return assigner.parameterSentinel === assignee.parameterSentinel
  } else if (!isTypeParameter(assigner) && !isTypeParameter(assignee)) {
    return (
      assigner.category.name === assignee.category.name &&
      assigner.category[categoryBehaviors].compare(assigner, assignee)
    )
  } else throw new Error()
}

export function assertTypeAssignableTo(type: AnyType, expectedType: AnyType, pos: Position, message: string = null): void {
  if (!isTypeAssignableTo(type, expectedType)) {
    throw new SemanticError(message ?? `Found type "${repr(type)}", but expected type "${repr(expectedType)}".`, pos)
  }
}

// e.g. #{} is wider than #{ x #int }, because it accepts more as an assignment target.
export function getWiderType(types: AnyType[], errMessage: string, errPos: Position): AnyType {
  for (const type of types) {
    if (types.every(checkType => isTypeAssignableTo(checkType, type))) {
      return type
    }
  }

  throw new SemanticError(errMessage, errPos)
}
