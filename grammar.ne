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
# expr80: 'The "(" in f()' 'The "<" in f<#T>()'
# expr90: '.'
# expr100: Things that don't require an order of operations, like literals

@preprocessor typescript

@{%
  import * as nodes from './nodes/index'
  import moo from 'moo'
  import * as Type from './language/Type'
  import * as types from './language/types'
  import * as TypeState from './language/TypeState'
  import { PURITY } from './language/constants'
  import { from as asPos, range } from './language/Position'
  import { SemanticError } from './language/exceptions'

  const mapMapValues = (map, mapFn) => (
    new Map([...map.entries()].map(([key, value]) => [key, mapFn(value)]))
  )

  const DUMMY_POS = asPos({ line: 1, col: 1, offset: 0, text: '' } as moo.Token) // TODO - get rid of all occurances of this
%}

@{%
  const lexer = moo.states({
    main: {
      'comment': /\/\/.*/,
      'multilineComment': { match: /\/\*[^]*?\*\//, lineBreaks: true },
      'whitespace': /[ \t]+/,
      'newLine':  { match: '\n', lineBreaks: true },

      'boolean': ['true', 'false'],
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

      'let': 'let',
      'in': 'in',
      '=>': '=>',
      '=': '=',
      '.': '.',
      /*
      "and" return 'AND'
      "or" return 'OR'
      "not" return 'NOT'
      "instanceof" return 'INSTANCEOF'
      "is" return 'IS'
      */
      'print': 'print',
      '_printType': '_printType',

      ',': ',',
      /*
      "[" return '['
      "]" return ']'
      */
      '(': '(',
      ')': ')',
      '{': '{',
      '}': '}',
      '<': '<',
      '>': '>',
      ':': ':',
      '@': '@',
      ';': ';',

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
      'variant': 'variant',
      'export': 'export',
      'import': 'import',
      'from': 'from',

      'upperIdentifier': /[A-Z][a-zA-Z0-9]*_*/,
      'nonUpperIdentifier': /[a-z][a-zA-Z0-9]*_*|[0-9][a-zA-Z0-9]*_+/,
      'builtinIdentifier': /\$[a-zA-Z0-9]+_*|\$[0-9][a-zA-Z0-9]*_+/,
      '$': '$',
      'number': /\d+/,
      '#gets': '#gets',
      '#function': '#function',
      'simpleType': /\#[a-z][a-zA-Z0-9]*/,
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
  -> _ module {%
    ([, module]) => nodes.root({ module })
  %}

module
  -> deliminated[importStatement (_ ";"):?, _, _] deliminated[moduleLevelStatement (_ ";"):?, _, _] (%begin _ block _):? {%
    ([importEntries, statementEntries, beginBlockEntry]) => {
      const [,, beginBlock] = beginBlockEntry ?? [,,, null]
      const makeImportNodes = importEntries.map(x => x[0]).flat()
      const statements = statementEntries.map(x => x[0]).flat()
      const rootNodeWithoutImports = statements.reverse().reduce((previousNode, makeNode) => (
        makeNode(previousNode)
      ), beginBlock ? nodes.beginBlock(DUMMY_POS, beginBlock) : nodes.noop())
      const { imports, previousNode: rootNode } =
        makeImportNodes.reverse().reduce(({ imports, previousNode }, makeNode) => {
          const newNode = makeNode(previousNode)
          return { imports: [...imports, newNode.data.dependency], previousNode: newNode }
        }, { imports: [], previousNode: rootNodeWithoutImports })
      return nodes.module(DUMMY_POS, {
        content: rootNode,
        dependencies: imports,
      })
    }
  %}

importStatement
  -> "import" _ assignmentTarget _ "from" _ stringLiteral {%
    ([,, assignmentTarget,, ,, stringLiteral]) => nextNode => (
      nodes.importMeta(DUMMY_POS, {
        from: stringLiteral.data.value,
        childNode: nodes.declaration(DUMMY_POS, {
          declarations: [{
            assignmentTarget,
            expr: nodes.import_(DUMMY_POS, { from: stringLiteral.data.value }),
            assignmentTargetPos: DUMMY_POS
          }],
          expr: nextNode,
          newScope: false,
          export: false,
        }),
      })
    )
  %}

block
  -> "{" _ (statement (_ ";"):? _):* "}" {%
    ([start,, statementEntries, end]) => {
      const statements = statementEntries.map(([statement]) => statement)
      const content = [...statements].reverse().reduce((previousNode, makeNode) => (
        makeNode(previousNode)
      ), nodes.noop())
      return nodes.block(range(start, end), { content })
    }
  %}

blockAndModuleLevelStatement[ALLOW_EXPORT]
  -> ("export" _ $ALLOW_EXPORT):? "let" _ assignmentTarget _ "=" _ expr10 {%
    ([export_, let_,, assignmentTarget,, ,, expr]) => nextNode => (
      nodes.declaration(range(let_, expr.pos), {
        declarations: [{ assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }],
        expr: nextNode,
        newScope: false,
        export: !!export_,
      })
    )
  %} | "print" _ expr10 {%
    ([print,, r]) => nextNode => nodes.sequence([
      nodes.print(range(print, r.pos), { r }),
      nextNode,
    ])
  %} | "_printType" _ expr10 {%
    ([print,, r]) => nextNode => nodes.sequence([
      nodes.printType(range(print, r.pos), { r }),
      nextNode,
    ])
  %} | ("export" _ $ALLOW_EXPORT):? "function" _ userValueIdentifier _ (genericParamDefList _):? argDefList _ (type _):? block {%
    ([export_, function_,, nameToken,, genericDefListEntry, params,, getBodyTypeEntry, body]) => {
      const [genericParamDefList] = genericDefListEntry ?? [[]]
      const [getBodyType] = getBodyTypeEntry ?? [null]
      const fn = nodes.value.function_(DUMMY_POS, { params, body, getBodyType, bodyTypePos: DUMMY_POS, purity: PURITY.none, genericParamDefList })
      const assignmentTarget = nodes.assignmentTarget.bind(DUMMY_POS, { identifier: nameToken.value, getTypeConstraint: null, identPos: asPos(nameToken), typeConstraintPos: DUMMY_POS })
      return nextNode => nodes.declaration(DUMMY_POS, {
        declarations: [{ assignmentTarget, expr: fn, assignmentTargetPos: DUMMY_POS }],
        expr: nextNode,
        newScope: false,
        export: !!export_,
      })
    }
  %} | ("export" _):? "type" _ "alias" _ %userType _ "=" _ type {%
    ([export_, ,, ,, nameToken,, ,, getType]) => (
      !!export_
        ? nextNode => { throw new Error('Not implemented') }
        : nextNode => nodes.typeAlias(DUMMY_POS, { name: nameToken.value, getType, definedWithin: nextNode, typePos: DUMMY_POS })
    )
  %}

statement
  -> "return" _ expr10 {%
    ([return_,, expr]) => nextNode => ( // Ignoring nextNode, as nothing can execute after return
      nodes.return_(range(return_, expr.pos), { value: expr })
    )
  %} | ("get" | "run") _ expr80 {%
    ([[callModifier],, invokeExpr]) => nextNode => nodes.sequence([
      nodes.callWithPermissions(range(callModifier, invokeExpr.pos), {
        purity: callModifier.value === 'get' ? PURITY.gets : PURITY.none,
        invokeExpr,
      }),
      nextNode
    ])
  %} | "if" _ expr10 _ block (_ "else" _ "if" _ expr10 _ block):* (_ "else" _ block):? {%
    ([,, condition,, firstIfSo, elseIfEntries, elseEntry]) => {
      const [,,, lastIfNot] = elseEntry ?? [,,, nodes.noop()]
      const firstIfNot = [...elseIfEntries].reverse().reduce((ifNot, [, ,, ,, condition,, ifSo]) => (
        nodes.branch(DUMMY_POS, { condition, ifSo, ifNot })
      ), lastIfNot)
      return nextNode => nodes.sequence([
        nodes.branch(DUMMY_POS, { condition, ifSo: firstIfSo, ifNot: firstIfNot}),
        nextNode
      ])
    }
  %} | block {%
    ([block]) => nextNode => nodes.sequence([
      block,
      nextNode
    ])
  %} | blockAndModuleLevelStatement[%impossible] {% id %}

moduleLevelStatement
  -> blockAndModuleLevelStatement[ignore] {% id %}

expr10
  -> "print" _ expr10 {%
    ([print, _, r]) => nodes.print(range(print, r.pos), { r })
  %} | "_printType" _ expr10 {%
    ([print, _, r]) => nodes.printType(range(print, r.pos), { r })
  %} | ("let" _ assignmentTarget _ "=" _ expr10 _):+ "in" _ expr10 {%
    ([declarationEntries, ,, expr]) => {
      const declarations = declarationEntries.map(([,, assignmentTarget,, ,, expr]) => (
        { assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }
      ))
      return nodes.declaration(DUMMY_POS, { declarations, expr, newScope: true })
    }
  %} | "if" _ expr10 _ "then" _ expr10 _ "else" _ expr10 {%
    ([if_,, condition,, ,, ifSo,, ,, ifNot]) => nodes.branch(range(if_, ifNot.pos), { condition, ifSo, ifNot })
  %} | (%gets _):? (genericParamDefList _):? argDefList _ (type _):? "=>" _ expr10 {%
    ([getsEntry, genericParamDefListEntry, argDefList,, getBodyTypeEntry, ,, body]) => {
      const purity = getsEntry == null ? PURITY.pure : PURITY.gets
      const [genericParamDefList] = genericParamDefListEntry ?? [[]]
      const [getBodyType] = getBodyTypeEntry ?? [null]
      return nodes.value.function_(DUMMY_POS, { params: argDefList, body, getBodyType, bodyTypePos: DUMMY_POS, purity, genericParamDefList })
    }
  %} | expr15 {% id %}

expr15
  -> expr20 _ "@" _ expr15 {%
    ([l,, ,, r]) => nodes.applyTag(range(l.pos, r.pos), { tag: l, content: r })
  %} | expr20 {% id %}

expr20
  -> expr20 _ "==" _ expr30 {%
    ([l,, ,, r]) => nodes.equals(range(l.pos, r.pos), { l, r })
  %} | expr20 _ "!=" _ expr30 {%
    ([l,, ,, r]) => nodes.notEqual(range(l.pos, r.pos), { l, r })
  %} | expr30 {% id %}

expr30
  -> expr30 _ "as" _ type {%
    ([expr,, ,, getType]) => nodes.typeAssertion(DUMMY_POS, { expr, getType, typePos: DUMMY_POS, operatorAndTypePos: DUMMY_POS })
  %} | expr40 {% id %}

expr40
  -> expr40 _ "+" _ expr50 {%
    ([l,, ,, r]) => nodes.add(range(l.pos, r.pos), { l, r })
  %} | expr40 _ "-" _ expr50 {%
    ([l,, ,, r]) => nodes.subtract(range(l.pos, r.pos), { l, r })
  %} | expr50 {% id %}

expr50
  -> expr50 _ "*" _ expr60 {%
    ([l,, ,, r]) => nodes.multiply(range(l.pos, r.pos), { l, r })
  %} | expr60 {% id %}

expr60
  -> expr70 _ "**" _ expr60 {%
    ([l,, ,, r]) => nodes.power(range(l.pos, r.pos), { l, r })
  %} | expr70 {% id %}

expr70
  -> (%get | %run) _ expr80 {%
    ([[callModifier],, invokeExpr]) => nodes.callWithPermissions(range(callModifier, invokeExpr.pos), {
      purity: callModifier.value === 'get' ? PURITY.gets : PURITY.none,
      invokeExpr,
    })
  %} | expr80 {% id %}

expr80
  -> expr80 _ (genericParamList _):? "(" _ deliminated[expr10, "," _, ("," _):?] ")" {%
    ([fnExpr,, genericParamListEntry, ,, args]) => {
      const [genericParams] = genericParamListEntry ?? [[]]
      return nodes.invoke(DUMMY_POS, { fnExpr, genericParams, args: args.flat() })
    }
  %} | expr90 {% id %}

  genericParamList
    -> "<" _ nonEmptyDeliminated[type _, "," _, ("," _):?] ">" {%
      ([,, entries]) => entries.map(([getType]) => ({ getType, pos: DUMMY_POS }))
    %}

expr90
  -> expr90 _ "." _ userValueIdentifier {%
    ([expr,, ,,identifierToken]) => nodes.propertyAccess(range(expr.pos, identifierToken), { l: expr, identifier: identifierToken.value })
  %} | expr100 {% id %}

expr100
  -> %number {%
    ([token]) => nodes.value.int(asPos(token), { value: BigInt(token.value) })
  %} | %boolean {%
    ([token]) => nodes.value.boolean(asPos(token), { value: token.value === 'true' })
  %} | identifier {%
    ([token]) => token.value[0] === '$' && token.value.length > 1
      ? nodes.propertyAccess(asPos(token), {
        l: nodes.stdLibRef(asPos(token)),
        identifier: token.value.slice(1),
      })
      : nodes.identifier(asPos(token), { identifier: token.value })
  %} | stringLiteral {%
    id
  %} | "{" _ deliminated[userValueIdentifier _ (type _):? ":" _ expr10 _, "," _, ("," _):?] "}" {%
    ([,, entries, ]) => {
      const content = new Map()
      for (const [identifier, typeEntry,, ,, target] of entries) {
        const [requiredTypeGetter] = typeEntry ?? []
        if (content.has(identifier.value)) {
          throw new SemanticError(`duplicate identifier found in record: ${identifier}`, asPos(identifier))
        }
        content.set(identifier.value, { requiredTypeGetter, target })
      }
      return nodes.value.record(DUMMY_POS, { content })
    }
  %} | "match" _ expr10 _ "{" _ ("when" _ pattern10 _ "then" _ expr10 (_ ";"):? _):+ "}" {%
    ([,, matchValue,, ,, rawMatchArms, ]) => {
      const matchArms = rawMatchArms.map(([,, pattern,, ,, body]) => ({ pattern, body }))
      return nodes.match(DUMMY_POS, { matchValue, matchArms })
    }
  %} | "tag" _ (genericParamDefList _):? type {%
    ([,, genericParamDefList_, getType]) => {
      const [genericParamDefList] = genericParamDefList_ ?? [null]
      return nodes.value.tag(DUMMY_POS, { genericParamDefList, getType, typePos: DUMMY_POS })
    }
  %}

stringLiteral
  -> %stringStart %stringContent:? %stringEnd {%
    ([start, contentEntry, end]) => nodes.value.string(range(start, end), { uninterpretedValue: contentEntry?.value ?? '' })
  %}

assignmentTarget -> pattern10 {% id %}

pattern10
  -> pattern10 _ "where" _ expr10 {%
    ([pattern,, ,, constraint]) => nodes.assignmentTarget.valueConstraint(DUMMY_POS, { assignmentTarget: pattern, constraint })
  %} | pattern20 {% id %}

pattern20
  -> expr20 _ "@" _ pattern20 {%
    ([tag,, ,, pattern]) => nodes.assignmentTarget.destructureTagged(DUMMY_POS, { tag, innerContent: pattern })
  %} | pattern30 {% id %}

pattern30
  -> pattern40 _ ">" _ expr30 {%
    ([pattern,, ,, constraint]) => { throw new Error('Not Implemented!') } // Can't be done until comparison type classes are done.
  %} | pattern40 {% id %}

pattern40
  -> userValueIdentifier (_ type):? {%
    ([identifier, maybeGetTypeEntry]) => {
      const [, getType] = maybeGetTypeEntry ?? []
      return nodes.assignmentTarget.bind(DUMMY_POS, { identifier: identifier.value, getTypeConstraint: getType, identPos: DUMMY_POS, typeConstraintPos: DUMMY_POS })
    }
  %} | "{" _ deliminated[identifier _ ":" _ pattern10 _, "," _, ("," _):?] "}" {%
    ([leftBracket,, destructureEntries, rightBracket]) => (
      nodes.assignmentTarget.destructureObj(range(leftBracket, rightBracket), {
        entries: new Map(destructureEntries.map(([identifier,, ,, target]) => [identifier.value, target]))
      })
    )
  %}

@{%
  const createFnTypeGetter = ({ purity, genericParamDefList, paramTypeGetters, getBodyType }) => (state, pos) => {
    let constraints = []
    for (const { identifier, getConstraint, identPos, constraintPos } of genericParamDefList) {
      const constraint_ = getConstraint(state, constraintPos)
      const constraint = Type.createParameterType({
        constrainedBy: constraint_,
        parameterName: constraint_.reprOverride ?? 'UNKNOWN' // TODO: This parameterName was probably a bad idea.
      })
      constraints.push(constraint)
      state = TypeState.addToTypeScope(state, identifier, () => constraint, identPos)
    }
    return types.createFunction({
      paramTypes: paramTypeGetters.map(getType => getType(state, pos)),
      genericParamTypes: constraints,
      bodyType: getBodyType(state, pos),
      purity,
    })
  }
%}

type
  -> %userType {%
    ([token]) => (state, pos) => {
      const typeInfo = TypeState.lookupType(state, token.value)
      if (!typeInfo) throw new SemanticError(`Type "${token.value}" not found.`, asPos(token))
      return Type.withName(typeInfo.createType(), token.value)
    }
  %} | %simpleType {%
    ([token]) => {
      if (token.value === '#unit') return () => types.createUnit()
      else if (token.value === '#int') return () => types.createInt()
      else if (token.value === '#string') return () => types.createString()
      else if (token.value === '#boolean') return () => types.createBoolean()
      else if (token.value === '#never') return () => types.createNever()
      else if (token.value === '#unknown') return () => types.createUnknown()
      else throw new SemanticError(`Invalid built-in type ${token.value}`, asPos(token))
    }
  %} | "#" ":" _ expr70  {%
    ([,,, expr]) => (state, pos) => {
      const { respState, type } = expr.typeCheck(state)
      // Ignoring the respState - there's currently not a way to transfer that back up.
      // Plus, it has bad information, like, dependendencies on variables from outside scopes that
      // don't actually exist, because we're never going to execute this expression.
      return Type.getTypeMatchingDescendants(type, pos)
    }
  %} | "#" "{" _ deliminated[userValueIdentifier _ type _, "," _, ("," _):?] "}" {%
    ([, ,, entries, ]) => {
      const content = new Map()
      for (const [identifierToken,, getType] of entries) {
        if (content.has(identifierToken.value)) {
          throw new SemanticError(`This record type definition contains the same key "${identifierToken.value}" multiple times.`, asPos(identifierToken))
        }
        content.set(identifierToken.value, getType)
      }
      return (state, pos) => types.createRecord({ nameToType: mapMapValues(content, getType => getType(state, pos)) })
    }
  %} | ("#gets" _ | "#") (genericParamDefList _):? typeList _ "=>" _ type {%
    ([[callModifierToken], genericParamDefListEntry, paramTypeGetters,, ,, getBodyType]) => {
      const purity = callModifierToken.value === '#gets' ? PURITY.gets : PURITY.pure
      const [genericParamDefList] = genericParamDefListEntry ?? [[]]
      return createFnTypeGetter({ purity, genericParamDefList, paramTypeGetters, getBodyType })
    }
  %} | "#function" _ (genericParamDefList _):? typeList _ type {%
    ([,, genericParamDefListEntry, paramTypeGetters,, getBodyType]) => {
      const purity = PURITY.none
      const [genericParamDefList] = genericParamDefListEntry ?? [[]]
      return createFnTypeGetter({ purity, genericParamDefList, paramTypeGetters, getBodyType })
    }
  %}

  typeList
    -> "(" _ deliminated[type, "," _, ("," _):?] ")" {%
      ([,, typeGettersEntry]) => typeGettersEntry.map(([getType]) => getType)
    %}

argDefList
  -> "(" _ deliminated[assignmentTarget, "," _, ("," _):?] ")" {%
    ([,, entries]) => entries.map(([assignmentTarget]) => assignmentTarget)
  %}

genericParamDefList
  -> "<" _ nonEmptyDeliminated[%userType _ (%of _ type _):?, "," _, ("," _):?] ">" {%
    ([,, entries]) => (
      entries.map(([identifier,, typeEntry]) => {
        const [,, getConstraint] = typeEntry ?? [,, () => types.createUnknown()]
        return { identifier: identifier.value, getConstraint, identPos: asPos(identifier), constraintPos: DUMMY_POS }
      })
    )
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
