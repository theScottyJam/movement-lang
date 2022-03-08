import { assertUnreachable } from '../util'

type ValueOf<T> = T[keyof T]

export const PURITY = {
  none: 'NONE',
  gets: 'GETS',
  pure: 'PURE',
} as const

export const getPurityLevel = purity => ({ PURE: 2, GETS: 1, NONE: 0 })[purity]

export const VARIANCE_DIRECTION = {
  covariant: 'COVARIANT', // default
  contravariant: 'CONTRAVARIANT', // against default (e.g. like a function parameter)
  invariant: 'INVARIANT', // Two types must be exactly equal, one can't be "wider"
} as const

export const flipVarianceDirection = (direction: ValueOf<typeof VARIANCE_DIRECTION>) => {
  if (direction === VARIANCE_DIRECTION.covariant) {
    return VARIANCE_DIRECTION.contravariant
  } else if (direction === VARIANCE_DIRECTION.contravariant) {
    return VARIANCE_DIRECTION.covariant
  } else if (direction === VARIANCE_DIRECTION.invariant) {
    return VARIANCE_DIRECTION.invariant
  } else {
    assertUnreachable(direction)
  }
}