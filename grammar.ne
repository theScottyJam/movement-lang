## Precedence key ##
# expr10: 'IN', '=>', 'PRINT', 'ELSE'
# expr20: '==' '!='
# expr30: 'AS'
# expr40: '+' '-'
# expr50: '*'
# expr60: '**'
# expr70: 'GET', 'RUN'
# expr80: 'The "(" in f()' 'The "<" in f<#T>()'
# expr90: '.'
# expr100: Things that don't require an order of operations, like literals

@{%
  const { nodes } = require('./grammarTools')
  const { tools } = nodes
  const { asPos, range } = tools
  const DUMMY_POS = asPos({ line: 1, col: 1, offset: 0, text: '' }) // TODO - get rid of all occurances of this
%}

@{%
  const moo = require("moo")

  const lexer = moo.states({
    main: {
      comment: /\/\/.*/,
      whitespace: /[ \t]+/,
      newLine: {match: '\n', lineBreaks: true},

      number: /\d+/,
      boolean: ['true', 'false'],
      stringStart: {match: "'", push: 'string'},

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
      'end': 'end',
      

      'identifier': /\$|[a-zA-Z][a-zA-Z0-9]*/,
      '#gets': '#gets',
      '#function': '#function',
      simpleType: /\#[a-z][a-zA-Z0-9]*/,
      userType: /\#[A-Z][a-zA-Z0-9]*/,
      '#': '#',

      impossible: /^\b$/,
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
  -> _ module _ {%
    ([, module, ]) => nodes.root({ module })
  %}

module
  -> deliminated[moduleLevelStatement, _, ignore] (_ %begin _ block):? {%
    ([statementEntries, beginBlockEntry]) => {
      const [,,, beginBlock] = beginBlockEntry ?? [,,, null]
      const statements = statementEntries.flat()
      return [...statements].reverse().reduce((previousNode, makeNode) => (
        makeNode(previousNode)
      ), beginBlock ? nodes.beginBlock(DUMMY_POS, beginBlock) : nodes.noop())
    }
  %}

block
  -> "{" _ (statement _):* "}" {%
    ([start,, statementEntries, end]) => {
      const statements = statementEntries.map(([statement]) => statement)
      const content = [...statements].reverse().reduce((previousNode, makeNode) => (
        makeNode(previousNode)
      ), nodes.noop())
      return nodes.block(range(start, end), { content })
    }
  %}

statement
  -> "return" _ expr10 {%
    ([return_,, expr]) => nextNode => ( // Ignoring nextNode, as nothing can execute after return
      nodes.return(range(return_, expr.pos), { value: expr })
    )
  %} | ("get" | "run") _ expr80 {%
    ([[callModifier],, invokeExpr]) => nextNode => nodes.sequence([
      nodes.callWithPermissions(range(callModifier, invokeExpr.pos), {
        purity: callModifier.value === 'GET' ? tools.PURITY.gets : tools.PURITY.none,
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
  %} | moduleLevelStatement {% id %}

moduleLevelStatement
  -> "let" _ assignmentTarget _ "=" _ expr10 {%
    ([let_,, assignmentTarget,, ,, expr]) => (
      nextNode => nodes.declaration(range(let_, expr.pos), {
        declarations: [{ assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }],
        expr: nextNode,
      })
    )
  %} | "print" _ expr10 {%
    ([print,, r]) => nextNode => nodes.sequence([
      nodes.print(range(print, r.pos), { r }),
      nextNode,
    ])
  %} | "function" _ %identifier _ (templateParamDefList _):? argDefList _ (type _):? block {%
    ([function_,, nameToken,, templateDefListEntry, params,, getBodyTypeEntry, body]) => {
      const [templateParamDefList] = templateDefListEntry ?? [[]]
      const [getBodyType] = getBodyTypeEntry ?? [null]
      const fn = nodes.function(DUMMY_POS, { params, body, getBodyType, purity: tools.PURITY.none, templateParamDefList })
      const assignmentTarget = nodes.assignment.bind(DUMMY_POS, { identifier: nameToken.value, getTypeConstraint: null, identPos: asPos(nameToken), typeConstraintPos: DUMMY_POS })
      return nextNode => nodes.declaration(DUMMY_POS, {
        declarations: [{ assignmentTarget, expr: fn, assignmentTargetPos: DUMMY_POS }],
        expr: nextNode
      })
    }
  %} | "type" _ "alias" _ %userType _ "=" _ type {%
    ([,, ,, nameToken,, ,, getType]) => (
      nextNode => nodes.typeAlias(DUMMY_POS, { name: nameToken.value, getType, definedWithin: nextNode, typePos: DUMMY_POS })
    )
  %}

expr10
  -> "print" _ expr10 {%
    ([print, _, r]) => nodes.print(range(print, r.pos), { r })
  %} | ("let" _ assignmentTarget _ "=" _ expr10 _):+ "in" _ expr10 {%
    ([declarationEntries, ,, expr]) => {
      const declarations = declarationEntries.map(([,, assignmentTarget,, ,, expr]) => (
        { assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }
      ))
      return nodes.declaration(DUMMY_POS, { declarations, expr })
    }
  %} | "if" _ expr10 _ "then" _ expr10 _ "else" _ expr10 {%
    ([if_,, condition,, ,, ifSo,, ,, ifNot]) => nodes.branch(range(if_, ifNot.pos), { condition, ifSo, ifNot })
  %} | (%gets _):? (templateParamDefList _):? argDefList _ (type _):? "=>" _ expr10 {%
    ([getsEntry, templateParamDefListEntry, argDefList,, getBodyTypeEntry, ,, body]) => {
      const purity = getsEntry == null ? tools.PURITY.pure : tools.PURITY.gets
      const [templateParamDefList] = templateParamDefListEntry ?? [[]]
      const [getBodyType] = getBodyTypeEntry ?? [null]
      return nodes.function(DUMMY_POS, { params: argDefList, body, getBodyType, bodyTypePos: DUMMY_POS, purity, templateParamDefList })
    }
  %} | expr20 {% id %}

expr20
  -> expr20 _ "==" _ expr30 {%
    ([l,, ,, r]) => nodes['=='](range(l.pos, r.pos), { l, r })
  %} | expr20 _ "!=" _ expr30 {%
    ([l,, ,, r]) => nodes['!='](range(l.pos, r.pos), { l, r })
  %} | expr30 {% id %}

expr30
  -> expr30 _ "as" _ type {%
    ([expr,, ,, getType]) => nodes.typeAssertion(DUMMY_POS, { expr, getType, typePos: DUMMY_POS, operatorAndTypePos: DUMMY_POS })
  %} | expr40 {% id %}

expr40
  -> expr40 _ "+" _ expr50 {%
    ([l,, ,, r]) => nodes['+'](range(l.pos, r.pos), { l, r })
  %} | expr40 _ "-" _ expr50 {%
    ([l,, ,, r]) => nodes['-'](range(l.pos, r.pos), { l, r })
  %} | expr50 {% id %}

expr50
  -> expr50 _ "*" _ expr60 {%
    ([l,, ,, r]) => nodes['*'](range(l.pos, r.pos), { l, r })
  %} | expr60 {% id %}

expr60
  -> expr70 _ "**" _ expr60 {%
    ([l,, ,, r]) => nodes['**'](range(l.pos, r.pos), { l, r })
  %} | expr70 {% id %}

expr70
  -> (%get | %run) _ expr80 {%
    ([[callModifier],, invokeExpr]) => nodes.callWithPermissions(range(callModifier, invokeExpr.pos), {
      purity: callModifier.value === 'GET' ? tools.PURITY.gets : tools.PURITY.none,
      invokeExpr,
    })
  %} | expr80 {% id %}

expr80
  -> expr80 _ (templateParamList _):? "(" _ deliminated[expr10, "," _, ("," _):?] ")" {%
    ([fnExpr,, templateParamListEntry, ,, params]) => {
      const [templateParams] = templateParamListEntry ?? [[]]
      return nodes.invoke(DUMMY_POS, { fnExpr, templateParams, params: params.flat() })
    }
  %} | expr90 {% id %}

  templateParamList
    -> "<" _ nonEmptyDeliminated[type _, "," _, ("," _):?] ">" {%
      ([,, entries]) => entries.map(([getType]) => ({ getType, loc: DUMMY_POS }))
    %}

expr90
  -> expr90 _ "." _ %identifier {%
    ([expr,, ,,identifierToken]) => nodes['.'](range(expr.pos, identifierToken), { l: expr, identifier: identifierToken.value })
  %} | expr100 {% id %}

expr100
  -> %number {%
    ([token]) => nodes.number(asPos(token), { value: BigInt(token.value) })
  %} | %boolean {%
    ([token]) => nodes.boolean(asPos(token), { value: token.value === 'true' })
  %} | %identifier {%
    ([token]) => nodes.identifier(asPos(token), { identifier: token.value })
  %} | %stringStart %stringContent:? %stringEnd {%
    ([start, contentEntry, end]) => nodes.string(range(start, end), { uninterpretedValue: contentEntry?.value ?? '' })
  %} | "{" _ deliminated[%identifier _ (type _):? ":" _ expr10 _, "," _, ("," _):?] "}" {%
    ([,, entries, ]) => {
      const content = new Map()
      for (const [identifier, typeEntry,, ,, target] of entries) {
        const [requiredTypeGetter] = typeEntry ?? []
        if (content.has(identifier.value)) {
          throw new tools.SemanticError(`duplicate identifier found in record: ${identifier}`, asPos(identifier))
        }
        content.set(identifier.value, { requiredTypeGetter, target })
      }
      return nodes.record(DUMMY_POS, { content })
    }
  %} | "match" _ expr10 _ ("when" _ pattern10 _ "then" _ expr10 _):+ "end" {%
    ([,, matchValue,, rawMatchArms, ]) => {
      const matchArms = rawMatchArms.map(([,, pattern,, ,, body]) => ({ pattern, body }))
      return nodes.match(DUMMY_POS, { matchValue, matchArms })
    }
  %}

assignmentTarget -> pattern10 {% id %}

pattern10
  -> pattern10 _ "where" _ expr10 {%
    ([pattern,, ,, constraint]) => nodes.assignment.valueConstraint(DUMMY_POS, { assignmentTarget: pattern, constraint })
  %} | pattern20 {% id %}

pattern20
  -> pattern30 _ ">" _ expr10 {%
    ([pattern,, ,, constraint]) => { throw new Error('Not Implemented!') } // Can't be done until comparison type classes are done.
  %} | pattern30 {% id %}

pattern30
  -> %identifier (_ type):? {%
    ([identifier, maybeGetTypeEntry]) => {
      const [, getType] = maybeGetTypeEntry ?? []
      return nodes.assignment.bind(DUMMY_POS, { identifier: identifier.value, getTypeConstraint: getType, identPos: DUMMY_POS, typeConstraintPos: DUMMY_POS })
    }
  %} | "{" _ deliminated[%identifier _ ":" _ pattern10 _, "," _, ("," _):?] "}" {%
    ([leftBracket,, destructureEntries, rightBracket]) => (
      nodes.assignment.destructureObj(range(leftBracket, rightBracket), {
        entries: new Map(destructureEntries.map(([identifier,, ,, target]) => [identifier.value, target]))
      })
    )
  %}

@{%
  const createFnTypeGetter = ({ purity, templateParamDefList, paramTypeGetters, getBodyType }) => (state, pos) => {
    let constraints = []
    for (const { identifier, getConstraint, identPos, constraintPos } of templateParamDefList) {
      const constraint = getConstraint(state, constraintPos).asNewInstance()
      constraints.push(constraint)
      state = state.addToTypeScope(identifier, () => constraint, identPos)
    }
    return tools.types.createFunction({
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
      const typeInfo = state.lookupType(token.value)
      if (!typeInfo) throw new tools.SemanticError(`Type "${token.value}" not found.`, asPos(token))
      return typeInfo.createType().withName(token.value)
    }
  %} | %simpleType {%
    ([token]) => {
      if (token.value === '#unit') return () => tools.types.unit
      else if (token.value === '#int') return () => tools.types.int
      else if (token.value === '#string') return () => tools.types.string
      else if (token.value === '#boolean') return () => tools.types.boolean
      else if (token.value === '#never') return () => tools.types.never
      else if (token.value === '#unknown') return () => tools.types.unknown
      else throw new tools.SemanticError(`Invalid built-in type ${token.value}`, asPos(token))
    }
  %} | "#" "{" _ deliminated[%identifier _ type _, "," _, ("," _):?] "}" {%
    ([, ,, entries, ]) => {
      const content = new Map()
      for (const [identifierToken,, getType] of entries) {
        if (content.has(identifierToken.value)) {
          throw new tools.SemanticError(`This record type definition contains the same key "${identifierToken.value}" multiple times.`, asPos(identifierToken))
        }
        content.set(identifierToken.value, getType)
      }
      return (state, pos) => tools.types.createRecord(tools.mapMapValues(content, getType => getType(state, pos)))
    }
  %} | ("#gets" _ | "#") (templateParamDefList _):? typeList _ "=>" _ type {%
    ([[callModifierToken], templateParamDefListEntry, paramTypeGetters,, ,, getBodyType]) => {
      const purity = callModifierToken.value === '#gets' ? tools.PURITY.gets : tools.PURITY.pure
      const [templateParamDefList] = templateParamDefListEntry ?? [[]]
      return createFnTypeGetter({ purity, templateParamDefList, paramTypeGetters, getBodyType })
    }
  %} | "#function" _ (templateParamDefList _):? typeList _ type {%
    ([,, templateParamDefListEntry, paramTypeGetters,, getBodyType]) => {
      const purity = tools.PURITY.none
      const [templateParamDefList] = templateParamDefListEntry ?? [[]]
      return createFnTypeGetter({ purity, templateParamDefList, paramTypeGetters, getBodyType })
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

templateParamDefList
  -> "<" _ nonEmptyDeliminated[%userType _ (%of _ type _):?, "," _, ("," _):?] ">" {%
    ([,, entries]) => (
      entries.map(([identifier,, typeEntry]) => {
        const [,, getConstraint] = typeEntry ?? [,, () => tools.types.unknown]
        return { identifier: identifier.value, getConstraint, identPos: asPos(identifier), constraintPos: DUMMY_POS }
      })
    )
  %}

ignore -> %impossible:? {% () => null %}

_ -> (%whitespace | %comment | %newLine):* {% () => null %}
