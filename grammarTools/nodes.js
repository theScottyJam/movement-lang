'use strict'

const { SemanticError } = require('./tools')
const tools = require('./tools')

const nodes = module.exports = {
  tools,
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
  beginBlock: (pos, content) => ({
    pos,
    exec: rt => content.exec(rt),
    typeCheck: state => (
      content.typeCheck(state.update({
        minPurity: tools.PURITY.none,
        isBeginBlock: true,
      }))
    ),
  }),
  block: (pos, { content }) => ({
    pos,
    exec: rt => {
      content.exec(rt)
      return tools.createValue({ type: tools.types.unit, raw: null })
    },
    typeCheck: state => {
      const { respState, type: contentType } = content.typeCheck(state)
      const type = tools.isNeverType(contentType) ? tools.types.never : tools.types.unit
      return { respState, type }
    },
  }),
  sequence: (statements) => tools.node({
    exec: rt => {
      statements.forEach(statement => statement.exec(rt))
      return null
    },
    typeCheck: state => {
      const typeChecks = statements.map(statement => statement.typeCheck(state))
      const respStates = typeChecks.map(x => x.respState)
      const type = typeChecks.find(x => tools.isNeverType(x.type)) ? tools.types.never : tools.types.unit
      return { respState: tools.mergeRespStates(...respStates), type }
    },
  }),
  noop: () => nodes.sequence([]),
  print: (pos, { r }) => tools.node({
    pos,
    exec: rt => {
      const value = r.exec(rt)
      tools.showDebugOutput(value)
      return value
    },
    typeCheck: state => r.typeCheck(state)
  }),
  '==': (pos, { l, r }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({ type: finalType, raw: l.exec(rt).raw === r.exec(rt).raw }),
      typeCheck: state => {
        const { respState: lRespState, type: lType } = l.typeCheck(state)
        const { respState: rRespState, type: rType } = r.typeCheck(state)
        tools.assertType(lType, tools.types.int, l.pos)
        tools.assertType(rType, tools.types.int, r.pos)
        finalType = tools.types.boolean
        return { respState: tools.mergeRespStates(lRespState, rRespState), type: finalType }
      },
    })
  },
  '!=': (pos, { l, r }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({ type: finalType, raw: l.exec(rt).raw !== r.exec(rt).raw }),
      typeCheck: state => {
        const { respState: lRespState, type: lType } = l.typeCheck(state)
        const { respState: rRespState, type: rType } = r.typeCheck(state)
        tools.assertType(lType, tools.types.int, l.pos)
        tools.assertType(rType, tools.types.int, r.pos)
        finalType = tools.types.boolean
        return { respState: tools.mergeRespStates(lRespState, rRespState), type: finalType }
      },
    })
  },
  '+': (pos, { l, r }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({ type: finalType, raw: l.exec(rt).raw + r.exec(rt).raw }),
      typeCheck: state => {
        const { respState: lRespState, type: lType } = l.typeCheck(state)
        const { respState: rRespState, type: rType } = r.typeCheck(state)
        tools.assertType(lType, tools.types.int, l.pos)
        tools.assertType(rType, tools.types.int, r.pos)
        finalType = tools.types.int
        return { respState: tools.mergeRespStates(lRespState, rRespState), type: finalType }
      },
    })
  },
  '-': (pos, { l, r }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({ type: finalType, raw: l.exec(rt).raw - r.exec(rt).raw }),
      typeCheck: state => {
        const { respState: lRespState, type: lType } = l.typeCheck(state)
        const { respState: rRespState, type: rType } = r.typeCheck(state)
        tools.assertType(lType, tools.types.int, l.pos)
        tools.assertType(rType, tools.types.int, r.pos)
        finalType = tools.types.int
        return { respState: tools.mergeRespStates(lRespState, rRespState), type: finalType }
      },
    })
  },
  '*': (pos, { l, r }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({ type: finalType, raw: l.exec(rt).raw * r.exec(rt).raw }),
      typeCheck: state => {
        const { respState: lRespState, type: lType } = l.typeCheck(state)
        const { respState: rRespState, type: rType } = r.typeCheck(state)
        tools.assertType(lType, tools.types.int, l.pos)
        tools.assertType(rType, tools.types.int, r.pos)
        finalType = tools.types.int
        return { respState: tools.mergeRespStates(lRespState, rRespState), type: finalType }
      },
    })
  },
  '**': (pos, { l, r }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({ type: finalType, raw: l.exec(rt).raw ** r.exec(rt).raw }),
      typeCheck: state => {
        const { respState: lRespState, type: lType } = l.typeCheck(state)
        const { respState: rRespState, type: rType } = r.typeCheck(state)
        tools.assertType(lType, tools.types.int, l.pos)
        tools.assertType(rType, tools.types.int, r.pos)
        finalType = tools.types.int
        return { respState: tools.mergeRespStates(lRespState, rRespState), type: finalType }
      },
    })
  },
  '.': (pos, { l, identifier }) => tools.node({
    pos,
    exec: rt => {
      const { raw: nameToValue } = l.exec(rt)
      if (!nameToValue.has(identifier)) throw new Error(`Internal Error: Expected to find the identifier "${identifier}" on a record, and that identifier did not exist`)
      return nameToValue.get(identifier)
    },
    typeCheck: state => {
      const { respState, type: lType } = l.typeCheck(state)
      tools.assertType(lType, tools.types.createRecord(new Map()), l.pos, `Found type ${lType.repr()} but expected a record.`)
      const result = lType.data.get(identifier)
      if (!result) throw new tools.SemanticError(`Failed to find the identifier "${identifier}" on the record of type ${lType.repr()}.`, pos)
      return { respState, type: result }
    },
  }),
  typeAssertion: (pos, { expr, getType, typePos, operatorAndTypePos }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => {
        const value = expr.exec(rt)
        if (!tools.isTypeAssignableTo(value.type, finalType)) {
          throw new tools.RuntimeError(`"as" type assertion failed - failed to convert a type from "${value.type.repr()}" to ${finalType.repr()}`)
        }
        return tools.createValue({ type: finalType, raw: value.raw })
      },
      typeCheck: state => {
        const { respState, type } = expr.typeCheck(state)
        finalType = getType(state, typePos)
        if (!tools.isTypeAssignableTo(finalType, type) && !tools.isTypeAssignableTo(type, finalType)) {
          throw new tools.SemanticError(`Attempted to change a type from "${type.repr()}" to type "${finalType.repr()}". "as" type assertions can only widen or narrow a provided type. If you wish to completely change the type, you can do so in two steps with "yourValue as #unknown as #yourDesiredType".`, operatorAndTypePos)
        }
        return { respState, type: finalType }
      },
    })
  },
  declaration: (pos, { declarations, expr }) => tools.node({
    pos,
    exec: rt => {
      for (const decl of declarations) {
        const value = decl.target.exec(rt)
        rt = rt.update({ scopes: [...rt.scopes, { identifier: decl.assignmentTarget.identifier, value }] })
      }
      return expr.exec(rt)
    },
    typeCheck: state => {
      const respStates = []
      for (const decl of declarations) {
        const { respState, type } = decl.target.typeCheck(state)
        respStates.push(respState)
        const assignmentTargetType = decl.assignmentTarget.getType ? decl.assignmentTarget.getType(state, decl.assignmentTarget.pos) : null
        if (assignmentTargetType) tools.assertType(type, assignmentTargetType, decl.target.pos)
        const finalType = assignmentTargetType ? assignmentTargetType : type
        state = state.addToScope(decl.assignmentTarget.identifier, finalType, decl.assignmentTargetPos)
      }
      return { respState: tools.mergeRespStates(...respStates), type: expr.typeCheck(state).type }
    },
  }),
  number: (pos, { value }) => tools.node({
    pos,
    exec: rt => tools.createValue({ raw: value, type: tools.types.int }),
    typeCheck: state => ({ respState: tools.createRespState(), type: tools.types.int }),
  }),
  string: (pos, { uninterpretedValue }) => {
    const parseEscapeSequences = rawStr => {
      let value = ''
      let inEscape = false
      for (const c of uninterpretedValue) {
        if (c === '\\') {
          if (inEscape) value += '\\'
          inEscape = !inEscape
          continue
        }

        if (inEscape) {
          if (c === '0') value += '\0'
          else if (c === "'") value += "'"
          else if (c === '"') value += '"'
          else if (c === 'n') value += '\n'
          else if (c === 'r') value += '\r'
          else if (c === 't') value += '\t'
          else throw new tools.SyntaxError(`Unrecognized string escape sequence "\\${c}".`, pos)
          inEscape = false
        } else {
          value += c
        }
      }
      return value
    }
    const value = parseEscapeSequences(uninterpretedValue)
    return tools.node({
      pos,
      exec: rt => tools.createValue({ raw: value, type: tools.types.string }),
      typeCheck: state => ({ respState: tools.createRespState(), type: tools.types.string }),
    })
  },
  boolean: (pos, { value }) => tools.node({
    pos,
    exec: rt => tools.createValue({ raw: value, type: tools.types.boolean }),
    typeCheck: state => ({ respState: tools.createRespState(), type: tools.types.boolean }),
  }),
  record: (pos, { content }) => {
    let finalType
    return tools.node({
      pos,
      exec: rt => {
        const nameToValue = new Map()
        for (const [name, { target }] of content) {
          nameToValue.set(name, target.exec(rt))
        }
        return tools.createValue({ raw: nameToValue, type: finalType })
      },
      typeCheck: state => {
        const nameToType = new Map()
        const respStates = []
        for (const [name, { target, requiredTypeGetter, typeGetterPos }] of content) {
          const { respState, type } = target.typeCheck(state)
          respStates.push(respState)
          const requiredType = requiredTypeGetter ? requiredTypeGetter(state, typeGetterPos) : null
          if (requiredType) tools.assertType(type, requiredType, target.pos)
          const finalType = requiredType ? requiredType : type
          nameToType.set(name, finalType)
        }
        finalType = tools.types.createRecord(nameToType)
        return { respState: tools.mergeRespStates(...respStates), type: finalType }
      },
    })
  },
  function: (pos, { params, body, getBodyType, bodyTypePos, purity, templateParamDefList }) => {
    let capturesState
    let finalType
    return tools.node({
      pos,
      exec: rt => tools.createValue({
        raw: {
          params: params.map(p => p.identifier),
          body,
          capturedScope: capturesState.map(identifier => ({ identifier, value: rt.lookupVar(identifier) })),
        },
        type: finalType,
      }),
      typeCheck: outerState => {
        let state = tools.createTypeState({
          scopes: [...outerState.scopes, new Map()],
          definedTypes: [...outerState.definedTypes, new Map()],
          minPurity: purity,
          isBeginBlock: false,
        })
        const requiredBodyType = getBodyType ? getBodyType(state, bodyTypePos) : null

        const genericParamTypes = []
        for (const { identifier, getConstraint, identPos, constraintPos } of templateParamDefList) {
          const constraint = getConstraint(state, constraintPos).asNewInstance()
          genericParamTypes.push(constraint)
          state = state.addToTypeScope(identifier, () => constraint, identPos)
        }

        let paramTypes = []
        for (const param of params) {
          if (!param.getType) throw new tools.TypeError('All function parameters must have a declared type', param.pos)
          const type = param.getType(state, param.pos)
          paramTypes.push(type)
          state = state.addToScope(param.identifier, type, param.pos)
        }
        const { respState: bodyRespState, type: bodyType } = body.typeCheck(state)
        if (requiredBodyType) tools.assertType(bodyType, requiredBodyType, pos, `This function can returns type ${bodyType.repr()} but type ${requiredBodyType.repr()} was expected.`)
        capturesState = bodyRespState.outerScopeVars

        const returnType = 
          requiredBodyType
            ? (
              bodyRespState.returnTypes.forEach(({ type, pos }) => {
                tools.assertType(type, requiredBodyType, pos)
              })
              , requiredBodyType
            )
            : bodyRespState.returnTypes.reduce((curType, returnType) => {
              if (tools.isTypeAssignableTo(curType, returnType.type)) return curType
              if (tools.isTypeAssignableTo(returnType.type, curType)) return returnType
              throw new SemanticError(`This return has the type "${returnType.type.repr()}", which is incompatible with another possible return types from this function, "${curType.repr()}".`, returnType.pos)
            }, bodyType)

        const finalType = tools.types.createFunction({
          paramTypes,
          genericParamTypes,
          bodyType: returnType,
          purity,
        })

        const newOuterScopeVars = bodyRespState.outerScopeVars.filter(ident => outerState.lookupVar(ident).fromOuterScope)
        return { respState: bodyRespState.update({ outerScopeVars: newOuterScopeVars }), type: finalType }
      },
    })
  },
  invoke: (pos, { fnExpr, templateParams, params }) => tools.node({
    pos,
    data: {
      type: 'INVOKE',
    },
    exec: rt => {
      const { raw: fn } = fnExpr.exec(rt)
      rt = rt.update({ scopes: fn.capturedScope })
      const paramValues = params.map(param => param.exec(rt))
      for (const [i, identifier] of fn.params.entries()) {
        const value = paramValues[i]
        rt = rt.update({ scopes: [...rt.scopes, { identifier, value }] })
      }
      try {
        return fn.body.exec(rt)
      } catch (err) {
        if (!(err instanceof tools.FlowControlError)) throw err
        if (err.type !== tools.FLOW_CONTROL.return) throw err
        return err.data.returnValue
      }
    },
    typeCheck: (state, { callWithPurity = tools.PURITY.pure } = {}) => {
      const { respState: fnRespState, type: fnType } = fnExpr.typeCheck(state)
  
      if (templateParams.length > fnType.data.genericParamTypes.length) {
        throw new tools.SemanticError(`The function of type ${fnType.repr()} must be called with at most ${fnType.data.genericParamTypes.length} generic parameters, but got called with ${templateParams.length}.`, pos)
      }
      let createdTemplateParams = new Map()
      for (let i = 0; i < templateParams.length; ++i) {
        const { getType, loc } = templateParams[i]
        const type = getType(state, loc)
        tools.assertType(type, fnType.data.genericParamTypes[i].uninstantiate(), loc)
        createdTemplateParams.set(fnType.data.genericParamTypes[i].typeInstance, type)
      }

      const paramsTypeChecked = params.map(p => p.typeCheck(state))
      const paramTypes = paramsTypeChecked.map(p => p.type)
      const paramRespStates = paramsTypeChecked.map(p => p.respState)
      const anyFn = tools.types.createFunction({ paramTypes: tools.anyParams, genericParamTypes: [], bodyType: tools.types.unknown, purity: tools.PURITY.none })
      tools.assertType(fnType, anyFn, fnExpr.pos, `Found type ${fnType.repr()} but expected a function.`)
      if (fnType.data.paramTypes.length !== paramTypes.length) {
        throw new tools.TypeError(`Found ${paramTypes.length} parameter(s) but expected ${fnType.data.paramTypes.length}.`, pos)
      }
      for (let i = 0; i < fnType.data.paramTypes.length; ++i) {
        const typeInstance = fnType.data.paramTypes[i].typeInstance
        if (typeInstance) {
          const templateValue = createdTemplateParams.get(typeInstance)
          if (!templateValue) {
            tools.assertType(paramTypes[i], fnType.data.paramTypes[i].uninstantiate(), params[i].pos)
            createdTemplateParams.set(typeInstance, paramTypes[i])
          } else {
            tools.assertType(paramTypes[i], templateValue, params[i].pos)
          }
        } else {
          tools.assertType(paramTypes[i], fnType.data.paramTypes[i], params[i].pos)
        }
      }
      if (tools.getPurityLevel(fnType.data.purity) < tools.getPurityLevel(state.minPurity)) {
        throw new tools.TypeError(`Attempted to call a function which was less pure than its containing environment.`, fnExpr.pos)
      }

      const getPurityAnnotationMsg = purity => ({ PURE: 'not use any purity annotations', GETS: 'use "get"', NONE: 'use "run"' })[purity]
      if (tools.getPurityLevel(fnType.data.purity) !== tools.getPurityLevel(callWithPurity)) {
        throw new tools.SemanticError(`Attempted to do this function call with the wrong purity annotation. You must ${getPurityAnnotationMsg(fnType.data.purity)}`, pos)
      }

      let returnType = fnType.data.bodyType
      if (returnType.typeInstance) {
        returnType = createdTemplateParams.get(returnType.typeInstance)
        if (!returnType) throw new tools.SemanticError(`Uncertain what the return type is. Please specify it using the generic parameter list.`, pos)
      }
      return { respState: tools.mergeRespStates(fnRespState, ...paramRespStates), type: returnType }
    },
  }),
  callWithPermissions: (pos, { purity, invokeExpr }) => tools.node({
    pos,
    exec: rt => invokeExpr.exec(rt),
    typeCheck: state => {
      if (invokeExpr.data.type !== 'INVOKE') {
        throw new Error(`Internal Error: This expression received a purity annotation, but such annotations should only be used on function calls.`)
      }
      return invokeExpr.typeCheck(state, { callWithPurity: purity })
    }
  }),
  return: (pos, { value }) => tools.node({
    pos,
    exec: rt => {
      const returnValue = value.exec(rt)
      throw new tools.FlowControlError(tools.FLOW_CONTROL.return, { returnValue })
    },
    typeCheck: state => {
      if (state.isBeginBlock) throw new tools.SemanticError('Can not use a return outside of a function.', pos)
      const { respState, type } = value.typeCheck(state)
      const newRespState = respState.update({ returnTypes: [...respState.returnTypes, { type, pos }] })
      return { respState: newRespState, type: tools.types.never }
    },
  }),
  branch: (pos, { condition, ifSo, ifNot }) => tools.node({
    pos,
    exec: rt => {
      const result = condition.exec(rt)
      return result.raw ? ifSo.exec(rt) : ifNot.exec(rt)
    },
    typeCheck: state => {
      const { respState: condRespState, type: condType } = condition.typeCheck(state)
      tools.assertType(condType, tools.types.boolean, condition.pos)
      const { respState: ifSoRespState, type: ifSoType } = ifSo.typeCheck(state)
      const { respState: ifNotRespState, type: ifNotType } = ifNot.typeCheck(state)

      let biggerType
      if (tools.isTypeAssignableTo(ifNotType, ifSoType)) biggerType = ifSoType
      else if (tools.isTypeAssignableTo(ifSoType, ifNotType)) biggerType = ifNotType
      else throw new SemanticError(`The following "if true" case of this condition has the type "${ifSoType.repr()}", which is incompatible with the "if not" case's type, "${ifNotType.repr()}".`, ifSo.pos)

      return { respState: tools.mergeRespStates(condRespState, ifSoRespState, ifNotRespState), type: biggerType }
    },
  }),
  identifier: (pos, { identifier }) => tools.node({
    pos,
    exec: rt => {
      const foundVar = rt.lookupVar(identifier)
      if (!foundVar) throw new Error(`INTERNAL ERROR: Identifier "${identifier}" not found`)
      return foundVar
    },
    typeCheck: state => {
      const result = state.lookupVar(identifier)
      if (!result) throw new tools.SemanticError(`Attempted to access undefined variable ${identifier}`, pos)
      const { type, fromOuterScope } = result
      const respState = tools.createRespState({ outerScopeVars: fromOuterScope ? [identifier] : [] })
      return { respState, type }
    },
  }),
  typeAlias: (pos, { name, getType, definedWithin, typePos }) => tools.node({
    pos,
    exec: rt => definedWithin.exec(rt),
    typeCheck: state => {
      getType(state, typePos) // Make sure there's no errors
      return definedWithin.typeCheck(state.addToTypeScope(name, () => getType(state, typePos), pos))
    },
  })
}