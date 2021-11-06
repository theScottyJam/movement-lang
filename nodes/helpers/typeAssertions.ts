import * as values from '../../language/values.js'
import * as types from '../../language/types.js'

export function assertNotNullish<T>(value: T | null): T {
  if (value == null) {
    throw new Error(`INTERNAL ERROR: Value was undefined or null`)
  }
  return value
}

export function assertBigInt(value: unknown): bigint {
  if (typeof value !== 'bigint') {
    throw new Error(`INTERNAL ERROR: Expected type bigint, but received type ${typeof value}`)
  }
  return value
}

export function assertRawRecordValue(x: unknown): values.RecordValue['raw'] {
  if (!(x instanceof Map)) {
    throw new Error(`INTERNAL ERROR: Received a value of an incorrect type`)
  }

  // Assuming values are a correct type, because iterating over each value would be too slow.
  return x as values.RecordValue['raw']
}

export function assertRecordInnerDataType(value: unknown): types.RecordType['data'] {
  if (!(value?.['nameToType'] instanceof Map)) {
    throw new Error(`INTERNAL ERROR: Received a value of an incorrect type`)
  }

  // Assuming values are a correct type, because iterating over each value would be too slow.
  return value as types.RecordType['data']
}

export function assertRawFunctionValue(value: unknown): values.FunctionValue['raw'] {
  const passedAssertion = (
    typeof value === 'object' &&
    'capturedScope' in value &&
    'params' in value &&
    'body' in value
  )

  if (!passedAssertion) {
    throw new Error(`INTERNAL ERROR: Received a value of an incorrect type`)
  }

  return value as values.FunctionValue['raw']
}

export function assertFunctionInnerDataType(value: unknown): types.FunctionType['data'] {
  const passedAssertion = (
    typeof value === 'object' &&
    'genericParamTypes' in value &&
    'bodyType' in value &&
    'purity' in value
  )

  if (!passedAssertion) {
    throw new Error(`INTERNAL ERROR: Received a value of an incorrect type`)
  }

  return value as types.FunctionType['data']
}