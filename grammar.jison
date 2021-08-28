%{
  /* Notes
  My current understanding of %prec is that it takes any operator within the production and changes it's precedence.
  This means %prec can't just turn terminals into operators, they already have to be operators.

  I also beleive that if multiple operators are found in a production, it just uses the first one for precedence.
  */

  const { nodes } = globalThis.grammarTools // This global must be set before this gets executed.
  const { tools } = nodes

  const logic = {
    mergeRecordFields({ previousContent, identifier, target, requiredTypeGetter, identPos }) {
      if (previousContent.has(identifier)) {
        throw new tools.SemanticError(`duplicate identifier found in record: ${identifier}`, identPos)
      }
      const content = new Map(previousContent)
      content.set(identifier, { requiredTypeGetter, target })
      return content
    },
    range: (pos1, pos2) => {
      return {
        first_line: pos1.first_line,
        last_line: pos2.last_line,
        first_column: pos1.first_column,
        last_column: pos2.last_column,
      }
    },
    mapMapValues: (map, mapFn) => (
      new Map([...map.entries()].map(([key, value]) => [key, mapFn(value)]))
    ),
  }
%}


%lex
%x string
%%

\/\/[^\n]*
  /* ignore */

\s+
  /* ignore */

\d+
    return 'NUMBER' // For floats: ((\d*\.\d+)|\d+)("e"\d+)?|"inf"
"true"|"false"
  return 'BOOLEAN'

\'
  this.begin('string'); return 'STRING_START'
<string>(\\.|[^'\n])+
  return 'STRING_CONTENT'
<string>\'
  this.popState(); return 'STRING_END'

"++" return '++'
"+" return '+'
"-" return '-'
"**" return '**'
"*" return '*'

"==" return '=='
"!=" return '!='
/*
"<=" return '<='
"<" return '<'
">=" return '>='
">" return '>'

*/
"let" return 'LET'
"in" return 'IN'
"=>" return '=>'
"=" return "="
"." return "."
/*
"and" return 'AND'
"or" return 'OR'
"not" return 'NOT'
"instanceof" return 'INSTANCEOF'
"is" return 'IS'
*/
"print" return 'PRINT'

"," return ','
/*
"[" return '['
"]" return ']'
*/
"(" return '('
")" return ')'
"{" return '{'
"}" return '}'
"<" return '<'
">" return '>'
":" return ':'

"if" return 'IF'
"then" return 'THEN'
"else" return 'ELSE'
"function" return 'FUNCTION'
"return" return 'RETURN'
"gets" return 'GETS'
"get" return 'GET'
"run" return 'RUN'
"begin" return 'BEGIN'
"type" return 'TYPE'
"alias" return 'ALIAS'
"as" return 'AS'
"of" return 'OF'

[a-zA-Z][a-zA-Z0-9]* return 'IDENTIFIER'
"#gets" return '#gets'
"#function" return '#function'
\#[a-z][a-zA-Z0-9]* return 'SIMPLE_TYPE'
\#[A-Z][a-zA-Z0-9]* return 'USER_TYPE'
"#" return '#'

/lex

%left 'IN', '=>', 'PRINT', 'ELSE'
%left '==' '!='
%left 'AS'
%left '++' '+' '-' // TODO: I can probably just drop ++
%left '*'
%right '**'
%left 'GET', 'RUN'
%left '(' '<'
%left '.'

/*
%left 'PRINT'
%left '=' '+=' '-=' '*=' '/=' '^='
%left 'OR'
%left 'AND'
%left 'NOT'
%left '==' '!=' '<' '<=' '>' '>=' 'INSTANCEOF' 'IS'
%left '+' '-'
%left '*' '/'
%right '^'
%left NEGATE
/* %left '.' * /
%left 'INDEX:['
%left '[' '.'
*/

%start root


%%

root
  : module <<EOF>> { {
    return nodes.root({ module: $1 })
  }}
;

module
  : moduleInner BEGIN block { {
    $$ = [...$1].reverse().reduce((previousNode, makeNode) => (
      makeNode(previousNode)
    ), nodes.beginBlock(@3, $3))
  }} | moduleInner { {
    $$ = [...$1].reverse().reduce((previousNode, makeNode) => (
      makeNode(previousNode)
    ), nodes.noop())
  }}
;

moduleInner
  : /* empty */ { {
    $$ = []
  }} | moduleInner LET assignmentTarget '=' expr { {
    // §vdN99 - This production's content is found exactly the same elsewhere
    const makeNode = nextNode => nodes.declaration(logic.range(@2, @5), {
      declarations: [{ assignmentTarget: $3, target: $5, assignmentTargetPos: @3 }],
      expr: nextNode
    })
    $$ = [...$1, makeNode]
  }} | moduleInner 'FUNCTION' IDENTIFIER argDefList block { {
    // §agIJT - This production's content is found exactly the same elsewhere
    const target = nodes.function(logic.range(@2, @5), { params: $4, body: $5, purity: tools.PURITY.none, templateParamDefList: [] })
    const assignmentTarget = { identifier: $3, getType: null, pos: @3 }
    const makeNode = nextNode => nodes.declaration(logic.range(@2, @5), {
      declarations: [{ assignmentTarget, target, assignmentTargetPos: @3 }],
      expr: nextNode
    })
    $$ = [...$1, makeNode]
  }} | moduleInner 'FUNCTION' IDENTIFIER argDefList type block { {
    // §2F3u5 - This production's content is found exactly the same elsewhere
    const target = nodes.function(logic.range(@2, @6), { params: $4, body: $6, getBodyType: $5, bodyTypePos: @5, purity: tools.PURITY.none, templateParamDefList: [] })
    const assignmentTarget = { identifier: $3, getType: null, pos: @3 }
    const makeNode = nextNode => nodes.declaration(logic.range(@2, @6), {
      declarations: [{ assignmentTarget, target, assignmentTargetPos: @3 }],
      expr: nextNode
    })
    $$ = [...$1, makeNode]
  }} | moduleInner 'PRINT' expr { {
    // §QSVfU - This production's content is found exactly the same elsewhere
    const makeNode = nextNode => nodes.sequence([
      nodes.print(logic.range(@2, @3), { r: $3 }),
      nextNode
    ])
    $$ = [...$1, makeNode]
  }} | moduleInner TYPE ALIAS USER_TYPE '=' type { {
    // §CAW3f - This production's content is found exactly the same elsewhere
    const makeNode = nextNode => (
      nodes.typeAlias(logic.range(@2, @6), { name: $4, getType: $6, definedWithin: nextNode, typePos: @6 })
    )
    $$ = [...$1, makeNode]
  }}
;

block: '{' blockInner '}' { {
  content = [...$2].reverse().reduce((previousNode, makeNode) => (
    makeNode(previousNode)
  ), nodes.noop())
  $$ = nodes.block(@$, { content })
}};

blockInner
  : /* empty */ { {
    $$ = []
  }} | blockInner LET assignmentTarget '=' expr { {
    // §vdN99 - This production's content is found exactly the same elsewhere
    const makeNode = nextNode => nodes.declaration(logic.range(@2, @5), {
      declarations: [{ assignmentTarget: $3, target: $5, assignmentTargetPos: @3 }],
      expr: nextNode
    })
    $$ = [...$1, makeNode]
  }} | blockInner 'FUNCTION' IDENTIFIER argDefList block { {
    // §agIJT - This production's content is found exactly the same elsewhere
    const target = nodes.function(logic.range(@2, @5), { params: $4, body: $5, purity: tools.PURITY.none, templateParamDefList: [] })
    const assignmentTarget = { identifier: $3, getType: null, pos: @3 }
    const makeNode = nextNode => nodes.declaration(logic.range(@2, @5), {
      declarations: [{ assignmentTarget, target, assignmentTargetPos: @3 }],
      expr: nextNode
    })
    $$ = [...$1, makeNode]
  }} | blockInner 'FUNCTION' IDENTIFIER argDefList type block { {
    // §2F3u5 - This production's content is found exactly the same elsewhere
    const target = nodes.function(logic.range(@2, @6), { params: $4, body: $6, getBodyType: $5, bodyTypePos: @5, purity: tools.PURITY.none, templateParamDefList: [] })
    const assignmentTarget = { identifier: $3, getType: null, pos: @3 }
    const makeNode = nextNode => nodes.declaration(logic.range(@2, @6), {
      declarations: [{ assignmentTarget, target, assignmentTargetPos: @3 }],
      expr: nextNode
    })
    $$ = [...$1, makeNode]
  }} | blockInner 'PRINT' expr { {
    // §QSVfU - This production's content is found exactly the same elsewhere
    const makeNode = nextNode => nodes.sequence([
      nodes.print(logic.range(@2, @3), { r: $3 }),
      nextNode
    ])
    $$ = [...$1, makeNode]
  }} | blockInner TYPE ALIAS USER_TYPE '=' type { {
    // §CAW3f - This production's content is found exactly the same elsewhere
    const makeNode = nextNode => (
      nodes.typeAlias(logic.range(@2, @6), { name: $4, getType: $6, definedWithin: nextNode, typePos: @6 })
    )
    $$ = [...$1, makeNode]
  }} | blockInner callModifier expr %prec 'GET' { {
    const makeNode = nextNode => nodes.sequence([
      nodes.callWithPermissions(logic.range(@2, @3), { purity: $2, invokeExpr: $3 }),
      nextNode
    ])
    $$ = [...$1, makeNode]
  }} | blockInner IF expr block elseBranches { {
    const makeNode = nextNode => nodes.sequence([
      nodes.branch(logic.range(@2, @5), { condition: $3, ifSo: $4, ifNot: $5}),
      nextNode
    ])
    $$ = [...$1, makeNode]
  }} | blockInner RETURN expr { {
    const makeNode = nextNode => ( // Ignoring nextNode, as nothing can execute after return
      nodes.return(logic.range(@2, @3), { value: $3 })
    )
    $$ = [...$1, makeNode]
  }}
;

elseBranches
  : /* empty */ { {
    $$ = nodes.noop()
  }} | ELSE IF expr block elseBranches { {
    $$ = nodes.branch(@$, { condition: $3, ifSo: $4, ifNot: $5})
  }} | ELSE block { {
    $$ = $2
  }}
;

expr
  : 'PRINT' expr {
    $$ = nodes.print(@$, { r: $2 })
  } | expr '==' expr {
    $$ = nodes['=='](@$, { l: $1, r: $3 })
  } | expr '!=' expr {
    $$ = nodes['!='](@$, { l: $1, r: $3 })
  } | expr '++' expr {
    $$ = nodes['++'](@$, { l: $1, r: $3 })
  } | expr '+' expr {
    $$ = nodes['+'](@$, { l: $1, r: $3 })
  } | expr '-' expr {
    $$ = nodes['-'](@$, { l: $1, r: $3 })
  } | expr '*' expr {
    $$ = nodes['*'](@$, { l: $1, r: $3 })
  } | expr '**' expr {
    $$ = nodes['**'](@$, { l: $1, r: $3 })
  } | expr '.' IDENTIFIER {
    $$ = nodes['.'](@$, { l: $1, identifier: $3 })
  } | expr AS type {
    $$ = nodes.typeAssertion(@$, { expr: $1, getType: $3, typePos: @3, operatorAndTypePos: logic.range(@2, @3) })
  } | letDecleration IN expr {
    $$ = nodes.declaration(@$, { declarations: $1, expr: $3 })
  } | NUMBER {
    $$ = nodes.number(@$, { value: Number(yytext) })
  } | BOOLEAN {
    $$ = nodes.boolean(@$, { value: $1 === 'true' })
  } | STRING_START STRING_CONTENT STRING_END {
    $$ = nodes.string(@$, { uninterpretedValue: $2 })
  } | STRING_START STRING_END {
    $$ = nodes.string(@$, { uninterpretedValue: '' })
  } | record {
    $$ = $1
  } | argDefList '=>' expr {
    $$ = nodes.function(@$, { params: $1, body: $3, getBodyType: null, bodyTypePos: null, purity: tools.PURITY.pure, templateParamDefList: [] })
  } | GETS argDefList '=>' expr {
    $$ = nodes.function(@$, { params: $2, body: $4, getBodyType: null, bodyTypePos: null, purity: tools.PURITY.gets, templateParamDefList: [] })
  } | argDefList type '=>' expr {
    $$ = nodes.function(@$, { params: $1, body: $4, getBodyType: $2, bodyTypePos: @2, purity: tools.PURITY.pure, templateParamDefList: [] })
  } | GETS argDefList type '=>' expr {
    $$ = nodes.function(@$, { params: $2, body: $5, getBodyType: $3, bodyTypePos: @3, purity: tools.PURITY.gets, templateParamDefList: [] })
  } | templateParamDefList argDefList '=>' expr {
    // TODO: Allow template params on all types of functions
    $$ = nodes.function(@$, { params: $2, body: $4, getBodyType: null, bodyTypePos: null, purity: tools.PURITY.pure, templateParamDefList: $1 })
  } | templateParamDefList argDefList type '=>' expr {
    // TODO: Allow template params on all types of functions
    $$ = nodes.function(@$, { params: $2, body: $5, getBodyType: $3, bodyTypePos: @3, purity: tools.PURITY.pure, templateParamDefList: $1 })
  } | expr argList {
    $$ = nodes.invoke(@$, { fnExpr: $1, templateParams: [], params: $2 })
  } | expr templateParamList argList {
    $$ = nodes.invoke(@$, { fnExpr: $1, templateParams: $2, params: $3 })
  } | callModifier expr %prec 'GET' {
    $$ = nodes.callWithPermissions(@$, { purity: $1, invokeExpr: $2 })
  } | IF expr THEN expr ELSE expr {
    $$ = nodes.branch(@$, { condition: $2, ifSo: $4, ifNot: $6 })
  } | IDENTIFIER {
    $$ = nodes.identifier(@$, { identifier: $1 })
  }
;

letDecleration
  : /* Empty */ { {
    $$ = []
  }}
  | letDecleration LET assignmentTarget '=' expr { {
    $$ = [...$1, { assignmentTarget: $3, target: $5, assignmentTargetPos: @3 }]
  }}
;

record
  : '{' '}' { {
    $$ = nodes.record(@$, { content: new Map() })
  }} | '{' recordInner IDENTIFIER ':' expr '}' { {
    $$ = nodes.record(@$, {
      content: logic.mergeRecordFields({ previousContent: $2, identifier: $3, target: $5, requiredTypeGetter: null, typeGetterPos: null, identPos: @3 })
    })
  }} | '{' recordInner IDENTIFIER ':' expr ',' '}' { {
    $$ = nodes.record(@$, {
      content: logic.mergeRecordFields({ previousContent: $2, identifier: $3, target: $5, requiredTypeGetter: null, typeGetterPos: null, identPos: @3 })
    })
  }} | '{' recordInner IDENTIFIER type ':' expr '}' { {
    $$ = nodes.record(@$, {
      content: logic.mergeRecordFields({ previousContent: $2, identifier: $3, target: $6, requiredTypeGetter: $4, typeGetterPos: @4, identPos: @3 })
    })
  }} | '{' recordInner IDENTIFIER type ':' expr ',' '}' { {
    $$ = nodes.record(@$, {
      content: logic.mergeRecordFields({ previousContent: $2, identifier: $3, target: $6, requiredTypeGetter: $4, typeGetterPos: @4, identPos: @3 })
    })
  }}
;

recordInner
  : /* empty */ { {
    $$ = new Map()
  }} | recordInner IDENTIFIER ':' expr ',' { {
    $$ = logic.mergeRecordFields({ previousContent: $1, identifier: $2, target: $4, requiredTypeGetter: null, identPos: @2 })
  }} | recordInner IDENTIFIER type ':' expr ',' { {
    $$ = logic.mergeRecordFields({ previousContent: $1, identifier: $2, target: $5, requiredTypeGetter: $3, identPos: @2 })
  }}
;

templateParamDefList
  : '<' templateParamDefListInner templateParamDef '>' { {
    $$ = [...$2, $3]
  }} | '<' templateParamDefListInner templateParamDef ',' '>' { {
    $$ = [...$2, $3]
  }}
;

templateParamDefListInner
  : /* empty */ { {
    $$ = []
  }} | templateParamDefListInner templateParamDef ',' { {
    $$ = [...$1, $2]
  }}
;

templateParamDef
  : USER_TYPE { {
    $$ = { identifier: $1, getConstraint: () => tools.types.unknown, identPos: @1, constraintPos: @$ }
  }} | USER_TYPE OF type { {
    $$ = { identifier: $1, getConstraint: $3, identPos: @1, constraintPos: @3 }
  }}
;

templateParamList
  : '<' templateParamListInner type '>' { {
    $$ = [...$2, { getType: $3, loc: @3 }]
  }} | '<' templateParamListInner type ',' '>' { {
    $$ = [...$2, { getType: $3, loc: @3 }]
  }}
;

templateParamListInner
  : /* empty */ { {
    $$ = []
  }} | templateParamListInner type ',' { {
    $$ = [...$1, { getType: $2, loc: @2 }]
  }}
;

argDefList
  : '(' ')' { {
    $$ = []
  }} | '(' argDefListInner assignmentTarget ')' { {
    $$ = [...$2, $3]
  }} | '(' argDefListInner assignmentTarget ',' ')' { {
    $$ = [...$2, $3]
  }}
;

argDefListInner
  : /* empty */ { {
    $$ = []
  }} | argDefListInner assignmentTarget ',' { {
    $$ = [...$1, $2]
  }}
;

argList
  : '(' ')' { {
    $$ = []
  }} | '(' argListInner expr ')' { {
    $$ = [...$2, $3]
  }} | '(' argListInner expr ',' ')' { {
    $$ = [...$2, $3]
  }}
;

argListInner
  : /* empty */ { {
    $$ = []
  }} | argListInner expr ',' { {
    $$ = [...$1, $2]
  }}
;

assignmentTarget =
  : IDENTIFIER { {
    $$ = { identifier: $1, getType: null, pos: @$ }
  }} | IDENTIFIER type { {
    $$ = { identifier: $1, getType: $2, pos: @$ }
  }}
;

callModifier =
  : GET { {
    $$ = tools.PURITY.gets
  }} | RUN { {
    $$ = tools.PURITY.none
  }}
;

type =
  : USER_TYPE { {
    const typeName = $1
    $$ = (state, pos) => {
      const typeInfo = state.lookupType(typeName)
      if (!typeInfo) throw new tools.SemanticError(`Type "${typeName}" not found.`, @1)
      return typeInfo.createType().withName(typeName)
    }
  }} | SIMPLE_TYPE { {
    const typeStr = $1
    const typeStrPos = @1
    if (typeStr === '#unit') $$ = () => tools.types.unit
    else if (typeStr === '#int') $$ = () => tools.types.int
    else if (typeStr === '#string') $$ = () => tools.types.string
    else if (typeStr === '#boolean') $$ = () => tools.types.boolean
    else if (typeStr === '#never') $$ = () => tools.types.never
    else if (typeStr === '#unknown') $$ = () => tools.types.unknown
    else throw new tools.SemanticError(`Invalid built-in type ${typeStr}`, typeStrPos)
  }} | '#' '(' typeList ')' '=>' type { {
    $$ = (state, pos) => tools.types.createFunction({
      paramTypes: $3.map(getType => getType(state, pos)),
      genericParamTypes: [],
      bodyType: $6(state, pos),
      purity: tools.PURITY.pure,
    })
  }} | '#' templateParamDefList '(' typeList ')' '=>' type { {
    // TODO: Make the other versions of template-param types too
    $$ = (state, pos) => {
      let constraints = []
      for (const { identifier, getConstraint, identPos, constraintPos } of $2) {
        const constraint = getConstraint(state, constraintPos).asNewInstance()
        constraints.push(constraint)
        state = state.addToTypeScope(identifier, () => constraint, identPos)
      }
      return tools.types.createFunction({
        paramTypes: $4.map(getType => getType(state, pos)),
        genericParamTypes: constraints,
        bodyType: $7(state, pos),
        purity: tools.PURITY.pure,
      })
    }
  }} | '#gets' '(' typeList ')' '=>' type { {
    $$ = (state, pos) => tools.types.createFunction({
      paramTypes: $3.map(getType => getType(state, pos)),
      genericParamTypes: [],
      bodyType: $6(state, pos),
      purity: tools.PURITY.gets,
    })
  }} | '#function' '(' typeList ')' type { {
    $$ = (state, pos) => tools.types.createFunction({
      paramTypes: $3.map(getType => getType(state, pos)),
      genericParamTypes: [],
      bodyType: $5(state, pos),
      purity: tools.PURITY.none,
    })
  }} | '#' '{' recordContentType '}' { {
    $$ = $3
  }}
;

typeList =
  : /* empty */ { {
    $$ = []
  }} | typeListInner { {
    $$ = $1
  }} | typeListInner ',' { {
    $$ = $1
  }}
;

typeListInner =
  : type { {
    $$ = [$1]
  }} | typeListInner ',' type { {
    $$ = [...$1, $3]
  }}
;

recordContentType =
  : /* empty */ { {
    $$ = () => tools.types.createRecord(new Map())
  }} | recordContentTypeInner { {
    $$ = (state, pos) => tools.types.createRecord(logic.mapMapValues($1, getType => getType(state, pos)))
  }} | recordContentTypeInner ',' { {
    $$ = (state, pos) => tools.types.createRecord(logic.mapMapValues($1, getType => getType(state, pos)))
  }}
;

recordContentTypeInner =
  : IDENTIFIER type { {
    $$ = new Map([[$1, $2]])
  }} | recordContentTypeInner ',' IDENTIFIER type { {
    const previous = $1
    const identifier = $3
    const getType = $4
    if (previous.has(identifier)) throw new tools.SemanticError(`This record type definition contains the same key "${identifier}" multiple times.`, @3)
    $$ = new Map(previous)
    $$.set(identifier, getType)
  }}
;