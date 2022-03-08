## Precedence key ##
# expr10: 'IN', '=>', 'PRINT', 'ELSE'
#   x where expr10 = ...
# expr15: '@'
# expr20: '==' '!='
#   x @ expr20 = ...
# expr30: 'AS'
#   x > expr30 = ...
# expr40: '+' '-'
# expr50: '*'
# expr60: '**'
# expr70: 'GET', 'RUN'
#   x #:expr70
# expr80: '.', 'The "(" in f()', 'The "<" in f<#T>()'
# expr100: Things that don't require an order of operations, like literals

@preprocessor typescript

@{%
  import * as nodes from './nodes/index'
  import moo from 'moo'
  import { PURITY } from './language/constants'
  import * as Position from './language/Position'
  import { BadSyntaxError, SemanticError } from './language/exceptions'
  import { deepRange } from './grammarParseUtils'
  import { GrammarBoundary } from './grammarBoundary'

  const asPos = Position.from
  const boundary = (callback: any) => GrammarBoundary.create(callback) as any
  const rawBoundary = (callback: any) => GrammarBoundary.createRaw(callback) as any
  const DUMMY_POS = asPos('<unknown>', { line: 1, col: 1, offset: 0, text: '' } as moo.Token) // TODO - get rid of all occurances of this

  const chanel = {
    stringLiteralImportPath: Symbol('string literal import path chanel'),
    dependency: Symbol('dependency chanel'),
    callWithPurity: Symbol('call with purity'),
    isInvokeExpr: Symbol('is invoke expression'),
    bindName: Symbol('bind name'),
    assignmentTargetName: Symbol('assignment target name'),
  }

  const assertFalse = () => { throw new Error('Assertion failed') }
%}

@{%
  const lexer = moo.states({
    main: {
      'comment': /\/\/.*/,
      'multilineComment': { match: /\/\*[^]*?\*\//, lineBreaks: true },
      'whitespace': /[ \t]+/,
      'newLine':  { match: '\n', lineBreaks: true },

      'stringStart': { match: "'", push: 'string' },

      '+': '+',
      '-': '-',
      '**': '**',
      '*': '*',

      '==': '==',
      '!=': '!=',
      /*
      "<=" return '<='
      "<" return '<'
      ">=" return '>='
      ">" return '>'
      */

      '=>': '=>',
      '=': '=',
      '.': '.',

      ',': ',',
      '[': '[',
      ']': ']',
      '(': '(',
      ')': ')',
      '{': '{',
      '}': '}',
      '<': '<',
      '>': '>',
      ':': ':',
      '@': '@',
      ';': ';',

      'upperIdentifier': /[A-Z][a-zA-Z0-9]*_*/,
      'nonUpperIdentifier': {
        match: /_?[a-z][a-zA-Z0-9]*_*|[0-9][a-zA-Z0-9]*_+|_[0-9][a-zA-Z0-9]*/,
        type: moo.keywords({
          'boolean': ['true', 'false'],
          'let': 'let',
          'in': 'in',
          'print': 'print',
          '_printType': '_printType',
          '_debug': '_debug',
          'if': 'if',
          'then': 'then',
          'else': 'else',
          'function': 'function',
          'return': 'return',
          'gets': 'gets',
          'get': 'get',
          'run': 'run',
          'begin': 'begin',
          'type': 'type',
          'alias': 'alias',
          'as': 'as',
          'of': 'of',
          'match': 'match',
          'when': 'when',
          'where': 'where',
          'tag': 'tag',
          'symbol': 'symbol',
          'variant': 'variant',
          'export': 'export',
          'import': 'import',
          'from': 'from',
          /*
          "and" return 'AND'
          "or" return 'OR'
          "not" return 'NOT'
          */
        }),
      },
      'builtinIdentifier': /\$[a-zA-Z0-9]+_*|\$[0-9][a-zA-Z0-9]*_+/,
      '$': '$',
      'number': /\d+/,
      'simpleType': {
        match: /\#[a-z][a-zA-Z0-9]*/,
        type: moo.keywords({
          '#gets': '#gets',
          '#function': '#function',
          '#typeof': '#typeof',
        })
      },
      'userType': /\#[A-Z][a-zA-Z0-9]*/,
      '#': '#',

      'impossible': /^\b$/,
    },
    string: {
      stringContent: /(?:\\.|[^'\n])+/,
      stringEnd: { match: "'", pop: 1 },
    }
  })
%}

@lexer lexer

deliminated[PATTERN, DELIMITER, TRAILING_DELIMITER]
  -> (($PATTERN $DELIMITER):* $PATTERN $TRAILING_DELIMITER):? {%
    ([data]) => {
      if (!data) return []
      const [heads, tailPattern] = data
      const headPatterns = heads.map(([pattern]) => pattern)
      return [...headPatterns, tailPattern]
    }
  %}

nonEmptyDeliminated[PATTERN, DELIMITER, TRAILING_DELIMITER]
  -> ($PATTERN $DELIMITER):* $PATTERN $TRAILING_DELIMITER {%
    (data) => {
      const [heads, tailPattern] = data
      const headPatterns = heads.map(([pattern]) => pattern)
      return [...headPatterns, tailPattern]
    }
  %}

root
  -> _ deliminated[importStatement (_ ";"):?, _, _] deliminated[moduleLevelStatement (_ ";"):?, _, _] (%begin _ block _):? {%
    rawBoundary((getArgValue, { pos, nextTokenPos }, [, importEntries, statementEntries, beginBlockEntry]) => {
      const [beginToken_,, beginBlock_] = beginBlockEntry ?? [,,, null]
      const beginToken = getArgValue(beginToken_).result
      const beginBlock = getArgValue(beginBlock_).result
      const makeImportNodes_ = importEntries.map(x => getArgValue(x[0])).flat()
      const makeImportNodes = makeImportNodes_.map(x => x.result)
      const imports = makeImportNodes_.map(x => x.directOutput[chanel.dependency] ?? assertFalse())
      const statements = statementEntries.map(x => getArgValue(x[0]).result).flat()
      const endPos = Position.asZeroLength(nextTokenPos) // This isn't the most accurate, as it doesn't handle whitesapce.

      const firstNode = [...makeImportNodes, ...statements].reverse().reduce((previousNode, makeNode) => (
        makeNode(previousNode)
      ), beginBlock ? nodes.beginBlock(deepRange(pos.file, [beginToken, beginBlock]), beginBlock) : nodes.noop(endPos))
      return nodes.createApi({
        content: nodes.moduleRoot(pos, { content: firstNode }),
        dependencies: imports,
      })
    })
  %}

importStatement
  -> "import" _ assignmentTarget _ "from" _ stringLiteral {%
    rawBoundary((getArgValue, { pos }, [,, assignmentTarget_,, ,, stringLiteral_]) => {
      const assignmentTarget = getArgValue(assignmentTarget_).result
      const { result: stringLiteral, directOutput: stringChanels } = getArgValue(stringLiteral_)
      const importPath = stringChanels[chanel.stringLiteralImportPath] ?? assertFalse()
      return GrammarBoundary.withDirectOutput({
        result: nextNode => nodes.declaration(pos, {
          declarations: [{
            assignmentTarget,
            expr: nodes.import_(pos, { from: importPath, fromNode: stringLiteral }),
            assignmentTargetPos: assignmentTarget.pos
          }],
          nextExpr: nextNode,
          newScope: false,
          export: false,
        }),
        directOutput: {
          [chanel.dependency]: importPath,
        }
      })
    })
  %}

block
  -> "{" _ (statement (_ ";"):? _):* "}" {%
    boundary(({ pos, nextTokenPos }, [,, statementEntries]) => {
      const statements = statementEntries.map(([statement]) => statement)
      const endPos = Position.asZeroLength(nextTokenPos) // This isn't the most accurate, as it doesn't handle whitesapce.
      const content = [...statements].reverse().reduce((previousNode, makeNode) => (
        makeNode(previousNode)
      ), nodes.noop(endPos))
      return nodes.block(pos, { content })
    })
  %}

blockAndModuleLevelStatement[ALLOW_EXPORT]
  -> ("export" _ $ALLOW_EXPORT):? "let" _ assignmentTarget _ "=" _ expr10 {%
    rawBoundary((getArgValue, { pos }, [exportEntry, ,, assignmentTarget_,, ,, expr_]) => {
      const { result: assignmentTarget, directOutput: assignmentTargetDirectOutput } = getArgValue(assignmentTarget_)
      const expr = getArgValue(expr_, {
        [chanel.assignmentTargetName]: assignmentTargetDirectOutput[chanel.bindName] ?? null
      }).result
      return nextNode => (
        nodes.declaration(pos, {
          declarations: [{ assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }],
          nextExpr: nextNode,
          newScope: false,
          export: !!exportEntry,
        })
      )
    })
  %} | "print" _ expr10 {%
    boundary(({ pos }, [,, r]) => nextNode => nodes.sequence(Position.range(pos, nextNode.pos), [
      nodes.print(pos, { r }),
      nextNode,
    ]))
  %} | "_printType" _ expr10 {%
    boundary(({ pos }, [,, r]) => nextNode => nodes.sequence(Position.range(pos, nextNode.pos), [
      nodes.printType(pos, { r }),
      nextNode,
    ]))
  %} | "_debug" _ expr10 {%
    boundary(({ pos }, [,, r]) => nextNode => nodes.sequence(Position.range(pos, nextNode.pos), [
      nodes.showDebugOutput(pos, { r }),
      nextNode,
    ]))
  %} | ("export" _ $ALLOW_EXPORT):? "function" _ userValueIdentifier _ (genericParamDefList _):? argDefList _ (type _):? block {%
    boundary(({ pos }, args) => {
      const [export_, ,, nameToken,, genericDefListEntry, params_,, bodyTypeNodeEntry, body] = args
      const posWithoutBody = deepRange(pos.file, args.slice(0, -1))
      const genericParamDefList = genericDefListEntry?.[0].entries ?? []
      const { entries: params } = params_
      const [maybeBodyTypeNode] = bodyTypeNodeEntry ?? [null]
      const fn = nodes.value.function_(pos, { params, body, maybeBodyTypeNode, purity: PURITY.none, genericParamDefList, posWithoutBody })
      const assignmentTarget = nodes.assignmentTarget.bind(DUMMY_POS, { identifier: nameToken.value, maybeTypeConstraintNode: null, identPos: asPos(pos.file, nameToken) })
      return nextNode => nodes.declaration(DUMMY_POS, {
        declarations: [{ assignmentTarget, expr: fn, assignmentTargetPos: DUMMY_POS }],
        nextExpr: nextNode,
        newScope: false,
        export: !!export_,
      })
    })  
  %} | ("export" _):? "type" _ "alias" _ %userType _ "=" _ type {%
    boundary(({ pos }, [export_, ,, ,, nameToken,, ,, typeNode]) => (
      !!export_
        ? nextNode => { throw new Error('Not implemented') }
        : nextNode => nodes.typeAlias(pos, { name: nameToken.value, typeNode, definedWithin: nextNode })
    ))
  %}

statement
  -> "return" _ expr10 {%
    boundary(({ pos }, [,, expr]) => nextNode => ( // Ignoring nextNode, as nothing can execute after return
      nodes.return_(pos, { value: expr })
    ))
  %} | ("get" | "run") _ expr80 {%
    rawBoundary((getArgValue, { pos }, [[callModifier_],, invokeExpr_]) => {
      const callModifier = getArgValue(callModifier_).result
      const purity = callModifier.value === 'get' ? PURITY.gets : PURITY.none
      const { result: invokeExpr, directOutput: invokeExprDirectOutput } =
        getArgValue(invokeExpr_, { [chanel.callWithPurity]: purity })
      if (!invokeExprDirectOutput[chanel.isInvokeExpr]) {
        throw new BadSyntaxError('This expression received a purity annotation, but such annotations should only be used on function calls.', invokeExpr.pos)
      }
      return nextNode => nodes.sequence(Position.range(invokeExpr.pos, nextNode.pos), [
        invokeExpr,
        nextNode,
      ])
    })
  %} | "if" _ expr10 _ block (_ "else" _ "if" _ expr10 _ block):* (_ "else" _ block):? {%
    boundary(({ pos, nextTokenPos }, [,, condition,, firstIfSo, elseIfEntries, elseEntry]) => {
      const endPos = Position.asZeroLength(nextTokenPos) // This isn't the most accurate, as it doesn't handle whitesapce.
      const [,,, lastIfNot] = elseEntry ?? [,,, nodes.noop(endPos)]
      const firstIfNot = [...elseIfEntries].reverse().reduce((ifNot, args) => {
        const [, ,, ,, condition,, ifSo] = args
        const innerPos = deepRange(pos.file, [args.slice(3), ifNot])
        return nodes.branch(innerPos, { condition, ifSo, ifNot })
      }, lastIfNot)
      return nextNode => nodes.sequence(Position.range(pos, endPos), [
        nodes.branch(pos, { condition, ifSo: firstIfSo, ifNot: firstIfNot}),
        nextNode,
      ])
    })
  %} | block {%
    boundary(({ pos }, [block]) => nextNode => nodes.sequence(Position.range(block.pos, nextNode.pos), [
      block,
      nextNode
    ]))
  %} | blockAndModuleLevelStatement[%impossible] {% id %}

moduleLevelStatement
  -> blockAndModuleLevelStatement[ignore] {% id %}

expr10
  -> "print" _ expr10 {%
    boundary(({ pos }, [, _, r]) => nodes.print(pos, { r }))
  %} | "_printType" _ expr10 {%
    boundary(({ pos }, [, _, r]) => nodes.printType(pos, { r }))
  %} | "_debug" _ expr10 {%
    boundary(({ pos }, [, _, r]) => nodes.showDebugOutput(pos, { r }))
  %} | ("let" _ assignmentTarget _ "=" _ expr10 _):+ "in" _ expr10 {%
    rawBoundary((getArgValue, { pos }, [declarationEntries, ,, endExpr_]) => {
      const endExpr = getArgValue(endExpr_).result
      const declarations = declarationEntries.map(([,, assignmentTarget_,, ,, expr_]) => {
        const { result: assignmentTarget, directOutput: assignmentTargetDirectOutput } = getArgValue(assignmentTarget_)
        const expr = getArgValue(expr_, {
          [chanel.assignmentTargetName]: assignmentTargetDirectOutput[chanel.bindName] ?? null,
        }).result
        return { assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }
      })
      return nodes.declaration(DUMMY_POS, { declarations, nextExpr: endExpr, newScope: true })
    })
  %} | "if" _ expr10 _ "then" _ expr10 _ "else" _ expr10 {%
    boundary(({ pos }, [if_,, condition,, ,, ifSo,, ,, ifNot]) => {
      return nodes.branch(pos, { condition, ifSo, ifNot })
    })
  %} | (%gets _):? (genericParamDefList _):? argDefList _ (type _):? "=>" _ expr10 {%
    boundary(({ pos }, args) => {
      const [getsEntry, genericParamDefListEntry, argDefList_,, bodyTypeNodeEntry, ,, body] = args
      const posWithoutBody = deepRange(pos.file, args.slice(0, -1))
      const { entries: argDefList } = argDefList_
      const purity = getsEntry == null ? PURITY.pure : PURITY.gets
      const genericParamDefList = genericParamDefListEntry?.[0].entries ?? []
      const [maybeBodyTypeNode] = bodyTypeNodeEntry ?? [null]
      return nodes.value.function_(pos, { params: argDefList, body, maybeBodyTypeNode, purity, genericParamDefList, posWithoutBody })
    })
  %} | expr15 {% id %}

expr15
  -> expr20 _ "@" _ expr15 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.applyTag(pos, { tag: l, content: r }))
  %} | expr20 {% id %}

expr20
  -> expr20 _ "==" _ expr30 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.equals(pos, { l, r }))
  %} | expr20 _ "!=" _ expr30 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.notEqual(pos, { l, r }))
  %} | expr30 {% id %}

expr30
  -> expr30 _ "as" _ type {%
    rawBoundary((getArgValue, { pos }, [expr_,, asToken_,, typeNode_], directInput) => {
      const expr = getArgValue(expr_, {
        [chanel.assignmentTargetName]: directInput[chanel.assignmentTargetName] ?? null,
      }).result
      const asToken = getArgValue(asToken_).result
      const typeNode = getArgValue(typeNode_).result
      const operatorAndTypePos = deepRange(pos.file, [asToken, typeNode])
      return nodes.typeAssertion(pos, { expr, typeNode, operatorAndTypePos })
    })
  %} | expr40 {% id %}

expr40
  -> expr40 _ "+" _ expr50 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.add(pos, { l, r }))
  %} | expr40 _ "-" _ expr50 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.subtract(pos, { l, r }))
  %} | expr50 {% id %}

expr50
  -> expr50 _ "*" _ expr60 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.multiply(pos, { l, r }))
  %} | expr60 {% id %}

expr60
  -> expr70 _ "**" _ expr60 {%
    boundary(({ pos }, [l,, ,, r]) => nodes.power(pos, { l, r }))
  %} | expr70 {% id %}

expr70
  -> ("get" | "run") _ expr80 {%
    rawBoundary((getArgValue, { pos }, [[callModifier_],, invokeExpr_]) => {
      const callModifier = getArgValue(callModifier_).result
      const purity = callModifier.value === 'get' ? PURITY.gets : PURITY.none
      const { result: invokeExpr, directOutput: invokeExprDirectOutput } =
        getArgValue(invokeExpr_, { [chanel.callWithPurity]: purity })
      if (!invokeExprDirectOutput[chanel.isInvokeExpr]) {
        throw new BadSyntaxError('This expression received a purity annotation, but such annotations should only be used on function calls.', invokeExpr.pos)
      }
      return invokeExpr
    })
  %} | expr80 {% id %}

expr80
  -> expr80 _ (genericParamList _):? "(" _ deliminated[expr10, "," _, ("," _):?] ")" {%
    boundary(({ pos }, [fnExpr,, genericParamListEntry, ,, fnArgs], directInput) => {
      const callWithPurity = directInput[chanel.callWithPurity] ?? PURITY.pure
      const [genericParams] = genericParamListEntry ?? [[]]
      return GrammarBoundary.withDirectOutput({
        result: nodes.invoke(pos, { fnExpr, genericParams, args: fnArgs.flat(), callWithPurity }),
        directOutput: { [chanel.isInvokeExpr]: true }
      })
    })
  %} | expr80 _ "." _ userValueIdentifier {%
    boundary(({ pos }, [expr,, ,,identifierToken]) => (
      nodes.propertyAccess(pos, { l: expr, identifier: identifierToken.value })
    ))
  %} | expr80 _ "[" _ expr10 _ "]" {%
    boundary(({ pos }, [expr,, ,,symbolExprNode]) => (
      nodes.symbolPropertyAccess(pos, { l: expr, symbolExprNode })
    ))
  %} | expr100 {% id %}

  genericParamList
    -> "<" _ nonEmptyDeliminated[type _, "," _, ("," _):?] ">" {%
      boundary(({ pos }, [,, entries]) => entries.map(([typeNode]) => typeNode))
    %}

expr100
  -> %number {%
    boundary(({ pos }, [token]) => (
      nodes.value.int(pos, { value: BigInt(token.value) })
    ))
  %} | %boolean {%
    boundary(({ pos }, [token]) => (
      nodes.value.boolean(pos, { value: token.value === 'true' })
    ))
  %} | identifier {%
    boundary(({ pos }, [token]) => token.value[0] === '$' && token.value.length > 1
      ? nodes.propertyAccess(pos, {
        l: nodes.stdLibRef(asPos(pos.file, token)),
        identifier: token.value.slice(1),
      })
      : nodes.varLookup(pos, { identifier: token.value })
    )
  %} | stringLiteral {%
    id
  %} | "(" expr10 ")" {%
    boundary(({ pos }, [, innerExpr]) => innerExpr)
  %} | "{" _ deliminated[(userValueIdentifier | "[" _ expr10 _ "]") _ (type _):? ":" _ expr10 _, "," _, ("," _):?] "}" {%
    boundary(({ pos }, [,, entries, ]) => {
      const content = []
      for (const [identifierOrSymbEntry, typeNodeEntry,, ,, target] of entries) {
        const [maybeRequiredTypeNode] = typeNodeEntry ?? []
        if (identifierOrSymbEntry[0].type !== '[') {
          const [identifier] = identifierOrSymbEntry
          const keyPos = asPos(pos.file, identifier)
          content.push({ type: 'IDENTIFIER', name: identifier.value, maybeRequiredTypeNode, target, keyPos })
        } else {
          const [,, symbolExprNode] = identifierOrSymbEntry
          content.push({ type: 'SYMBOL', symbolExprNode, maybeRequiredTypeNode, target, keyPos: symbolExprNode.pos })
        }
      }
      return nodes.value.record(pos, { recordEntries: content })
    })
  %} | "match" _ expr10 _ "{" _ ("when" _ pattern10 _ "then" _ expr10 (_ ";"):? _):+ "}" {%
    boundary(({ pos }, [,, matchValue,, ,, rawMatchArms, ]) => {
      const matchArms = rawMatchArms.map(([,, pattern,, ,, body]) => ({ pattern, body }))
      return nodes.match(pos, { matchValue, matchArms })
    })
  %} | "tag" _ (genericParamDefList _):? type {%
    boundary(({ pos }, [,, genericParamDefList_, typeNode], directInput) => {
      const genericParamDefList = genericParamDefList_?.[0].entries ?? []
      return nodes.value.tag(pos, {
        genericParamDefList,
        typeNode,
        name: directInput[chanel.assignmentTargetName] ?? null,
      })
    })
  %} | "symbol" {%
    boundary(({ pos }, [], directInput) => {
      return nodes.value.symbol(pos, {
        name: directInput[chanel.assignmentTargetName] ?? null,
      })
    })
  %} | "type" _ type {%
    boundary(({ pos }, [,, typeNode], directInput) => {
      return nodes.value.typeContainer(pos, {
        typeNode,
        name: directInput[chanel.assignmentTargetName]
          ? '#:' + directInput[chanel.assignmentTargetName]
          : null,
      })
    })
  %}

stringLiteral
  -> %stringStart %stringContent:? %stringEnd {%
    boundary(({ pos }, [start, contentEntry, end]) => {
      const uninterpretedValue = contentEntry?.value ?? ''
      const interprettedValue = nodes.value.parseEscapeSequences(uninterpretedValue, pos)
      return GrammarBoundary.withDirectOutput({
        result: nodes.value.string(pos, { uninterpretedValue }),
        directOutput: {
          [chanel.stringLiteralImportPath]: interprettedValue
        },
      })
    })
  %}

assignmentTarget -> pattern10 {% id %}

pattern10
  -> pattern10 _ "where" _ expr10 {%
    rawBoundary((getArgValue, { pos }, [pattern_,, ,, constraint_]) => {
      const { result: pattern, directOutput: patternDirectOutput } = getArgValue(pattern_)
      const constraint = getArgValue(constraint_).result
      return GrammarBoundary.withDirectOutput({
        result: nodes.assignmentTarget.valueConstraint(pos, { assignmentTarget: pattern, constraint }),
        directOutput: { [chanel.bindName]: patternDirectOutput[chanel.bindName] ?? null }
      })
    })
  %} | pattern20 {% id %}

pattern20
  -> expr20 _ "@" _ pattern20 {%
    boundary(({ pos }, [tag,, ,, pattern]) => (
      nodes.assignmentTarget.destructureTagged(pos, { tag, innerContent: pattern })
    ))
  %} | pattern30 {% id %}

pattern30
  -> pattern40 _ ">" _ expr30 {%
    boundary(({ pos }, [pattern,, ,, constraint]) => { throw new Error('Not Implemented!') }) // Can't be done until comparison type classes are done. (make sure to pass chanel.bindName down)
  %} | pattern40 {% id %}

pattern40
  -> userValueIdentifier (_ type):? {%
    boundary(({ pos }, [identifier, maybeTypeNodeEntry]) => {
      const [, maybeTypeConstraintNode] = maybeTypeNodeEntry ?? []
      return GrammarBoundary.withDirectOutput({
        result: nodes.assignmentTarget.bind(pos, {
          identifier: identifier.value,
          maybeTypeConstraintNode,
          identPos: deepRange(pos.file, identifier),
        }),
        directOutput: { [chanel.bindName]: identifier.value },
      })
    })
  %} | "{" _ deliminated[(identifier | "[" _ expr10 _ "]") _ ":" _ pattern10 _, "," _, ("," _):?] "}" {%
    boundary(({ pos }, [,, destructureEntries]) => {
      const entries = destructureEntries.map(([identifierOrSymbolEntry,, ,, target]) => {
        if (identifierOrSymbolEntry[0].type !== '[') {
          const [identifier] = identifierOrSymbolEntry
          return { type: 'IDENTIFIER', name: identifier.value, target, keyPos: asPos(pos.file, identifier) }
        } else {
          const [,, symbNode] = identifierOrSymbolEntry
          return { type: 'SYMBOL', symbNode, target, keyPos: symbNode.pos }
        }
      })
      return nodes.assignmentTarget.destructureRecord(pos, { entries })
    })
  %}

type
  -> %simpleType {%
    boundary(({ pos }, [token]) => nodes.type.simpleType(pos, { typeName: token.value }))
  %} | %userType {%
    boundary(({ pos }, [token]) => nodes.type.userTypeLookup(pos, { typeName: token.value }))
  %} | "#" ":" _ expr70  {%
    boundary(({ pos }, [,,, expr]) => (
      nodes.type.descendentType(pos, { expr })
    ))
  %} | "#typeof" _ "(" _ expr10 _ ")"  {%
    boundary(({ pos }, [,, ,, expr]) => (
      nodes.type.typeOfExpr(pos, { expr })
    ))
  %} | "#" "{" _ deliminated[(userValueIdentifier | "[" _ type _ "]") _ type _, "," _, ("," _):?] "}" {%
    boundary(({ pos }, [, ,, entries]) => {
      const content = entries.map(([identifierOrTypeEntry,, typeNode]) => {
        if (identifierOrTypeEntry[0].type !== '[') {
          const [identifierToken] = identifierOrTypeEntry
          const keyPos = asPos(pos.file, identifierToken)
          return { type: 'IDENTIFIER', name: identifierToken.value, typeNode, keyPos }
        } else {
          const [,, symbTypeNode] = identifierOrTypeEntry
          const keyPos = symbTypeNode.pos
          return { type: 'SYMBOL', symbTypeNode, typeNode, keyPos }
        }
      })
      return nodes.type.recordType(pos, { recordTypeEntries: content })
    })
  %} | ("#gets" _ | "#") (genericParamDefList _):? typeList _ "=>" _ type {%
    boundary(({ pos }, [[callModifierToken], genericParamDefListEntry, paramTypeNodes,, ,, bodyTypeNode]) => {
      const purity = callModifierToken.value === '#gets' ? PURITY.gets : PURITY.pure
      const genericParamDefList = genericParamDefListEntry?.[0].entries ?? []
      return nodes.type.functionType(pos, { purity, genericParamDefList, paramTypeNodes, bodyTypeNode })
    })
  %} | "#function" _ (genericParamDefList _):? typeList _ type {%
    boundary(({ pos }, [,, genericParamDefListEntry, paramTypeNodes,, bodyTypeNode]) => {
      const purity = PURITY.none
      const genericParamDefList = genericParamDefListEntry?.[0].entries ?? []
      return nodes.type.functionType(pos, { purity, genericParamDefList, paramTypeNodes, bodyTypeNode })
    })
  %}

  typeList
    -> "(" _ deliminated[type, "," _, ("," _):?] ")" {%
      boundary(({ pos }, [,, typeNodesEntry]) => typeNodesEntry.map(([typeNode]) => typeNode))
    %}

argDefList
  -> "(" _ deliminated[assignmentTarget, "," _, ("," _):?] ")" {%
    boundary(({ pos }, [,, entries]) => {
      return { pos, entries: entries.map(([assignmentTarget]) => assignmentTarget) }
    })
  %}

genericParamDefList
  -> "<" _ nonEmptyDeliminated[%userType _ (%of _ type _):?, "," _, ("," _):?] ">" {%
    boundary(({ pos }, [,, rawEntries]) => {
      const entries = rawEntries.map(([identifier,, typeEntry]) => {
        const [,, constraintNode = nodes.type.simpleType(DUMMY_POS, { typeName: '#unknown' })] = typeEntry ?? []
        return { identifier: identifier.value, constraintNode, identPos: asPos(pos.file, identifier) }
      })
      return { pos, entries }
    })
  %}

userValueIdentifier
  -> %upperIdentifier {% id %}
  | %nonUpperIdentifier {% id %}
  | "$" {% id %}

identifier
  -> %upperIdentifier {% id %}
  | %nonUpperIdentifier {% id %}
  | %builtinIdentifier {% id %}
  | "$" {% id %}

ignore -> %impossible:? {% () => null %}

_ -> (%whitespace | %comment | %multilineComment | %newLine):* {% () => null %}
