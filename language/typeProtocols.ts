import * as Type from './Type'
import * as types from './types'

import Protocols = Type.Protocols
type AsCategoryGeneric<T extends Type.AnyConcreteType> = { name: T['category']['name'], data: T['data'] }

export const prototolSymbols = {
  childType: Symbol(),
}

export const typeContainer: Protocols<AsCategoryGeneric<types.TypeContainerType>> = {
  childType(type: types.TypeContainerType) {
    return { success: true, type: type.data.containedType }
  },
}

export const tag: Protocols<AsCategoryGeneric<types.TagType>> = {
  childType(type: types.TagType) {
    return { success: true, type: types.createTagged({ tag: type }) }
  },
}

export const record: Protocols<AsCategoryGeneric<types.RecordType>> = {
  childType(type: types.RecordType) {
    const protocolType_ = type.data.symbolToInfo.get(prototolSymbols.childType)?.type
    if (!protocolType_) return { success: false }
    const protocolType = Type.getConcreteConstrainingType(protocolType_)
    if (!types.isTypeContainer(protocolType)) throw new Error('INTERNAL ERROR: Protocol values should only contain type containers.')
    return { success: true, type: Type.getConcreteConstrainingType(protocolType.data.containedType) }
  },
}