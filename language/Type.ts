import { SemanticError } from './exceptions.js'
import type { Position } from './Position.js'

const categoryBehaviors = Symbol('Category behaviors')

export const COMPARISON_OVERRIDES = {
  universalAssigner: 'UNIVERSAL_ASSIGNER',
  universalAsignee: 'UNIVERSAL_ASIGNEE',
} as const

interface CategoryGenerics {
  readonly name: string
  readonly data: unknown
}

type onGenricFn = <T extends CategoryGenerics>(opts: { self: Type<T>, other: Type<T> }) => void
type getReplacementFn = <T extends CategoryGenerics>(self: Type<T>) => Type<T>

interface MatchUpGenericsFnOpts<T extends CategoryGenerics> {
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
    readonly repr: (self: Type<T>) => string,
    readonly compare: (self: Type<T>, other: Type<T>) => boolean,
    readonly matchUpGenerics: (self: Type<T>, opts: MatchUpGenericsFnOpts<T>) => void,
    readonly fillGenericParams: (self: Type<T>, opts: FillGenericParamsFnOpts) => Type<T>,
  }
}

export interface Type<T extends CategoryGenerics> {
  readonly category: CategoryInfo<T>
  readonly data: T['data']
  readonly reprOverride?: string
  readonly typeInstance: symbol
}

export interface AnyType extends Type<{ name: string, data: unknown }> {}

interface CreateCategoryOpts<T extends CategoryGenerics> {
  readonly repr: (self: Type<T>) => string
  readonly compare?: (self: Type<T>, other: Type<T>) => boolean
  readonly comparisonOverride?: typeof COMPARISON_OVERRIDES[keyof typeof COMPARISON_OVERRIDES]
  readonly matchUpGenerics?: (self: Type<T>, opts: MatchUpGenericsFnOpts<T>) => void
  readonly fillGenericParams?:(self: Type<T>, opts: FillGenericParamsFnOpts) => Type<T>
}

interface CreateTypeOpts<Data> {
  readonly data?: Data
  readonly reprOverride?: string
  readonly typeInstance?: symbol
}

function defaultMatchUpGenericsFn<T extends CategoryGenerics>(self: Type<T>, { usingType, onGeneric }: MatchUpGenericsFnOpts<T>) {
  if (self.typeInstance) onGeneric({ self, other: usingType })
}

function defaultFillGenericParamsFn<T extends CategoryGenerics>(self: Type<T>, { getReplacement }: FillGenericParamsFnOpts) {
  if (!self.typeInstance) return self
  return getReplacement(self)
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
    typeInCategory: (type: AnyType): type is Type<T> => type.category.name === categoryInfo.name,
  }
}

function createType<T extends CategoryGenerics>(categoryInfo: CategoryInfo<T>, opts: CreateTypeOpts<T['data']> = {}): Type<T> {
  const {
    data = undefined,
    reprOverride = null,
    typeInstance = null,
  } = opts

  const behaviors = categoryInfo[categoryBehaviors]

  let self
  return self = {
    category: categoryInfo,
    data,
    reprOverride,
    typeInstance,
  }
}

function update<T extends CategoryGenerics>(type: Type<T>, newProps: Partial<CreateTypeOpts<T>>): Type<T> {
  return createType(type.category, {
    reprOverride: newProps.reprOverride ?? type.reprOverride,
    data: newProps.data ?? type.data,
    typeInstance: newProps.typeInstance ?? type.typeInstance,
  })
}

export function withName<T extends CategoryGenerics>(type: Type<T>, newName: string): Type<T> {
  return update(type, { reprOverride: newName })
}

export function asNewInstance<T extends CategoryGenerics>(type: Type<T>): Type<T> {
  return update(type, { typeInstance: Symbol() })
}

export function uninstantiate<T extends CategoryGenerics>(type: Type<T>): Type<T> {
  return update(type, { typeInstance: null })
}

export function repr<T extends CategoryGenerics>(type: Type<T>): string {
  return type.reprOverride ?? type.category[categoryBehaviors].repr(type)
}

// Match up one type with this type, and call visit() every time a generic parameter is reached.
export function matchUpGenerics<T extends CategoryGenerics>(type: Type<T>, { usingType, onGeneric }: MatchUpGenericsFnOpts<T>): void {
  type.category[categoryBehaviors].matchUpGenerics(type, { usingType, onGeneric })
}

// Return a new type, where all generic params have been replaced with concrete types.
export function fillGenericParams<T extends CategoryGenerics>(type: Type<T>, { getReplacement }: FillGenericParamsFnOpts): Type<T> {
  return type.category[categoryBehaviors].fillGenericParams(type, { getReplacement })
}

// Type comparison functions //

function isNeverType(type: AnyType): boolean {
  return type.category.comparisonOverride === COMPARISON_OVERRIDES.universalAssigner
}

function isUnknownType(type: AnyType): boolean {
  return type.category.comparisonOverride === COMPARISON_OVERRIDES.universalAsignee
}

export function isTypeAssignableTo(type: AnyType, expectedType: AnyType): boolean {
  if (isNeverType(type) && !isNeverType(expectedType)) return true
  if (isUnknownType(expectedType) && !isUnknownType(type)) return true
  if (isNeverType(expectedType) && !isNeverType(type)) return false
  if (type.category.name !== expectedType.category.name) return false
  if (type.typeInstance && !expectedType.typeInstance) return true
  if (!type.typeInstance && expectedType.typeInstance) return false
  if (type.typeInstance && expectedType.typeInstance && type.typeInstance !== expectedType.typeInstance) return false
  return type.category[categoryBehaviors].compare(type, expectedType)
}

export function assertTypeAssignableTo(type: AnyType, expectedType: AnyType, pos: Position, message: string = null): void {
  if (!isTypeAssignableTo(type, expectedType)) {
    throw new SemanticError(message ?? `Found type "${repr(type)}", but expected type "${repr(expectedType)}".`, pos)
  }
}

export function getWiderType(type1: AnyType, type2: AnyType, errMessage: string, errPos: Position): AnyType {
  if (isTypeAssignableTo(type2, type1)) return type1
  else if (isTypeAssignableTo(type1, type2)) return type2
  else throw new SemanticError(errMessage, errPos)
}
