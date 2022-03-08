import { assertUnreachable, pipe } from '../util'
import { SemanticError } from './exceptions'
import type { Position } from './Position'
import { VARIANCE_DIRECTION } from './constants'

const categoryBehaviors = Symbol('Category behaviors')

export const COMPARISON_OVERRIDES = {
  universalAssigner: 'UNIVERSAL_ASSIGNER',
  universalAssignee: 'UNIVERSAL_ASIGNEE',
} as const

//
// Types
//

type ValueOf<T> = T[keyof T]

export interface CategoryGenerics {
  readonly name: string
  readonly data: unknown
}

interface ExportedAlignTypesFnOpts {
  readonly visit: <T extends CategoryGenerics>(self: Type<T>, other: Type<T>, { varianceDirection }: { varianceDirection: ValueOf<typeof VARIANCE_DIRECTION> }) => { visitChildren: boolean }
  // true if we're in a region where types should become more relax than their constrain, instead of more restrictive.
  // e.g. in the following example, the function parameter types are contravariant while return types are covariant,
  // which is why this assignment is allowed.
  // `let fn #(obj #{ x #int }) => #{} = (obj #{}) => { x: 2 }`
  // (assignment checks, like above, aren't directly related to this specific property as
  // that's not handled by align-type logic, but it does describe what covariance/contravariant means)
  readonly varianceDirection?: ValueOf<typeof VARIANCE_DIRECTION>
}

type AlignTypesFnOpts = Required<ExportedAlignTypesFnOpts>

interface ExportedDeepMapFnOpts {
  readonly visit: <T extends CategoryGenerics>(self: Type<T>, opts: { availableGenerics: readonly AnyParameterType[], varianceDirection: ValueOf<typeof VARIANCE_DIRECTION> }) =>
    { keepNesting: true } | { keepNesting: false, replaceWith: AnyType }
  // Contains a list of new generic types available at this place in the type.
  // For example, in #{ fn #<T>() => #T }, availableGenerics will contain the #T type
  // while visiting nodes within the function type.
  readonly availableGenerics?: readonly AnyParameterType[]
  readonly varianceDirection?: ValueOf<typeof VARIANCE_DIRECTION>
}

type DeepMapFnOpts = Required<ExportedDeepMapFnOpts>

export interface Protocols<T extends CategoryGenerics> {
  /// Before calling this function, turn your type into a concrete type with getConcreteConstrainingType()
  childType?: ((self: ConcreteType<T>) => { success: false } | { success: true, type: AnyType }) | null,
}

export interface CategoryInfo<T extends CategoryGenerics> {
  readonly name: T['name']
  readonly comparisonOverride: typeof COMPARISON_OVERRIDES[keyof typeof COMPARISON_OVERRIDES]
  readonly [categoryBehaviors]: {
    readonly repr: (self: ConcreteType<T>) => string,
    readonly compare: (self: ConcreteType<T>, other: ConcreteType<T>) => boolean,
    readonly alignTypes: (self: Type<T>, other: Type<T>, opts: AlignTypesFnOpts) => void,
    readonly deepMap: (self: Type<T>, opts: DeepMapFnOpts) => AnyType,
    readonly protocols: Protocols<T>,
  }
}

// Represents a non-generic type
export interface ConcreteType<T extends CategoryGenerics> {
  readonly category: CategoryInfo<T>
  readonly data: T['data']
  readonly reprOverride?: string
}

// Represents a generic type
export interface ParameterType<T extends CategoryGenerics> {
  readonly constrainedBy: Type<T>
  readonly parameterName: string
  readonly parameterSentinel: symbol
}

export type Type<T extends CategoryGenerics> = ConcreteType<T> | ParameterType<T>

// A concrete type is like #int, while a parameter type refers to a generic type variable (like #T)
export type AnyType = Type<{ name: string, data: unknown }>
export type AnyConcreteType = ConcreteType<{ name: string, data: unknown }>
export type AnyParameterType = ParameterType<{ name: string, data: unknown }>

interface CreateCategoryOpts<T extends CategoryGenerics> {
  readonly repr: (self: ConcreteType<T>) => string
  readonly compare?: (self: ConcreteType<T>, other: ConcreteType<T>) => boolean
  readonly comparisonOverride?: typeof COMPARISON_OVERRIDES[keyof typeof COMPARISON_OVERRIDES]
  readonly alignTypes?: (self: Type<T>, other: Type<T>, opts: AlignTypesFnOpts) => void
  readonly deepMap?: (self: Type<T>, opts: DeepMapFnOpts) => AnyType
  readonly protocols?: Protocols<T>
}

interface CreateTypeOpts<Data> {
  readonly data?: Data
  readonly reprOverride?: string
  readonly typeInstance?: symbol
}

interface CreateParameterTypeOpts<T extends CategoryGenerics> {
  readonly constrainedBy: Type<T>
  readonly parameterName: string
}

interface UpdateParameterTypeOpts<T extends CategoryGenerics> {
  readonly constrainedBy?: Type<T>
  readonly parameterName?: string
  readonly parameterSentinel?: symbol
}

//
// Implementations
//

export function isTypeParameter<T extends CategoryGenerics>(type: Type<T>): type is ParameterType<T> {
  return 'parameterSentinel' in type
}

/// Gets the immediate constraining type (which could be another generic parameter)
export function getConstrainingType<T extends CategoryGenerics>(type: Type<T>): Type<T> {
  return isTypeParameter(type) ? type.constrainedBy : type
}

/// Recursively get constraining types until you arrive at a concrete type.
/// i.e. #U could be constrained by #T, which in turn is constrained by #{ x #int }.
/// If #U is passed in, then #{ x #int } will be returned.
export function getConcreteConstrainingType<T extends CategoryGenerics>(type: Type<T>): ConcreteType<T> {
  return isTypeParameter(type) ? getConcreteConstrainingType(type.constrainedBy) : type
}

export function assertIsTypeParameter<T extends CategoryGenerics>(type: Type<T>, errMessage = 'INTERNAL ERROR: Expected a parameter type'): ParameterType<T> {
  if (!('parameterSentinel' in type)) throw new Error(errMessage)
  return type
}

export function assertIsConcreteType<T extends CategoryGenerics>(type: Type<T>, errMessage = 'INTERNAL ERROR: Expected a concrete type'): ConcreteType<T> {
  if ('parameterSentinel' in type) throw new Error(errMessage)
  return type
}

function defaultAlignTypesFn<T extends CategoryGenerics>(self: ConcreteType<T>, other: ConcreteType<T>, opts: AlignTypesFnOpts) {
  
}

function defaultDeepMapFn<T extends CategoryGenerics>(self: ConcreteType<T>, opts: DeepMapFnOpts) {
  return self
}

export function createCategory<T extends CategoryGenerics>(name: T['name'], opts: CreateCategoryOpts<T>) {
  const {
    repr,
    compare = (self, other) => true,
    comparisonOverride = null,
    alignTypes = defaultAlignTypesFn,
    deepMap = defaultDeepMapFn,
    protocols = {},
  } = opts

  const categoryInfo: CategoryInfo<T> = {
    name,
    comparisonOverride,
    [categoryBehaviors]: {
      repr,
      compare,
      alignTypes,
      deepMap,
      protocols,
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

export function withNewConstraint<T extends CategoryGenerics>(type: ParameterType<T>, newConstraint: Type<T>) {
  return updateParameterType(type, { constrainedBy: newConstraint })
}

export function repr<T extends CategoryGenerics>(type: Type<T>): string {
  if (isTypeParameter(type)) return type.parameterName
  else return type.reprOverride ?? type.category[categoryBehaviors].repr(type)
}

// Match up one type with this type, and call visit() on each pair
// Behavior is currently undefined if the types don't actually line up
// (though, you're allowed to line up generics with non-generics)
export function alignTypes<T extends CategoryGenerics>(type1: Type<T>, type2: Type<T>, { visit, varianceDirection = VARIANCE_DIRECTION.covariant }: ExportedAlignTypesFnOpts): void {
  const { visitChildren } = visit(type1, type2, { varianceDirection })
  if (visitChildren) {
    getConcreteConstrainingType(type1).category[categoryBehaviors].alignTypes(type1, type2, { visit, varianceDirection })
  }
}

// Maps over all nodes (root and leaves), and stops at any point where keepNesting returns false,
// replacing the type with the returned replaceWith property.
// Only values of the same type can be returned (though, you can turn generics into non-generics).
export function deepMap<T extends CategoryGenerics>(type: Type<T>, { visit, availableGenerics = [], varianceDirection = VARIANCE_DIRECTION.covariant }: ExportedDeepMapFnOpts): AnyType {
  const result = visit(type, { availableGenerics, varianceDirection })
  if (result.keepNesting === false) return result.replaceWith

  function mapIntoGenerics(innerType: Type<T>) {
    // call deepMap() on the argument
    if (!isTypeParameter(innerType)) {
      return innerType.category[categoryBehaviors].deepMap(innerType, { visit, availableGenerics, varianceDirection })
    }
    // re-wrap generic, calling deepMap on it's constraining type.
    return pipe(
      mapIntoGenerics(innerType.constrainedBy),
      $=> withNewConstraint(innerType, $)
    )
  }

  return mapIntoGenerics(type)
}

// Basically the same as deepMap(), except you don't have the option to replace types.
type NestedForEachVisitFn = (self: AnyType) => { keepNesting: boolean }
export function nestedForEach<T extends CategoryGenerics>(type: Type<T>, visit: NestedForEachVisitFn): void {
  deepMap<T>(type, {
    visit(self, opts) {
      const { keepNesting } = visit(self)
      return keepNesting
        ? { keepNesting: true }
        : { keepNesting: false, replaceWith: self }
    },
  })
}

export function getProtocols(type: AnyType, pos: Position) {
  return getConcreteConstrainingType(type).category[categoryBehaviors].protocols
}

//
// Type comparison functions
//

export function isTypeAssignableTo(assigner: AnyType, assignee: AnyType): boolean {
  const isUniversalAssigner = (type: AnyType) =>
    isTypeParameter(type)
      ? getConcreteConstrainingType(type).category.comparisonOverride === COMPARISON_OVERRIDES.universalAssigner
      : type.category.comparisonOverride === COMPARISON_OVERRIDES.universalAssigner

  const isUniversalAssignee = (type: AnyType) =>
    !isTypeParameter(type) && type.category.comparisonOverride === COMPARISON_OVERRIDES.universalAssignee
  
  if (isUniversalAssigner(assigner) || isUniversalAssignee(assignee)) return true
  if (isUniversalAssigner(assignee) || isUniversalAssignee(assigner)) return false

  if (!isTypeParameter(assigner) && isTypeParameter(assignee)) {
    return false
  } else if (isTypeParameter(assigner) && !isTypeParameter(assignee)) {
    return isTypeAssignableTo(assigner.constrainedBy, assignee)
  } else if (isTypeParameter(assigner) && isTypeParameter(assignee)) {
    let currentAssigner: AnyType = assigner
    do {
      if (currentAssigner.parameterSentinel === assignee.parameterSentinel) return true
      currentAssigner = currentAssigner.constrainedBy
    } while (isTypeParameter(currentAssigner))
    return false
  } else if (!isTypeParameter(assigner) && !isTypeParameter(assignee)) {
    return (
      assigner.category.name === assignee.category.name &&
      assigner.category[categoryBehaviors].compare(assigner, assignee)
    )
  } else throw new Error()
}

export function assertTypeAssignableTo(type: AnyType, expectedType: AnyType, pos: Position, lastArg: { varianceDirection: ValueOf<typeof VARIANCE_DIRECTION>, errMessage: string } | string = null): void {
  const defaultErrMessage = `Found type "${repr(type)}", but expected type "${repr(expectedType)}".`

  const { varianceDirection = VARIANCE_DIRECTION.covariant, errMessage = defaultErrMessage } = (
    lastArg == null ? {} :
    typeof lastArg === 'string' ? { varianceDirection: VARIANCE_DIRECTION.covariant, errMessage: lastArg } :
    lastArg
  )

  let matches: boolean
  if (varianceDirection === VARIANCE_DIRECTION.covariant) {
    matches = isTypeAssignableTo(type, expectedType)
  } else if (varianceDirection === VARIANCE_DIRECTION.contravariant) {
    matches = isTypeAssignableTo(expectedType, type)
  } else if (varianceDirection === VARIANCE_DIRECTION.invariant) {
    matches = (
      isTypeAssignableTo(type, expectedType) &&
      isTypeAssignableTo(expectedType, type)
    )
  } else {
    assertUnreachable(varianceDirection)
  }

  if (!matches) {
    throw new SemanticError(errMessage, pos)
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
