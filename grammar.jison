%{
  /* Notes
  My current understanding of %prec is that it takes any operator within the production and changes it's precedence.
  This means %prec can't just turn terminals into operators, they already have to be operators.

  I also beleive that if multiple operators are found in a production, it just uses the first one for precedence.
  */

  const { nodes } = globalThis.grammarTools // This global must be set before this gets executed.

  const logic = {
    mergeRecordFields({ previousContent, identifier, target, identPos }) {
      if (previousContent.has(identifier)) {
        throw new grammar.SemanticError(`duplicate identifier found in record: ${identifier}`, identPos)
      }
      const content = new Map(previousContent)
      content.set(identifier, target)
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
  }
%}


%lex
%x string
%%

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
"/" return '/'

"==" return '=='
"!=" return '!='
/*
"<=" return '<='
"<" return '<'
">=" return '>='
">" return '>'

*/
"let" return "LET"
"in" return "IN"
"=>" return '=>'
"=" return "="
"." return "."
/*
"and" return 'AND'
"or" return 'OR'
"not" return 'NOT'
"instanceof" return 'INSTANCEOF'
"is" return 'IS'
"=" return '='
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
":" return ':'

"if" return "IF"
"then" return "THEN"
"else" return "ELSE"
"function" return "FUNCTION"

[a-zA-Z][a-zA-Z0-9]* return 'IDENTIFIER'
\#[a-zA-Z][a-zA-Z0-9]* return 'TYPE'

/lex

%left 'IN', '=>', 'PRINT', 'ELSE'
%left '==' '!='
%left '++' '+' '-' // TODO: I can probably just drop ++
%left '*' '/'
%right '**'
%left '('
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
  : module <<EOF>> {
    return nodes.root({ module: $1 })
  }
;

module: moduleInner { {
  $$ = nodes.module(@$, { declarations: $1 })
}};

moduleInner
  : /* empty */ { {
    $$ = []
  }} | moduleInner LET IDENTIFIER '=' expr { {
    const previousContent = $1
    const identifier = $3
    const target = $5
    $$ = [...previousContent, { identifier, target }]
  }} | moduleInner 'FUNCTION' IDENTIFIER argDefList block { {
    const previousContent = $1
    const identifier = $3
    const target = nodes.function(@$, { params: $4, body: $5, })
    $$ = [...previousContent, { identifier, target }]
  }}
;

block: '{' blockInner '}' { {
  $$ = nodes.module(@$, { declarations: $2 })
}};

blockInner
  : /* empty */ { {
    $$ = []
  }} | blockInner LET IDENTIFIER '=' expr { {
    const previousContent = $1
    const identifier = $3
    const target = $5
    $$ = [...previousContent, { identifier, target }]
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
  } | expr '/' expr {
    $$ = nodes['/'](@$, { l: $1, r: $3 })
  } | expr '**' expr {
    $$ = nodes['**'](@$, { l: $1, r: $3 })
  } | expr '.' IDENTIFIER {
    $$ = nodes['.'](@$, { l: $1, identifier: $3 })
  } | letDecleration IN expr {
    $$ = nodes.declaration(@$, { declarations: $1, expr: $3 })
  } | NUMBER {
    $$ = nodes.number(@$, { value: Number(yytext) })
  } | BOOLEAN {
    $$ = nodes.boolean(@$, { value: $1 === 'true' })
  } | STRING_START STRING_CONTENT STRING_END {
    $$ = nodes.string(@$, { value: $2 })
  } | STRING_START STRING_END {
    $$ = nodes.string(@$, { value: '' })
  } | record {
    $$ = $1
  } | argDefList '=>' expr {
    $$ = nodes.function(@$, { params: $1, body: $3, })
  } | expr argList {
    $$ = nodes.invoke(@$, { fnExpr: $1, params: $2, })
  } | IF expr THEN expr ELSE expr {
    $$ = nodes.branch(@$, { condition: $2, ifSo: $4, ifNot: $6, })
  } | IDENTIFIER {
    $$ = nodes.identifier(@$, { identifier: $1 })
  }
;

letDecleration
  : /* Empty */ { {
    $$ = []
  }}
  | letDecleration LET IDENTIFIER '=' expr { {
    const previousDeclarations = $1
    const identifier = $3
    const target = $5

    $$ = [...previousDeclarations, { identifier, target }]
  }}
;

record
  : '{' '}' { {
    $$ = nodes.record(@$, { content: new Map() })
  }} | '{' recordInner IDENTIFIER ':' expr '}' { {
    $$ = nodes.record(@$, {
      content: logic.mergeRecordFields({ previousContent: $2, identifier: $3, target: $5, identPos: @3 })
    })
  }} | '{' recordInner IDENTIFIER ':' expr ',' '}' { {
    $$ = nodes.record(@$, {
      content: logic.mergeRecordFields({ previousContent: $2, identifier: $3, target: $5, identPos: @3 })
    })
  }}
;

recordInner
  : /* empty */ { {
    $$ = new Map()
  }} | recordInner IDENTIFIER ':' expr ',' { {
    $$ = logic.mergeRecordFields({ previousContent: $1, identifier: $2, target: $4, identPos: @2 })
  }}
;

argDefList
  : '(' ')' { {
    $$ = []
  }} | '(' argDefListInner declaration ')' { {
    $$ = [...$2, $3]
  }} | '(' argDefListInner declaration ',' ')' { {
    $$ = [...$2, $3]
  }}
;

argDefListInner
  : /* empty */ { {
    $$ = []
  }} | argDefListInner declaration ',' { {
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

declaration =
  : IDENTIFIER { {
    $$ = { identifier: $1, type: null, pos: @$ }
  }} | IDENTIFIER type { {
    $$ = { identifier: $1, type: $2, pos: @$ }
  }}
;

type = : TYPE ;