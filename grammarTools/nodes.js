const tools = require('./tools')

module.exports = {
  root: ({ module }) => ({
    exec: () => {
      const rt = tools.createRuntime()
      return module.exec(rt)
    },
    typeCheck: () => {
      const state = tools.createTypeState()
      module.typeCheck(state)
    }
  }),
  module: (pos, { declarations }) => ({
    pos,
    exec: rt => {
      for (const decl of declarations) {
        const value = decl.target.exec(rt)
        rt = rt.update({ scopes: [...rt.scopes, { identifier: decl.identifier, value }] })
      }
      return tools.types.unit
    },
    typeCheck: state => {
      for (const decl of declarations) {
        const type = decl.target.typeCheck(state)
        state = state.update({ scopes: [...state.scopes, { identifier: decl.identifier, type }] })
      }
      return tools.types.unit
    },
  }),
  block: (pos, { declarations }) => ({
    pos,
    exec: rt => {
      for (const decl of declarations) {
        const value = decl.target.exec(rt)
        rt = rt.update({ scopes: [...rt.scopes, { identifier: decl.identifier, value }] })
      }
      return tools.types.unit
    },
    typeCheck: state => {
      for (const decl of declarations) {
        const type = decl.target.typeCheck(state)
        state = state.update({ scopes: [...state.scopes, { identifier: decl.identifier, type }] })
      }
      return tools.types.unit
    },
  }),
  print: (pos, { r }) => tools.node({
    pos,
    exec: rt => {
      const value = r.exec(rt)
      console.log(value)
      return value
    },
    typeCheck: state => r.typeCheck(state)
  }),
  '==': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) === r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.boolean
    },
  }),
  '!=': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) !== r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.boolean
    },
  }),
  '++': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt).concat(r.exec(rt)),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.string, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.string, r.pos)
      return tools.types.string
    },
  }),
  '+': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) + r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.int
    },
  }),
  '-': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) - r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.int
    },
  }),
  '*': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) * r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.int
    },
  }),
  '/': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) / r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.int
    },
  }),
  '**': (pos, { l, r }) => tools.node({
    pos,
    exec: rt => l.exec(rt) ** r.exec(rt),
    typeCheck: state => {
      tools.assertType(l.typeCheck(state), tools.types.int, l.pos)
      tools.assertType(r.typeCheck(state), tools.types.int, r.pos)
      return tools.types.int
    },
  }),
  '.': (pos, { l, identifier }) => tools.node({
    pos,
    exec: rt => {
      const nameToValue = l.exec(rt)
      if (!nameToValue.has(identifier)) throw new Error(`Internal Error: Expected to find the identifier "${identifier}" on a record, and that identifier did not exist`)
      return nameToValue.get(identifier)
    },
    typeCheck: state => {
      const leftType = l.typeCheck(state)
      tools.assertTypeSentinel(leftType, tools.types.recordSentinel, 'record', l.pos)
      const result = leftType.data.get(identifier)
      if (!result) throw new SemanticError(`Failed to find the identifier "${identifier}" on a record.`, pos)
      return result
    },
  }),
  declaration: (pos, { declarations, expr }) => tools.node({
    pos,
    exec: rt => {
      for (const decl of declarations) {
        const value = decl.target.exec(rt)
        rt = rt.update({ scopes: [...rt.scopes, { identifier: decl.identifier, value }] })
      }
      return expr.exec(rt)
    },
    typeCheck: state => {
      for (const decl of declarations) {
        const type = decl.target.typeCheck(state)
        state = state.update({ scopes: [...state.scopes, { identifier: decl.identifier, type }] })
      }
      return expr.typeCheck(state)
    },
  }),
  number: (pos, { value }) => tools.node({
    pos,
    exec: rt => value,
    typeCheck: state => tools.types.int,
  }),
  string: (pos, { value }) => tools.node({
    pos,
    exec: rt => value,
    typeCheck: state => tools.types.string,
  }),
  boolean: (pos, { value }) => tools.node({
    pos,
    exec: rt => value,
    typeCheck: state => tools.types.boolean,
  }),
  record: (pos, { content }) => tools.node({
    pos,
    exec: rt => {
      const nameToValue = new Map()
      for (const [name, node] of content) {
        nameToValue.set(name, node.exec(rt))
      }
      return nameToValue
    },
    typeCheck: state => {
      const nameToType = new Map()
      for (const [name, value] of content) {
        nameToType.set(name, value.typeCheck())
      }
      return tools.types.createRecord(nameToType)
    },
  }),
  function: (pos, { params, body }) => tools.node({
    pos,
    exec: rt => ({
      params: params.map(p => p.identifier),
      body
    }),
    typeCheck: state => {
      for (const param of params) {
        if (!param.type) throw new tools.TypeError('All function parameters must have a declared type', param.pos)
        state = state.update({ scopes: [...state.scopes, { identifier: param.identifier, type: tools.parseType(param.type, param.pos) }] })
      }
      const bodyType = body.typeCheck(state)
      return tools.types.createFunction({ paramTypes: params.map(p => tools.parseType(p.type, p.pos)), bodyType })
    },
  }),
  invoke: (pos, { fnExpr, params }) => tools.node({
    pos,
    exec: rt => {
      const fn = fnExpr.exec(rt)
      const paramValues = params.map(param => param.exec(rt))
      for (const [i, identifier] of fn.params.entries()) {
        const value = paramValues[i]
        rt = rt.update({ scopes: [...rt.scopes, { identifier, value }] })
      }
      return fn.body.exec(rt)
    },
    typeCheck: state => {
      const fnType = fnExpr.typeCheck(state)
      const paramTypes = params.map(p => p.typeCheck(state))
      tools.assertTypeSentinel(fnType, tools.types.functionSentinel, 'function', fnExpr.pos)
      if (fnType.data.paramTypes.length !== paramTypes.length) {
        throw new tools.TypeError(`Found ${paramTypes.length} parameter(s) but expected ${fnType.data.paramTypes.length}.`, pos)
      }
      for (let i = 0; i < fnType.data.paramTypes.length; ++i) {
        tools.assertType(paramTypes[i], fnType.data.paramTypes[i], params[i].pos)
      }
      return fnType.data.bodyType
    },
  }),
  branch: (pos, { condition, ifSo, ifNot }) => tools.node({
    pos,
    exec: rt => {
      const result = condition.exec(rt)
      return result ? ifSo.exec(rt) : ifNot.exec(rt)
    },
    typeCheck: state => {
      tools.assertType(condition.typeCheck(state), tools.types.boolean, condition.pos)
      const ifSoType = ifSo.typeCheck(state)
      const ifNotType = ifNot.typeCheck(state)
      tools.assertType(ifNotType, ifSoType, ifNot.pos)
      tools.assertType(ifSoType, ifNotType, ifNot.pos)
      return ifSoType
    },
  }),
  identifier: (pos, { identifier }) => tools.node({
    pos,
    exec: rt => {
      const foundVar = rt.lookupVar(identifier)
      if (!foundVar) throw new Error('INTERNAL ERROR: Identifier not found')
      return foundVar.value
    },
    typeCheck: state => {
      const foundVar = state.lookupVar(identifier)
      if (!foundVar) throw new tools.SemanticError(`Attempted to access undefined variable ${identifier}`, pos)
      return foundVar.type
    },
  }),
}