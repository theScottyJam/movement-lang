// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d: any[]): any { return d[0]; }
declare var begin: any;
declare var userType: any;
declare var gets: any;
declare var get: any;
declare var run: any;
declare var number: any;
declare var boolean: any;
declare var stringStart: any;
declare var stringContent: any;
declare var stringEnd: any;
declare var simpleType: any;
declare var of: any;
declare var upperIdentifier: any;
declare var nonUpperIdentifier: any;
declare var impossible: any;
declare var whitespace: any;
declare var comment: any;
declare var newLine: any;

  import * as nodes from './nodes/index.js'
  import moo from 'moo'
  import * as Type from './language/Type.js'
  import * as types from './language/types.js'
  import * as TypeState from './language/TypeState.js'
  import { PURITY } from './language/constants.js'
  import { from as asPos, range } from './language/Position.js'
  import { SemanticError } from './language/exceptions.js'

  const mapMapValues = (map, mapFn) => (
    new Map([...map.entries()].map(([key, value]) => [key, mapFn(value)]))
  )

  const DUMMY_POS = asPos({ line: 1, col: 1, offset: 0, text: '' } as moo.Token) // TODO - get rid of all occurances of this


  const lexer = moo.states({
    main: {
      'comment': /\/\/.*/,
      'whitespace': /[ \t]+/,
      'newLine': {match: '\n', lineBreaks: true},

      'boolean': ['true', 'false'],
      'stringStart': {match: "'", push: 'string'},

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
      '@': '@',

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

      'upperIdentifier': /[A-Z][a-zA-Z0-9]*_*/,
      'nonUpperIdentifier': /[a-z][a-zA-Z0-9]*_*|[0-9][a-zA-Z0-9]*_+/,
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


  const createFnTypeGetter = ({ purity, genericParamDefList, paramTypeGetters, getBodyType }) => (state, pos) => {
    let constraints = []
    for (const { identifier, getConstraint, identPos, constraintPos } of genericParamDefList) {
      const constraint = getConstraint(state, constraintPos).asNewInstance()
      constraints.push(constraint)
      state = state.addToTypeScope(identifier, () => constraint, identPos)
    }
    return types.createFunction({
      paramTypes: paramTypeGetters.map(getType => getType(state, pos)),
      genericParamTypes: constraints,
      bodyType: getBodyType(state, pos),
      purity,
    })
  }

interface NearleyToken {
  value: any;
  [key: string]: any;
};

interface NearleyLexer {
  reset: (chunk: string, info: any) => void;
  next: () => NearleyToken | undefined;
  save: () => any;
  formatError: (token: never) => string;
  has: (tokenType: string) => boolean;
};

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
};

type NearleySymbol = string | { literal: any } | { test: (token: any) => boolean };

interface Grammar {
  Lexer: NearleyLexer | undefined;
  ParserRules: NearleyRule[];
  ParserStart: string;
};

const grammar: Grammar = {
  Lexer: lexer,
  ParserRules: [
    {"name": "root", "symbols": ["_", "module", "_"], "postprocess": 
        ([, module, ]) => nodes.root({ module })
          },
    {"name": "module$macrocall$2", "symbols": ["moduleLevelStatement"]},
    {"name": "module$macrocall$3", "symbols": ["_"]},
    {"name": "module$macrocall$4", "symbols": ["ignore"]},
    {"name": "module$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "module$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["module$macrocall$2", "module$macrocall$3"]},
    {"name": "module$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["module$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "module$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "module$macrocall$1$ebnf$1$subexpression$1", "symbols": ["module$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "module$macrocall$2", "module$macrocall$4"]},
    {"name": "module$macrocall$1$ebnf$1", "symbols": ["module$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "module$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "module$macrocall$1", "symbols": ["module$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "module$ebnf$1$subexpression$1", "symbols": ["_", (lexer.has("begin") ? {type: "begin"} : begin), "_", "block"]},
    {"name": "module$ebnf$1", "symbols": ["module$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "module$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "module", "symbols": ["module$macrocall$1", "module$ebnf$1"], "postprocess": 
        ([statementEntries, beginBlockEntry]) => {
          const [,,, beginBlock] = beginBlockEntry ?? [,,, null]
          const statements = statementEntries.flat()
          return [...statements].reverse().reduce((previousNode, makeNode) => (
            makeNode(previousNode)
          ), beginBlock ? nodes.beginBlock(DUMMY_POS, beginBlock) : nodes.noop())
        }
          },
    {"name": "block$ebnf$1", "symbols": []},
    {"name": "block$ebnf$1$subexpression$1", "symbols": ["statement", "_"]},
    {"name": "block$ebnf$1", "symbols": ["block$ebnf$1", "block$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "block", "symbols": [{"literal":"{"}, "_", "block$ebnf$1", {"literal":"}"}], "postprocess": 
        ([start,, statementEntries, end]) => {
          const statements = statementEntries.map(([statement]) => statement)
          const content = [...statements].reverse().reduce((previousNode, makeNode) => (
            makeNode(previousNode)
          ), nodes.noop())
          return nodes.block(range(start, end), { content })
        }
          },
    {"name": "statement", "symbols": [{"literal":"return"}, "_", "expr10"], "postprocess": 
        ([return_,, expr]) => nextNode => ( // Ignoring nextNode, as nothing can execute after return
          nodes.return_(range(return_, expr.pos), { value: expr })
        )
          },
    {"name": "statement$subexpression$1", "symbols": [{"literal":"get"}]},
    {"name": "statement$subexpression$1", "symbols": [{"literal":"run"}]},
    {"name": "statement", "symbols": ["statement$subexpression$1", "_", "expr80"], "postprocess": 
        ([[callModifier],, invokeExpr]) => nextNode => nodes.sequence([
          nodes.callWithPermissions(range(callModifier, invokeExpr.pos), {
            purity: callModifier.value === 'get' ? PURITY.gets : PURITY.none,
            invokeExpr,
          }),
          nextNode
        ])
          },
    {"name": "statement$ebnf$1", "symbols": []},
    {"name": "statement$ebnf$1$subexpression$1", "symbols": ["_", {"literal":"else"}, "_", {"literal":"if"}, "_", "expr10", "_", "block"]},
    {"name": "statement$ebnf$1", "symbols": ["statement$ebnf$1", "statement$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "statement$ebnf$2$subexpression$1", "symbols": ["_", {"literal":"else"}, "_", "block"]},
    {"name": "statement$ebnf$2", "symbols": ["statement$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "statement$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "statement", "symbols": [{"literal":"if"}, "_", "expr10", "_", "block", "statement$ebnf$1", "statement$ebnf$2"], "postprocess": 
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
          },
    {"name": "statement", "symbols": ["moduleLevelStatement"], "postprocess": id},
    {"name": "moduleLevelStatement", "symbols": [{"literal":"let"}, "_", "assignmentTarget", "_", {"literal":"="}, "_", "expr10"], "postprocess": 
        ([let_,, assignmentTarget,, ,, expr]) => (
          nextNode => nodes.declaration(range(let_, expr.pos), {
            declarations: [{ assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }],
            expr: nextNode,
          })
        )
          },
    {"name": "moduleLevelStatement", "symbols": [{"literal":"print"}, "_", "expr10"], "postprocess": 
        ([print,, r]) => nextNode => nodes.sequence([
          nodes.print(range(print, r.pos), { r }),
          nextNode,
        ])
          },
    {"name": "moduleLevelStatement$ebnf$1$subexpression$1", "symbols": ["genericParamDefList", "_"]},
    {"name": "moduleLevelStatement$ebnf$1", "symbols": ["moduleLevelStatement$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "moduleLevelStatement$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "moduleLevelStatement$ebnf$2$subexpression$1", "symbols": ["type", "_"]},
    {"name": "moduleLevelStatement$ebnf$2", "symbols": ["moduleLevelStatement$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "moduleLevelStatement$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "moduleLevelStatement", "symbols": [{"literal":"function"}, "_", "identifier", "_", "moduleLevelStatement$ebnf$1", "argDefList", "_", "moduleLevelStatement$ebnf$2", "block"], "postprocess": 
        ([function_,, nameToken,, genericDefListEntry, params,, getBodyTypeEntry, body]) => {
          const [genericParamDefList] = genericDefListEntry ?? [[]]
          const [getBodyType] = getBodyTypeEntry ?? [null]
          const fn = nodes.value.function_(DUMMY_POS, { params, body, getBodyType, bodyTypePos: DUMMY_POS, purity: PURITY.none, genericParamDefList })
          const assignmentTarget = nodes.assignmentTarget.bind(DUMMY_POS, { identifier: nameToken.value, getTypeConstraint: null, identPos: asPos(nameToken), typeConstraintPos: DUMMY_POS })
          return nextNode => nodes.declaration(DUMMY_POS, {
            declarations: [{ assignmentTarget, expr: fn, assignmentTargetPos: DUMMY_POS }],
            expr: nextNode
          })
        }
          },
    {"name": "moduleLevelStatement", "symbols": [{"literal":"type"}, "_", {"literal":"alias"}, "_", (lexer.has("userType") ? {type: "userType"} : userType), "_", {"literal":"="}, "_", "type"], "postprocess": 
        ([,, ,, nameToken,, ,, getType]) => (
          nextNode => nodes.typeAlias(DUMMY_POS, { name: nameToken.value, getType, definedWithin: nextNode, typePos: DUMMY_POS })
        )
          },
    {"name": "expr10", "symbols": [{"literal":"print"}, "_", "expr10"], "postprocess": 
        ([print, _, r]) => nodes.print(range(print, r.pos), { r })
          },
    {"name": "expr10$ebnf$1$subexpression$1", "symbols": [{"literal":"let"}, "_", "assignmentTarget", "_", {"literal":"="}, "_", "expr10", "_"]},
    {"name": "expr10$ebnf$1", "symbols": ["expr10$ebnf$1$subexpression$1"]},
    {"name": "expr10$ebnf$1$subexpression$2", "symbols": [{"literal":"let"}, "_", "assignmentTarget", "_", {"literal":"="}, "_", "expr10", "_"]},
    {"name": "expr10$ebnf$1", "symbols": ["expr10$ebnf$1", "expr10$ebnf$1$subexpression$2"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "expr10", "symbols": ["expr10$ebnf$1", {"literal":"in"}, "_", "expr10"], "postprocess": 
        ([declarationEntries, ,, expr]) => {
          const declarations = declarationEntries.map(([,, assignmentTarget,, ,, expr]) => (
            { assignmentTarget, expr, assignmentTargetPos: DUMMY_POS }
          ))
          return nodes.declaration(DUMMY_POS, { declarations, expr })
        }
          },
    {"name": "expr10", "symbols": [{"literal":"if"}, "_", "expr10", "_", {"literal":"then"}, "_", "expr10", "_", {"literal":"else"}, "_", "expr10"], "postprocess": 
        ([if_,, condition,, ,, ifSo,, ,, ifNot]) => nodes.branch(range(if_, ifNot.pos), { condition, ifSo, ifNot })
          },
    {"name": "expr10$ebnf$2$subexpression$1", "symbols": [(lexer.has("gets") ? {type: "gets"} : gets), "_"]},
    {"name": "expr10$ebnf$2", "symbols": ["expr10$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "expr10$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "expr10$ebnf$3$subexpression$1", "symbols": ["genericParamDefList", "_"]},
    {"name": "expr10$ebnf$3", "symbols": ["expr10$ebnf$3$subexpression$1"], "postprocess": id},
    {"name": "expr10$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "expr10$ebnf$4$subexpression$1", "symbols": ["type", "_"]},
    {"name": "expr10$ebnf$4", "symbols": ["expr10$ebnf$4$subexpression$1"], "postprocess": id},
    {"name": "expr10$ebnf$4", "symbols": [], "postprocess": () => null},
    {"name": "expr10", "symbols": ["expr10$ebnf$2", "expr10$ebnf$3", "argDefList", "_", "expr10$ebnf$4", {"literal":"=>"}, "_", "expr10"], "postprocess": 
        ([getsEntry, genericParamDefListEntry, argDefList,, getBodyTypeEntry, ,, body]) => {
          const purity = getsEntry == null ? PURITY.pure : PURITY.gets
          const [genericParamDefList] = genericParamDefListEntry ?? [[]]
          const [getBodyType] = getBodyTypeEntry ?? [null]
          return nodes.value.function_(DUMMY_POS, { params: argDefList, body, getBodyType, bodyTypePos: DUMMY_POS, purity, genericParamDefList })
        }
          },
    {"name": "expr10", "symbols": ["expr20"], "postprocess": id},
    {"name": "expr20", "symbols": ["expr20", "_", {"literal":"=="}, "_", "expr30"], "postprocess": 
        ([l,, ,, r]) => nodes.equals(range(l.pos, r.pos), { l, r })
          },
    {"name": "expr20", "symbols": ["expr20", "_", {"literal":"!="}, "_", "expr30"], "postprocess": 
        ([l,, ,, r]) => nodes.notEqual(range(l.pos, r.pos), { l, r })
          },
    {"name": "expr20", "symbols": ["expr30"], "postprocess": id},
    {"name": "expr30", "symbols": ["expr30", "_", {"literal":"as"}, "_", "type"], "postprocess": 
        ([expr,, ,, getType]) => nodes.typeAssertion(DUMMY_POS, { expr, getType, typePos: DUMMY_POS, operatorAndTypePos: DUMMY_POS })
          },
    {"name": "expr30", "symbols": ["expr40"], "postprocess": id},
    {"name": "expr40", "symbols": ["expr40", "_", {"literal":"+"}, "_", "expr50"], "postprocess": 
        ([l,, ,, r]) => nodes.add(range(l.pos, r.pos), { l, r })
          },
    {"name": "expr40", "symbols": ["expr40", "_", {"literal":"-"}, "_", "expr50"], "postprocess": 
        ([l,, ,, r]) => nodes.subtract(range(l.pos, r.pos), { l, r })
          },
    {"name": "expr40", "symbols": ["expr50"], "postprocess": id},
    {"name": "expr50", "symbols": ["expr50", "_", {"literal":"*"}, "_", "expr60"], "postprocess": 
        ([l,, ,, r]) => nodes.multiply(range(l.pos, r.pos), { l, r })
          },
    {"name": "expr50", "symbols": ["expr60"], "postprocess": id},
    {"name": "expr60", "symbols": ["expr70", "_", {"literal":"**"}, "_", "expr60"], "postprocess": 
        ([l,, ,, r]) => nodes.power(range(l.pos, r.pos), { l, r })
          },
    {"name": "expr60", "symbols": ["expr70"], "postprocess": id},
    {"name": "expr70$subexpression$1", "symbols": [(lexer.has("get") ? {type: "get"} : get)]},
    {"name": "expr70$subexpression$1", "symbols": [(lexer.has("run") ? {type: "run"} : run)]},
    {"name": "expr70", "symbols": ["expr70$subexpression$1", "_", "expr80"], "postprocess": 
        ([[callModifier],, invokeExpr]) => nodes.callWithPermissions(range(callModifier, invokeExpr.pos), {
          purity: callModifier.value === 'get' ? PURITY.gets : PURITY.none,
          invokeExpr,
        })
          },
    {"name": "expr70", "symbols": ["expr80"], "postprocess": id},
    {"name": "expr80$ebnf$1$subexpression$1", "symbols": ["genericParamList", "_"]},
    {"name": "expr80$ebnf$1", "symbols": ["expr80$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "expr80$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr80$macrocall$2", "symbols": ["expr10"]},
    {"name": "expr80$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "expr80$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "expr80$macrocall$4$ebnf$1", "symbols": ["expr80$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "expr80$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr80$macrocall$4", "symbols": ["expr80$macrocall$4$ebnf$1"]},
    {"name": "expr80$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "expr80$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["expr80$macrocall$2", "expr80$macrocall$3"]},
    {"name": "expr80$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["expr80$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "expr80$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "expr80$macrocall$1$ebnf$1$subexpression$1", "symbols": ["expr80$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "expr80$macrocall$2", "expr80$macrocall$4"]},
    {"name": "expr80$macrocall$1$ebnf$1", "symbols": ["expr80$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "expr80$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr80$macrocall$1", "symbols": ["expr80$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "expr80", "symbols": ["expr80", "_", "expr80$ebnf$1", {"literal":"("}, "_", "expr80$macrocall$1", {"literal":")"}], "postprocess": 
        ([fnExpr,, genericParamListEntry, ,, params]) => {
          const [genericParams] = genericParamListEntry ?? [[]]
          return nodes.invoke(DUMMY_POS, { fnExpr, genericParams, params: params.flat() })
        }
          },
    {"name": "expr80", "symbols": ["expr90"], "postprocess": id},
    {"name": "genericParamList$macrocall$2", "symbols": ["type", "_"]},
    {"name": "genericParamList$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "genericParamList$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "genericParamList$macrocall$4$ebnf$1", "symbols": ["genericParamList$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "genericParamList$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "genericParamList$macrocall$4", "symbols": ["genericParamList$macrocall$4$ebnf$1"]},
    {"name": "genericParamList$macrocall$1$ebnf$1", "symbols": []},
    {"name": "genericParamList$macrocall$1$ebnf$1$subexpression$1", "symbols": ["genericParamList$macrocall$2", "genericParamList$macrocall$3"]},
    {"name": "genericParamList$macrocall$1$ebnf$1", "symbols": ["genericParamList$macrocall$1$ebnf$1", "genericParamList$macrocall$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "genericParamList$macrocall$1", "symbols": ["genericParamList$macrocall$1$ebnf$1", "genericParamList$macrocall$2", "genericParamList$macrocall$4"], "postprocess": 
        (data) => {
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "genericParamList", "symbols": [{"literal":"<"}, "_", "genericParamList$macrocall$1", {"literal":">"}], "postprocess": 
        ([,, entries]) => entries.map(([getType]) => ({ getType, loc: DUMMY_POS }))
            },
    {"name": "expr90", "symbols": ["expr90", "_", {"literal":"."}, "_", "identifier"], "postprocess": 
        ([expr,, ,,identifierToken]) => nodes.propertyAccess(range(expr.pos, identifierToken), { l: expr, identifier: identifierToken.value })
          },
    {"name": "expr90", "symbols": ["expr100"], "postprocess": id},
    {"name": "expr100", "symbols": [(lexer.has("number") ? {type: "number"} : number)], "postprocess": 
        ([token]) => nodes.value.int(asPos(token), { value: BigInt(token.value) })
          },
    {"name": "expr100", "symbols": [(lexer.has("boolean") ? {type: "boolean"} : boolean)], "postprocess": 
        ([token]) => nodes.value.boolean(asPos(token), { value: token.value === 'true' })
          },
    {"name": "expr100", "symbols": ["identifier"], "postprocess": 
        ([token]) => nodes.identifier(asPos(token), { identifier: token.value })
          },
    {"name": "expr100$ebnf$1", "symbols": [(lexer.has("stringContent") ? {type: "stringContent"} : stringContent)], "postprocess": id},
    {"name": "expr100$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr100", "symbols": [(lexer.has("stringStart") ? {type: "stringStart"} : stringStart), "expr100$ebnf$1", (lexer.has("stringEnd") ? {type: "stringEnd"} : stringEnd)], "postprocess": 
        ([start, contentEntry, end]) => nodes.value.string(range(start, end), { uninterpretedValue: contentEntry?.value ?? '' })
          },
    {"name": "expr100$macrocall$2$ebnf$1$subexpression$1", "symbols": ["type", "_"]},
    {"name": "expr100$macrocall$2$ebnf$1", "symbols": ["expr100$macrocall$2$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "expr100$macrocall$2$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr100$macrocall$2", "symbols": ["identifier", "_", "expr100$macrocall$2$ebnf$1", {"literal":":"}, "_", "expr10", "_"]},
    {"name": "expr100$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "expr100$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "expr100$macrocall$4$ebnf$1", "symbols": ["expr100$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "expr100$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr100$macrocall$4", "symbols": ["expr100$macrocall$4$ebnf$1"]},
    {"name": "expr100$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "expr100$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["expr100$macrocall$2", "expr100$macrocall$3"]},
    {"name": "expr100$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["expr100$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "expr100$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "expr100$macrocall$1$ebnf$1$subexpression$1", "symbols": ["expr100$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "expr100$macrocall$2", "expr100$macrocall$4"]},
    {"name": "expr100$macrocall$1$ebnf$1", "symbols": ["expr100$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "expr100$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "expr100$macrocall$1", "symbols": ["expr100$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "expr100", "symbols": [{"literal":"{"}, "_", "expr100$macrocall$1", {"literal":"}"}], "postprocess": 
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
          },
    {"name": "expr100$ebnf$2$subexpression$1", "symbols": [{"literal":"when"}, "_", "pattern10", "_", {"literal":"then"}, "_", "expr10", "_"]},
    {"name": "expr100$ebnf$2", "symbols": ["expr100$ebnf$2$subexpression$1"]},
    {"name": "expr100$ebnf$2$subexpression$2", "symbols": [{"literal":"when"}, "_", "pattern10", "_", {"literal":"then"}, "_", "expr10", "_"]},
    {"name": "expr100$ebnf$2", "symbols": ["expr100$ebnf$2", "expr100$ebnf$2$subexpression$2"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "expr100", "symbols": [{"literal":"match"}, "_", "expr10", "_", {"literal":"{"}, "_", "expr100$ebnf$2", {"literal":"}"}], "postprocess": 
        ([,, matchValue,, ,, rawMatchArms, ]) => {
          const matchArms = rawMatchArms.map(([,, pattern,, ,, body]) => ({ pattern, body }))
          return nodes.match(DUMMY_POS, { matchValue, matchArms })
        }
          },
    {"name": "assignmentTarget", "symbols": ["pattern10"], "postprocess": id},
    {"name": "pattern10", "symbols": ["pattern10", "_", {"literal":"where"}, "_", "expr10"], "postprocess": 
        ([pattern,, ,, constraint]) => nodes.assignmentTarget.valueConstraint(DUMMY_POS, { assignmentTarget: pattern, constraint })
          },
    {"name": "pattern10", "symbols": ["pattern20"], "postprocess": id},
    {"name": "pattern20", "symbols": ["pattern30", "_", {"literal":">"}, "_", "expr10"], "postprocess": 
        ([pattern,, ,, constraint]) => { throw new Error('Not Implemented!') } // Can't be done until comparison type classes are done.
          },
    {"name": "pattern20", "symbols": ["pattern30"], "postprocess": id},
    {"name": "pattern30$ebnf$1$subexpression$1", "symbols": ["_", "type"]},
    {"name": "pattern30$ebnf$1", "symbols": ["pattern30$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "pattern30$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "pattern30", "symbols": ["identifier", "pattern30$ebnf$1"], "postprocess": 
        ([identifier, maybeGetTypeEntry]) => {
          const [, getType] = maybeGetTypeEntry ?? []
          return nodes.assignmentTarget.bind(DUMMY_POS, { identifier: identifier.value, getTypeConstraint: getType, identPos: DUMMY_POS, typeConstraintPos: DUMMY_POS })
        }
          },
    {"name": "pattern30$macrocall$2", "symbols": ["identifier", "_", {"literal":":"}, "_", "pattern10", "_"]},
    {"name": "pattern30$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "pattern30$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "pattern30$macrocall$4$ebnf$1", "symbols": ["pattern30$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "pattern30$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "pattern30$macrocall$4", "symbols": ["pattern30$macrocall$4$ebnf$1"]},
    {"name": "pattern30$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "pattern30$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["pattern30$macrocall$2", "pattern30$macrocall$3"]},
    {"name": "pattern30$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["pattern30$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "pattern30$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "pattern30$macrocall$1$ebnf$1$subexpression$1", "symbols": ["pattern30$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "pattern30$macrocall$2", "pattern30$macrocall$4"]},
    {"name": "pattern30$macrocall$1$ebnf$1", "symbols": ["pattern30$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "pattern30$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "pattern30$macrocall$1", "symbols": ["pattern30$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "pattern30", "symbols": [{"literal":"{"}, "_", "pattern30$macrocall$1", {"literal":"}"}], "postprocess": 
        ([leftBracket,, destructureEntries, rightBracket]) => (
          nodes.assignmentTarget.destructureObj(range(leftBracket, rightBracket), {
            entries: new Map(destructureEntries.map(([identifier,, ,, target]) => [identifier.value, target]))
          })
        )
          },
    {"name": "type", "symbols": [(lexer.has("userType") ? {type: "userType"} : userType)], "postprocess": 
        ([token]) => (state, pos) => {
          const typeInfo = TypeState.lookupType(state, token.value)
          if (!typeInfo) throw new SemanticError(`Type "${token.value}" not found.`, asPos(token))
          return Type.withName(typeInfo.createType(), token.value)
        }
          },
    {"name": "type", "symbols": [(lexer.has("simpleType") ? {type: "simpleType"} : simpleType)], "postprocess": 
        ([token]) => {
          if (token.value === '#unit') return () => types.createUnit()
          else if (token.value === '#int') return () => types.createInt()
          else if (token.value === '#string') return () => types.createString()
          else if (token.value === '#boolean') return () => types.createBoolean()
          else if (token.value === '#never') return () => types.createNever()
          else if (token.value === '#unknown') return () => types.createUnknown()
          else throw new SemanticError(`Invalid built-in type ${token.value}`, asPos(token))
        }
          },
    {"name": "type$macrocall$2", "symbols": ["identifier", "_", "type", "_"]},
    {"name": "type$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "type$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "type$macrocall$4$ebnf$1", "symbols": ["type$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "type$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "type$macrocall$4", "symbols": ["type$macrocall$4$ebnf$1"]},
    {"name": "type$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "type$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["type$macrocall$2", "type$macrocall$3"]},
    {"name": "type$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["type$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "type$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "type$macrocall$1$ebnf$1$subexpression$1", "symbols": ["type$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "type$macrocall$2", "type$macrocall$4"]},
    {"name": "type$macrocall$1$ebnf$1", "symbols": ["type$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "type$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "type$macrocall$1", "symbols": ["type$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "type", "symbols": [{"literal":"#"}, {"literal":"{"}, "_", "type$macrocall$1", {"literal":"}"}], "postprocess": 
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
          },
    {"name": "type$subexpression$1", "symbols": [{"literal":"#gets"}, "_"]},
    {"name": "type$subexpression$1", "symbols": [{"literal":"#"}]},
    {"name": "type$ebnf$1$subexpression$1", "symbols": ["genericParamDefList", "_"]},
    {"name": "type$ebnf$1", "symbols": ["type$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "type$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "type", "symbols": ["type$subexpression$1", "type$ebnf$1", "typeList", "_", {"literal":"=>"}, "_", "type"], "postprocess": 
        ([[callModifierToken], genericParamDefListEntry, paramTypeGetters,, ,, getBodyType]) => {
          const purity = callModifierToken.value === '#gets' ? PURITY.gets : PURITY.pure
          const [genericParamDefList] = genericParamDefListEntry ?? [[]]
          return createFnTypeGetter({ purity, genericParamDefList, paramTypeGetters, getBodyType })
        }
          },
    {"name": "type$ebnf$2$subexpression$1", "symbols": ["genericParamDefList", "_"]},
    {"name": "type$ebnf$2", "symbols": ["type$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "type$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "type", "symbols": [{"literal":"#function"}, "_", "type$ebnf$2", "typeList", "_", "type"], "postprocess": 
        ([,, genericParamDefListEntry, paramTypeGetters,, getBodyType]) => {
          const purity = PURITY.none
          const [genericParamDefList] = genericParamDefListEntry ?? [[]]
          return createFnTypeGetter({ purity, genericParamDefList, paramTypeGetters, getBodyType })
        }
          },
    {"name": "typeList$macrocall$2", "symbols": ["type"]},
    {"name": "typeList$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "typeList$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "typeList$macrocall$4$ebnf$1", "symbols": ["typeList$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "typeList$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "typeList$macrocall$4", "symbols": ["typeList$macrocall$4$ebnf$1"]},
    {"name": "typeList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "typeList$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["typeList$macrocall$2", "typeList$macrocall$3"]},
    {"name": "typeList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["typeList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "typeList$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "typeList$macrocall$1$ebnf$1$subexpression$1", "symbols": ["typeList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "typeList$macrocall$2", "typeList$macrocall$4"]},
    {"name": "typeList$macrocall$1$ebnf$1", "symbols": ["typeList$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "typeList$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "typeList$macrocall$1", "symbols": ["typeList$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "typeList", "symbols": [{"literal":"("}, "_", "typeList$macrocall$1", {"literal":")"}], "postprocess": 
        ([,, typeGettersEntry]) => typeGettersEntry.map(([getType]) => getType)
            },
    {"name": "argDefList$macrocall$2", "symbols": ["assignmentTarget"]},
    {"name": "argDefList$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "argDefList$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "argDefList$macrocall$4$ebnf$1", "symbols": ["argDefList$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "argDefList$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "argDefList$macrocall$4", "symbols": ["argDefList$macrocall$4$ebnf$1"]},
    {"name": "argDefList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": []},
    {"name": "argDefList$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1", "symbols": ["argDefList$macrocall$2", "argDefList$macrocall$3"]},
    {"name": "argDefList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "symbols": ["argDefList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "argDefList$macrocall$1$ebnf$1$subexpression$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "argDefList$macrocall$1$ebnf$1$subexpression$1", "symbols": ["argDefList$macrocall$1$ebnf$1$subexpression$1$ebnf$1", "argDefList$macrocall$2", "argDefList$macrocall$4"]},
    {"name": "argDefList$macrocall$1$ebnf$1", "symbols": ["argDefList$macrocall$1$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "argDefList$macrocall$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "argDefList$macrocall$1", "symbols": ["argDefList$macrocall$1$ebnf$1"], "postprocess": 
        ([data]) => {
          if (!data) return []
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "argDefList", "symbols": [{"literal":"("}, "_", "argDefList$macrocall$1", {"literal":")"}], "postprocess": 
        ([,, entries]) => entries.map(([assignmentTarget]) => assignmentTarget)
          },
    {"name": "genericParamDefList$macrocall$2$ebnf$1$subexpression$1", "symbols": [(lexer.has("of") ? {type: "of"} : of), "_", "type", "_"]},
    {"name": "genericParamDefList$macrocall$2$ebnf$1", "symbols": ["genericParamDefList$macrocall$2$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "genericParamDefList$macrocall$2$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "genericParamDefList$macrocall$2", "symbols": [(lexer.has("userType") ? {type: "userType"} : userType), "_", "genericParamDefList$macrocall$2$ebnf$1"]},
    {"name": "genericParamDefList$macrocall$3", "symbols": [{"literal":","}, "_"]},
    {"name": "genericParamDefList$macrocall$4$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "_"]},
    {"name": "genericParamDefList$macrocall$4$ebnf$1", "symbols": ["genericParamDefList$macrocall$4$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "genericParamDefList$macrocall$4$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "genericParamDefList$macrocall$4", "symbols": ["genericParamDefList$macrocall$4$ebnf$1"]},
    {"name": "genericParamDefList$macrocall$1$ebnf$1", "symbols": []},
    {"name": "genericParamDefList$macrocall$1$ebnf$1$subexpression$1", "symbols": ["genericParamDefList$macrocall$2", "genericParamDefList$macrocall$3"]},
    {"name": "genericParamDefList$macrocall$1$ebnf$1", "symbols": ["genericParamDefList$macrocall$1$ebnf$1", "genericParamDefList$macrocall$1$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "genericParamDefList$macrocall$1", "symbols": ["genericParamDefList$macrocall$1$ebnf$1", "genericParamDefList$macrocall$2", "genericParamDefList$macrocall$4"], "postprocess": 
        (data) => {
          const [heads, tailPattern] = data
          const headPatterns = heads.map(([pattern]) => pattern)
          return [...headPatterns, tailPattern]
        }
          },
    {"name": "genericParamDefList", "symbols": [{"literal":"<"}, "_", "genericParamDefList$macrocall$1", {"literal":">"}], "postprocess": 
        ([,, entries]) => (
          entries.map(([identifier,, typeEntry]) => {
            const [,, getConstraint] = typeEntry ?? [,, () => types.createUnknown()]
            return { identifier: identifier.value, getConstraint, identPos: asPos(identifier), constraintPos: DUMMY_POS }
          })
        )
          },
    {"name": "identifier", "symbols": [(lexer.has("upperIdentifier") ? {type: "upperIdentifier"} : upperIdentifier)], "postprocess": id},
    {"name": "identifier", "symbols": [(lexer.has("nonUpperIdentifier") ? {type: "nonUpperIdentifier"} : nonUpperIdentifier)], "postprocess": id},
    {"name": "identifier", "symbols": [{"literal":"$"}], "postprocess": id},
    {"name": "ignore$ebnf$1", "symbols": [(lexer.has("impossible") ? {type: "impossible"} : impossible)], "postprocess": id},
    {"name": "ignore$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "ignore", "symbols": ["ignore$ebnf$1"], "postprocess": () => null},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1$subexpression$1", "symbols": [(lexer.has("whitespace") ? {type: "whitespace"} : whitespace)]},
    {"name": "_$ebnf$1$subexpression$1", "symbols": [(lexer.has("comment") ? {type: "comment"} : comment)]},
    {"name": "_$ebnf$1$subexpression$1", "symbols": [(lexer.has("newLine") ? {type: "newLine"} : newLine)]},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", "_$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": () => null}
  ],
  ParserStart: "root",
};

export default grammar;
