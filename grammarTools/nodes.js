'use strict'

const { SemanticError } = require('./tools')
const tools = require('./tools')

const DUMMY_POS = tools.asPos({ line: 1, col: 1, offset: 0, text: '' }) // TODO - get rid of all occurances of this
const undeterminedType = Symbol('Undetermined Type')

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
          throw new tools.SemanticError(`Attempted to change a type from "${type.repr()}" to type "${finalType.repr()}". "as" type assertions can only widen or narrow a provided type.`, operatorAndTypePos)
        }
        return { respState, type: finalType }
      },
    })
  },
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
          params,
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

        const genericParamTypes = []
        for (const { identifier, getConstraint, identPos, constraintPos } of templateParamDefList) {
          const constraint = getConstraint(state, constraintPos).asNewInstance()
          genericParamTypes.push(constraint)
          state = state.addToTypeScope(identifier, () => constraint, identPos)
        }

        const paramTypes = []
        const respStates = []
        for (const param of params) {
          const { respState, type } = param.contextlessTypeCheck(state)
          paramTypes.push(type)
          respStates.push(respState.update({ declarations: [] }))
          state = respState.applyDeclarations(state)
        }
        const { respState: bodyRespState, type: bodyType } = body.typeCheck(state)
        const requiredBodyType = getBodyType ? getBodyType(state, bodyTypePos) : null
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

        const finalRespState = tools.mergeRespStates(...respStates, bodyRespState)
        const newOuterScopeVars = finalRespState.outerScopeVars.filter(ident => outerState.lookupVar(ident).fromOuterScope)
        return {
          respState: finalRespState.update({ outerScopeVars: newOuterScopeVars }),
          type: finalType
        }
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
      for (const [i, param] of fn.params.entries()) {
        const value = paramValues[i]
        const allBindings = param.exec(rt, { incomingValue: value })
        rt = rt.update({ scopes: [...rt.scopes, ...allBindings] })
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
        tools.assertType(paramTypes[i], fnType.data.paramTypes[i], params[i].pos)
        fnType.data.paramTypes[i].matchUpTemplates({
          usingType: paramTypes[i],
          onTemplate({ self, other }) {
            console.assert(!!self.typeInstance)
            const templateValue = createdTemplateParams.get(self.typeInstance)
            if (!templateValue) {
              tools.assertType(other.uninstantiate(), self, DUMMY_POS)
              createdTemplateParams.set(self.typeInstance, other)
            } else {
              tools.assertType(other, templateValue, DUMMY_POS)
            }
          },
        })
      }
      if (tools.getPurityLevel(fnType.data.purity) < tools.getPurityLevel(state.minPurity)) {
        throw new tools.TypeError(`Attempted to call a function which was less pure than its containing environment.`, fnExpr.pos)
      }

      const getPurityAnnotationMsg = purity => ({ PURE: 'not use any purity annotations', GETS: 'use "get"', NONE: 'use "run"' })[purity]
      if (tools.getPurityLevel(fnType.data.purity) !== tools.getPurityLevel(callWithPurity)) {
        throw new tools.SemanticError(`Attempted to do this function call with the wrong purity annotation. You must ${getPurityAnnotationMsg(fnType.data.purity)}`, pos)
      }

      let returnType = fnType.data.bodyType.fillTemplateParams({
        getReplacement(type) {
          console.assert(!!type.typeInstance)
          const concreteType = createdTemplateParams.get(type.typeInstance)
          if (!concreteType) throw new tools.SemanticError(`Uncertain what the return type is. Please explicitly pass in type parameters to help us determine it.`, pos)
          return concreteType
        }
      })
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

      const biggerType = tools.getWiderType(ifSoType, ifNotType, `The following "if true" case of this condition has the type "${ifSoType.repr()}", which is incompatible with the "if not" case's type, "${ifNotType.repr()}".`, ifSo.pos)
      return { respState: tools.mergeRespStates(condRespState, ifSoRespState, ifNotRespState), type: biggerType }
    },
  }),
  match: (pos, { matchValue, matchArms }) => tools.node({
    pos,
    exec: rt => {
      const value = matchValue.exec(rt)
      for (const { pattern, body } of matchArms) {
        const maybeBindings = pattern.exec(rt, { incomingValue: value, allowFailure: true })
        if (maybeBindings) {
          rt = rt.update({ scopes: [...rt.scopes, ...maybeBindings] })
          return body.exec(rt)
        }
      }
      throw new tools.RuntimeError('No patterns matched.')
    },
    typeCheck: state => {
      const { respState, type } = matchValue.typeCheck(state)
      const respStates = [respState]
      let overallType = null
      for (const { pattern, body } of matchArms) {
        const { respState: respState2 } = pattern.typeCheck(state, { incomingType: type, allowWidening: true })
        respStates.push(respState2.update({ declarations: [] }))
        const bodyState = respState2.applyDeclarations(state)
        const bodyType = body.typeCheck(bodyState).type
        if (!overallType) {
          overallType = bodyType
          continue
        }
        overallType = tools.getWiderType(overallType, bodyType, `The following match arm's result has the type "${bodyType.repr()}", which is incompatible with the type of previous match arms, "${overallType.repr()}".`, DUMMY_POS)
      }
      return { respState: tools.mergeRespStates(...respStates), type: overallType }
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
  }),
  declaration: (pos, { declarations, expr }) => tools.node({
    pos,
    exec: rt => {
      for (const decl of declarations) {
        const value = decl.expr.exec(rt)
        const bindings = decl.assignmentTarget.exec(rt, { incomingValue: value })
        rt = bindings.reduce((rt, { identifier, value }) => (
          rt.update({ scopes: [...rt.scopes, { identifier, value }] })
        ), rt)
      }
      return expr.exec(rt)
    },
    typeCheck: state => {
      const respStates = []
      for (const decl of declarations) {
        const { respState, type } = decl.expr.typeCheck(state)
        respStates.push(respState)
        const { respState: respState2 } = decl.assignmentTarget.typeCheck(state, { incomingType: type })
        respStates.push(respState2.update({ declarations: [] }))
        state = respState2.applyDeclarations(state)
      }
      return { respState: tools.mergeRespStates(...respStates), type: expr.typeCheck(state).type }
    },
  }),

  assignment: {
    bind: (pos, { identifier, getTypeConstraint, identPos, typeConstraintPos }) => {
      let typeConstraint
      return tools.node({
        pos,
        exec: (rt, { incomingValue, allowFailure = false }) => {
          if (typeConstraint && !tools.isTypeAssignableTo(incomingValue.type, typeConstraint)) {
            if (allowFailure) return null
            throw new Error('Unreachable: Type mismatch when binding.')
          }
          return [{ identifier, value: incomingValue }]
        },
        typeCheck: (state, { incomingType, allowWidening = false }) => {
          // incomingType may be set to undeterminedType
          typeConstraint = getTypeConstraint ? getTypeConstraint(state, typeConstraintPos) : null
          if (incomingType === undeterminedType && !typeConstraint) throw new tools.SemanticError("Could not auto-determine the type of this record field, please specify it with a type constraint.", DUMMY_POS)
          if (typeConstraint && incomingType !== undeterminedType && !tools.isTypeAssignableTo(incomingType, typeConstraint)) {
            if (!allowWidening) {
              throw new tools.TypeError(`Found type "${incomingType.repr()}", but expected type "${typeConstraint.repr()}".`, DUMMY_POS)
            } else if (allowWidening && !tools.isTypeAssignableTo(typeConstraint, incomingType)) {
              throw new tools.SemanticError(`Attempted to change a type from "${incomingType.repr()}" to type "${typeConstraint.repr()}". Pattern matching can only widen or narrow a provided type.`, DUMMY_POS)
            }
          }
          const finalType = typeConstraint ? typeConstraint : incomingType
          return {
            respState: tools.createRespState({ declarations: [{ identifier, type: finalType, identPos }] }),
          }
        },
        contextlessTypeCheck: state => {
          if (!getTypeConstraint) throw new tools.TypeError('All function parameters must have a declared type', pos)
          const typeConstraint = getTypeConstraint(state, typeConstraintPos)
          return {
            respState: tools.createRespState({ declarations: [{ identifier, type: typeConstraint, identPos }] }),
            type: typeConstraint,
          }
        }
      })
    },
    destructureObj: (pos, { entries }) => tools.node({
      pos,
      exec: (rt, { incomingValue, allowFailure = false }) => {
        const allBindings = []
        for (const [identifier, assignmentTarget] of entries) {
          if (tools.isUnknownType(incomingValue.type)) return null
          const innerValue = incomingValue.raw.get(identifier)
          if (!innerValue) return null
          const bindings = assignmentTarget.exec(rt, { incomingValue: innerValue, allowFailure })
          if (!bindings) return null
          allBindings.push(...bindings)
          rt = bindings.reduce((rt, { identifier, value }) => (
            rt.update({ scopes: [...rt.scopes, { identifier, value }] })
          ), rt)
        }
        return allBindings
      },
      typeCheck: (state, { incomingType, allowWidening = false }) => {
        // incomingType may be set to undeterminedType
        if (incomingType !== undeterminedType) tools.assertType(incomingType, tools.types.createRecord(new Map()), incomingType.pos, `Found type ${incomingType.repr()} but expected a record.`)
        const respStates = []
        for (const [identifier, assignmentTarget] of entries) {
          let valueType = incomingType === undeterminedType || tools.isNeverType(incomingType)
            ? incomingType
            : incomingType.data.get(identifier)
          if (!valueType && allowWidening) valueType = undeterminedType
          if (!valueType) throw new tools.types.TypeError(`Unable to destructure property ${identifier} from type ${incomingType.repr()}`, DUMMY_POS)
          const { respState } = assignmentTarget.typeCheck(state, { incomingType: valueType, allowWidening })
          respStates.push(respState)
          state = respState.applyDeclarations(state)
        }
        return {
          respState: tools.mergeRespStates(...respStates),
        }
      },
      contextlessTypeCheck: state => {
        const respStates = []
        const nameToType = new Map()
        for (const [identifier, assignmentTarget] of entries) {
          const { respState, type } = assignmentTarget.contextlessTypeCheck(state)
          respStates.push(respState)
          state = respState.applyDeclarations(state)
          nameToType.set(identifier, type)
        }
        return {
          respState: tools.mergeRespStates(...respStates),
          type: tools.types.createRecord(nameToType),
        }
      },
    }),
    valueConstraint: (pos, { assignmentTarget, constraint }) => tools.node({
      pos,
      exec: (rt, { incomingValue, allowFailure = false }) => {
        const bindings = assignmentTarget.exec(rt, { incomingValue, allowFailure })
        if (!bindings) return null
        rt = rt.update({ scopes: [...rt.scopes, ...bindings] })
        const success = constraint.exec(rt)
        if (!success.raw) {
          if (allowFailure) return null
          throw new tools.RuntimeError('Value Constraint failed.')
        }
        return bindings
      },
      typeCheck: (state, { incomingType, allowWidening = false }) => {
        // incomingType may be set to undeterminedType
        const { respState } = assignmentTarget.typeCheck(state, { incomingType, allowWidening })
        state = respState.applyDeclarations(state)
        const { respState: respState2, type } = constraint.typeCheck(state)
        tools.assertType(type, tools.types.boolean, DUMMY_POS)
        return {
          respState: tools.mergeRespStates(respState, respState2)
        }
      },
      contextlessTypeCheck: state => {
        const { respState, type } = assignmentTarget.contextlessTypeCheck(state, { incomingType, allowWidening })
        state = respState.applyDeclarations(state)
        const { respState: respState2, type: type2 } = constraint.typeCheck(state)
        tools.assertType(type2, tools.types.boolean, DUMMY_POS)
        return {
          respState: tools.mergeRespStates(respState, respState2),
          type,
        }
      }
    }),
  },
}