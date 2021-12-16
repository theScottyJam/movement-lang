import { customTestRun, errorCodeOf } from './util'

//
// Literals
//

test('It creates an integer', () => {
  expect(customTestRun('print 2')[0].raw).toBe(2n)
})

test('It creates a boolean', () => {
  expect(customTestRun('print true')[0].raw).toBe(true)
})

test('It creates a string', () => {
  expect(customTestRun("print 'abc'")[0].raw).toBe('abc')
})

test('It creates an empty string', () => {
  expect(customTestRun("print ''")[0].raw).toBe('')
})

test('It creates a string with valid escape sequences', () => {
  expect(customTestRun(String.raw`print 'x\n\r\t\\\'\"\0'`)[0].raw).toBe('x\n\r\t\\\'\"\0')
})

test('It throws on an invalid escape sequence', () => {
  expect(() => customTestRun(String.raw`print 'x \a'`)[0].raw).toThrow('x \\a')
})

test('It creates a record', () => {
  const map = customTestRun(`print { x: false, y: 'test', z: 2, w: {}, v: { a: 1 } }`)[0].raw
  expect(map.get('x').raw).toBe(false)
  expect(map.get('y').raw).toBe('test')
  expect(map.get('z').raw).toBe(2n)
  expect(map.size).toBe(5)
  expect(map.get('w').raw.size).toBe(0)
  expect(map.get('v').raw.get('a').raw).toBe(1n)
})

//
// Main syntax
//

test('It adds', () => {
  expect(customTestRun('print 2 + 3')[0].raw).toBe(5n)
})

test('It subtracts', () => {
  expect(customTestRun('print 2 - 3')[0].raw).toBe(-1n)
})

test('It multiplies', () => {
  expect(customTestRun('print 2 * 3')[0].raw).toBe(6n)
})

test('Power-of operator', () => {
  expect(customTestRun('print 2 ** 3')[0].raw).toBe(8n)
})

test('Equals operator', () => {
  expect(customTestRun('print 2 == 2')[0].raw).toBe(true)
  expect(customTestRun('print 2 == 3')[0].raw).toBe(false)
})

test('Not-equals operator', () => {
  expect(customTestRun('print 2 != 2')[0].raw).toBe(false)
  expect(customTestRun('print 2 != 3')[0].raw).toBe(true)
})

test('Property access', () => {
  expect(customTestRun('let record = { a: 2, b: true }; print record.a')[0].raw).toBe(2n)
  expect(customTestRun('let record = { a: 2, b: true }; print record.b')[0].raw).toBe(true)
})

test('Expression-if', () => {
  expect(customTestRun('print if 2 == 2 then 4 else 5')[0].raw).toBe(4n)
  expect(customTestRun('print if 2 != 2 then 4 else 5')[0].raw).toBe(5n)
})

test('Nested expression-if', () => {
  expect(customTestRun('print if true then 4 else if true then 5 else 6')[0].raw).toBe(4n)
  expect(customTestRun('print if true then 4 else if false then 5 else 6')[0].raw).toBe(4n)
  expect(customTestRun('print if false then 4 else if true then 5 else 6')[0].raw).toBe(5n)
  expect(customTestRun('print if false then 4 else if false then 5 else 6')[0].raw).toBe(6n)
})

test('Statement-if', () => {
  expect(customTestRun('begin { if 2 == 2 { print 4 } }')[0].raw).toBe(4n)
  expect(customTestRun('begin { if 2 != 2 { print 4 } }').length).toBe(0)
  expect(customTestRun('begin { if 2 == 2 { print 4 } else { print 5 } }')[0].raw).toBe(4n)
  expect(customTestRun('begin { if 2 != 2 { print 4 } else { print 5 } }')[0].raw).toBe(5n)
})

test('Nested statement-if', () => {
  expect(customTestRun('begin { if true { print 4 } else if true { print 5 } else { print 6 } }')[0].raw).toBe(4n)
  expect(customTestRun('begin { if true { print 4 } else if false { print 5 } else { print 6 } }')[0].raw).toBe(4n)
  expect(customTestRun('begin { if false { print 4 } else if true { print 5 } else { print 6 } }')[0].raw).toBe(5n)
  expect(customTestRun('begin { if false { print 4 } else if false { print 5 } else { print 6 } }')[0].raw).toBe(6n)
  expect(customTestRun('begin { if true { print 4 } else if true { print 5 } }')[0].raw).toBe(4n)
  expect(customTestRun('begin { if false { print 4 } else if false { print 5 } }').length).toBe(0)
})

test('Expression-declarations', () => {
  expect(customTestRun('print let x = 2 let y = 3 in x + y')[0].raw).toBe(5n)
})

test('Statement-declarations', () => {
  expect(customTestRun('begin { let x = 2; let y = 3; print x + y }')[0].raw).toBe(5n)
})

test('Module-level declarations', () => {
  expect(customTestRun('let x = 2; let y = 3; print x + y')[0].raw).toBe(5n)
})

test('Module-level declarations can be accessed in begin block', () => {
  expect(customTestRun('let x = 2; begin { print x }')[0].raw).toBe(2n)
})

//
// Assignment
//

test('Module-level declarations can be constrained by conditions via "where"', () => {
  expect(customTestRun('let y where y == 4 = 2 + 2; print y')[0].raw).toBe(4n)
  expect(errorCodeOf(() => customTestRun('let y where y != 4 = 2 + 2; print y'))).toBe('failedValueConstraint')
})

test('Expression declarations can be constrained by conditions via "where"', () => {
  expect(customTestRun('print let y where y == 4 = 2 + 2 in y')[0].raw).toBe(4n)
  expect(errorCodeOf(() => customTestRun('print let y where y != 4 = 2 + 2 in y'))).toBe('failedValueConstraint')
})

test('Destructuring', () => {
  expect(customTestRun('let { x: x_ } = { x: 2 }; print x_')[0].raw).toBe(2n)
  expect(customTestRun('let { x: x_, y: y_ } = { x: 2, y: 3 }; print x_ + y_')[0].raw).toBe(5n)
  expect(customTestRun('let { x: x_ } = { x: 2, y: 3 }; print x_')[0].raw).toBe(2n)
  expect(customTestRun('let { x: x_ } = { x: { y: 2 } }; print x_.y')[0].raw).toBe(2n)
  expect(customTestRun('let { x: x_, y: { z: z_ } } = { x: 2, y: { z: 3 } }; print x_ + z_')[0].raw).toBe(5n)
})

test('Destructuring with constraints', () => {
  expect(customTestRun('let { x: x_ where x_ == 2 } = { x: 2 }; print x_')[0].raw).toBe(2n)
  expect(errorCodeOf(() => customTestRun('let { x: x_ where x_ != 2 } = { x: 2 }; print x_'))).toBe('failedValueConstraint')
  expect(customTestRun('let { x: x_ where x_ == 2, y: y_ where x_ == y_ } = { x: 2, y: 2 }; print x_ + y_')[0].raw).toBe(4n)
  expect(errorCodeOf(() => customTestRun('let { x: x_ where x_ == 2, y: y_ where x_ != y_ } = { x: 2, y: 2 }; print x_ + y_'))).toBe('failedValueConstraint')
  expect(customTestRun('let { x: x_ } where x_ == 2 = { x: 2 }; print x_')[0].raw).toBe(2n)
})

test('Duplicate assignment is disallowed', () => {
  expect(() => customTestRun('let x = 2; let x = 3'))
    .toThrow('Identifier "x" already exists in scope, please choose a different name.')
  expect(() => customTestRun('begin { let x = 2; let x = 3 }'))
    .toThrow('Identifier "x" already exists in scope, please choose a different name.')
  expect(() => customTestRun('print let x = 2 let x = 3 in x'))
    .toThrow('Identifier "x" already exists in scope, please choose a different name.')
})

test('Shadowing is allowed', () => {
  expect(customTestRun('let x = 2; begin { let x = 3; print x }')[0].raw).toBe(3n)
  expect(customTestRun('begin { let x = 3; if true { let x = 2; print x } }')[0].raw).toBe(2n)
  expect(customTestRun('let x = 2; print let x = 3 in x')[0].raw).toBe(3n)
  expect(customTestRun('let x = 2; let fn = (x #int) => x; print fn(3)')[0].raw).toBe(3n)
  expect(customTestRun('let x = 2; function fn() { let x = 3; return x } begin { print run fn() }')[0].raw).toBe(3n)
})

test('"$" can be reassigned', () => {
  expect(customTestRun('let $ = 2; let $ = 3').length).toBe(0)
  expect(customTestRun('begin { let $ = 2; let $ = 3 }').length).toBe(0)
  expect(customTestRun('print let $ = 2 let $ = 3 in 2')[0].raw).toBe(2n)
})

test('"$" can not be accessed', () => {
  expect(() => customTestRun('let $ = 2; print $'))
    .toThrow('Attempted to access undefined variable $')
})

//
// Functions
//

test('No parameter function', () => {
  expect(customTestRun('let fn = () => 2; print fn()')[0].raw).toBe(2n)
})

test('Function with parameters', () => {
  expect(customTestRun('let fn = (x #int, y #int) => x + y; print fn(2, 3)')[0].raw).toBe(5n)
})

test('Calling with correct purity levels', () => {
  expect(customTestRun('let fn = () => 2; begin { print fn() }')[0].raw).toBe(2n)
  expect(() => customTestRun('let fn = () => 2; begin { print get fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must not use any purity annotations')
  expect(() => customTestRun('let fn = () => 2; begin { print run fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must not use any purity annotations')
  expect(() => customTestRun('let fn = gets () => 2; begin { print fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "get"')
  expect(customTestRun('let fn = gets () => 2; begin { print get fn() }')[0].raw).toBe(2n)
  expect(() => customTestRun('let fn = gets () => 2; begin { print run fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "get"')
  expect(() => customTestRun('function fn() { return 2 }; begin { print fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "run"')
  expect(() => customTestRun('function fn() { return 2 }; begin { print get fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "run"')
  expect(customTestRun('function fn() { return 2 }; begin { print run fn() }')[0].raw).toBe(2n)
})

test('Using a purity annotation in an incorrect location', () => {
  expect(() => customTestRun('let fn = gets () => 2; print get fn()'))
    .toThrow('Attempted to call a function which was less pure than its containing environment.')
  expect(() => customTestRun('let fn = gets () => 2; let fn2 = () => get fn()'))
    .toThrow('Attempted to call a function which was less pure than its containing environment.')
  expect(() => customTestRun('function fn() { return 2 }; let fn2 = () => run fn()'))
    .toThrow('Attempted to call a function which was less pure than its containing environment.')
  expect(() => customTestRun('function fn() { return 2 }; let fn2 = gets () => run fn()'))
    .toThrow('Attempted to call a function which was less pure than its containing environment.')
})

//
// Scoping
//

test('Unable to access variables outside of block scope', () => {
  expect(() => customTestRun('begin { if true { let x = 2 }; print x }'))
    .toThrow('Attempted to access undefined variable x')
  expect(() => customTestRun('begin { if false { let x = 2 }; print x }'))
    .toThrow('Attempted to access undefined variable x')
})

test('Unable to access variables outside of expression-let scope', () => {
  expect(() => customTestRun('let result = let x = 2 in x print x'))
    .toThrow('Attempted to access undefined variable x')
})

test('Unable to access variables outside of function scope', () => {
  expect(() => customTestRun('function fn() { let x = 2 } begin { run fn() print x }'))
    .toThrow('Attempted to access undefined variable x')
  expect(() => customTestRun('function fn() { let x = 2 } print x'))
    .toThrow('Attempted to access undefined variable x')
})

test('Able to close over variables', () => {
  expect(customTestRun('let fn = let x = 2 in () => x; print fn()')[0].raw).toBe(2n)
  const results = customTestRun(`
    let x = 10 // Should not get used
    function makeFn(x #int) {
      let y = x + 1
      let notClosedOver = y * 2
      {
        let z = y + 1
        let alsoNotClosedOver = z * 2
        return () => x + y + z
      }
      return () => 0 // Won't execute
    }
    begin {
      let fn2 = run makeFn(2)
      let fn3 = run makeFn(3)
      print fn2()
      print fn3()
    }
  `)
  expect(results[0].raw).toBe(9n)
  expect(results[1].raw).toBe(12n)
})

//
// Types
//

test('Can assign to correct primitive type declarations', () => {
  expect(customTestRun('let x #int = 2; print x')[0].raw).toBe(2n)
  expect(customTestRun('let x #boolean = true; print x')[0].raw).toBe(true)
  expect(customTestRun("let x #string = 'abc'; print x")[0].raw).toBe('abc')
})

test('Can not assign to incorrect primitive type declarations', () => {
  expect(() => customTestRun('let x #boolean = 2; print x')).toThrow('Found type "#int", but expected type "#boolean"')
  expect(() => customTestRun('let x #string = true; print x')).toThrow('Found type "#boolean", but expected type "#string"')
  expect(() => customTestRun("let x #int = 'abc'; print x")).toThrow('Found type "#string", but expected type "#int"')
})

test('Record types', () => {
  expect(customTestRun('let x #{ x #int } = { x: 2 }').length).toBe(0)
  expect(customTestRun('let x #{ x #int } = { x: 2, y: 3 }').length).toBe(0)
  expect(() => customTestRun('let x #{ x #int, y #int } = { x: 2 }'))
    .toThrow('Found type "#{ x #int }", but expected type "#{ x #int, y #int }".')
})

test('core function types', () => {
  expect(customTestRun('let fn #(#int) => #int = (x #int) => x').length).toBe(0)
  expect(() => customTestRun('let fn #() => #int = (x #int) => x'))
    .toThrow('Found type "#(#int) => #int", but expected type "#() => #int".')
  expect(() => customTestRun('let fn #(#int, #int) => #int = (x #int) => x'))
    .toThrow('Found type "#(#int) => #int", but expected type "#(#int, #int) => #int".')
  expect(() => customTestRun('let fn #(#int) => #string = (x #int) => x'))
    .toThrow('Found type "#(#int) => #int", but expected type "#(#int) => #string".')
  expect(customTestRun('let fn #() => #{ x #int } = () => { x: 2, y: 3 }').length).toBe(0)
  expect(() => customTestRun('let fn #() => #{ x #int, y #int } = () => { x: 2 }'))
    .toThrow('Found type "#() => #{ x #int }", but expected type "#() => #{ x #int, y #int }".')
  expect(customTestRun('let fn #(#{ x #int, y #int }) => #int = (x #{ x #int }) => 2').length).toBe(0)
  expect(() => customTestRun('let fn #(#{ x #int }) => #int = (x #{ x #int, y #int }) => 2').length).toThrow('Found type "#(#{ x #int, y #int }) => #int", but expected type "#(#{ x #int }) => #int".')
})

test('function type purity', () => {
  expect(customTestRun('let fn #() => #int = () => 2').length).toBe(0)
  expect(customTestRun('let fn #gets () => #int = () => 2').length).toBe(0)
  expect(customTestRun('let fn #function() #int = () => 2').length).toBe(0)

  expect(() => customTestRun('let fn #() => #int = gets () => 2'))
    .toThrow('Found type "#gets () => #int", but expected type "#() => #int".')
  expect(customTestRun('let fn #gets () => #int = gets () => 2').length).toBe(0)
  expect(customTestRun('let fn #function() #int = gets () => 2').length).toBe(0)

  expect(() => customTestRun('function fn() {}; let fn2 #() => #unit = fn'))
    .toThrow('Found type "#function() #unit", but expected type "#() => #unit".')
  expect(() => customTestRun('function fn() {}; let fn2 #gets () => #unit = fn'))
    .toThrow('Found type "#function() #unit", but expected type "#gets () => #unit".')
  expect(customTestRun('function fn() {}; let fn2 #function() #unit = fn').length).toBe(0)
})

test('Calling with correct purity annotations depends on current type, not underlying type', () => {
  expect(customTestRun('let fn #gets () => #int = () => 2; begin { print get fn() }')[0].raw).toBe(2n)
  expect(() => customTestRun('let fn #gets () => #int = () => 2; begin { print fn() }'))
    .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "get"')
})

it('Each return must provide compatible types.', () => {
  expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { x: 3 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
  expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { x: 3, y: 2 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
  expect(customTestRun('function fn() {}; _printType fn')[0]).toBe('#function() #unit')
  // Handling never types
  expect(customTestRun('function fn(cb #()=>#never) { return cb() }; _printType fn')[0]).toBe('#function(#() => #never) #never')
  expect(customTestRun('function fn(cb #function()#never) { run cb() }; _printType fn')[0]).toBe('#function(#function() #never) #never')

  expect(() => customTestRun('function fn() { if true { return { x: 2 } } else { return { y: 2 } } }; _printType fn'))
    .toThrow('Failed to find a common type among the possible return types of this function.')
  expect(() => customTestRun("function fn() { if true { return { x: 2 } } else { return { x: 'string' } } }; _printType fn"))
    .toThrow('Failed to find a common type among the possible return types of this function.')
  expect(() => customTestRun("function fn() { if true { return 2 } else { return 'string' } }; _printType fn")[0])
    .toThrow('Failed to find a common type among the possible return types of this function.')
  
  // Three returns
  expect(() => customTestRun('function fn() { if true { return { x: 2 } } else if true { return { y: 2 } } else { return { x: 3, y: 3 } } }; _printType fn'))
    .toThrow('Failed to find a common type among the possible return types of this function.')
  expect(customTestRun('function fn(cb #()=>#never) { if true { return cb() } else { return { x: 2 } } }; _printType fn')[0]).toBe('#function(#() => #never) #{ x #int }')
  expect(() => customTestRun('function fn(cb #()=>#never) { if true { return cb() } else if true { return { x: 2 } } else { return { y: 2 } } }; _printType fn'))
    .toThrow('Failed to find a common type among the possible return types of this function.')
  expect(customTestRun('function fn() { if true { return { x: 2 } } else if true { return { x: 2, y: 2 } } else { return { x: 2, z: 3 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
  expect(customTestRun('function fn() { if true { return { x: 2, z: 3 } } else if true { return { x: 2, y: 2 } } else { return { x: 2 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
})

test('Assignment can not be used to widen types', () => {
  expect(() => customTestRun('let x #{ x #int } = { x: 2 } as #{}'))
    .toThrow('Found type "#{}", but expected type "#{ x #int }".')
})

test('"as" operator', () => {
  expect(customTestRun('let obj = { x: 2 } as #{}').length).toBe(0)
  expect(() => customTestRun('let obj = { x: 2 } as #{ x #int, y #int }').length)
    .toThrow('"as" type assertion failed - failed to convert a type from "#{ x #int }" to #{ x #int, y #int }')
  expect(() => customTestRun('let obj = { x: 2 } as #{ y #int }').length)
    .toThrow('Attempted to change a type from "#{ x #int }" to type "#{ y #int }". "as" type assertions can only widen or narrow a provided type.')
  expect(() => customTestRun('let obj = { x: 2 } as #int').length)
  .toThrow('Attempted to change a type from "#{ x #int }" to type "#int". "as" type assertions can only widen or narrow a provided type.')
  expect(() => customTestRun('let obj = { x: 2, y: 3 } as #{ x #int }; print obj.y'))
    .toThrow('Failed to find the identifier "y" on the record of type #{ x #int }.')
  expect(customTestRun('let obj1 #{ x #int } = { x: 2, y: 3 }; let obj2 = obj1 as #{ x #int, y #int }; print obj2.y')[0].raw).toBe(3n)
  expect(() => customTestRun('let obj1 #{ x #int } = { x: 2, y: 3 }; let obj2 = obj1 as #{ y #int }'))
    .toThrow('Attempted to change a type from "#{ x #int }" to type "#{ y #int }". "as" type assertions can only widen or narrow a provided type.')
})

test('Both arms of expression-if must return compatible types', () => {
  expect(customTestRun('print if true then { x: 2 } else { x: 3 }')[0].raw.get('x').raw).toBe(2n)
  expect(customTestRun('print if true then { x: 2 } else { x: 3, y: 2 }')[0].raw.get('x').raw).toBe(2n)
  expect(() => customTestRun('print if true then { x: 2 } else { y: 2 }'))
    .toThrow('The following "if true" case of this condition has the type "#{ x #int }", which is incompatible with the "if not" case\'s type, "#{ y #int }"')
  expect(() => customTestRun('print if true then { x: 2, z: 0 } else { y: 2, z: 1 }'))
    .toThrow('The following "if true" case of this condition has the type "#{ x #int, z #int }", which is incompatible with the "if not" case\'s type, "#{ y #int, z #int }"')
  expect(customTestRun('type alias #MyRec = #{ z #int }; print if true then { x: 2, z: 0 } as #MyRec else { y: 2, z: 1 } as #MyRec'))
})

//
// Pattern matching
//

test('Basic pattern matching functionality', () => {
  expect(customTestRun('print match { x: 2 } { when { y: Y #int } then Y + 5; when { x: X } then X }')[0].raw).toBe(2n)
  expect(customTestRun('print match { x: 2 } { when { x: X, y: Y #int } then Y + 5; when { x: X } then X }')[0].raw).toBe(2n)
  expect(customTestRun('print match { x: 2 } { when {} then 3; when { x: X } then X }')[0].raw).toBe(3n)
  expect(customTestRun('print match { x: 2 } { when { x: X } then X; when {} then 3 }')[0].raw).toBe(2n)
})

test('Type-widening within pattern matching', () => {
  expect(customTestRun(`
    let obj #{ x #int } = { x: 2, y: 3 }
    print match obj { when { y: Y #int } then Y + 5; when { x: X } then X }
  `)[0].raw).toBe(8n)
})

test('Pattern matching with basic primitives', () => {
  expect(customTestRun('print match 2 { when x then x }')[0].raw).toBe(2n)
  expect(customTestRun("print match 'hi' { when x then x }")[0].raw).toBe('hi')
})

test('Pattern matching with type constraints', () => {
  expect(customTestRun('print match 5 { when x where x == 6 then x; when x where x == 5 then x + 10 }')[0].raw).toBe(15n)
  expect(customTestRun('print match { x: 5 } { when { x: x where x == 5 } then x; when { x: x } where x == 6 then x + 10 }')[0].raw).toBe(5n)
})

test('Pattern matching will fail when operating on unrelated types', () => {
  expect(() => customTestRun('print match 2 { when { x: x } then 0 }'))
    .toThrow('Found type #int but expected a record.')
})

test('Nested record pattern in pattern matching', () => {
  expect(customTestRun('print match { x: { y: 2 } } { when { x: { y: z } } then z }')[0].raw).toBe(2n)
})

//
// Imports
//

test('Able to import other modules', () => {
  expect(customTestRun("import other from './other'; print other.fn()", {
    modules: { 'other': 'export let fn = () => 2' }
  })[0].raw).toBe(2n)
  expect(customTestRun("import other from './other'; begin { print other.x + run other.fn() }", {
    modules: { 'other': 'export function fn() { return 2 }; export let x = 3' }
  })[0].raw).toBe(5n)
  expect(customTestRun("import mod1 from './dir/mod1'; print mod1.fn()", {
    modules: {
      'dir/mod1': "import mod2 from './mod2'; export let fn = mod2.fn",
      'dir/mod2': "export let fn = () => 2",
    }
  })[0].raw).toBe(2n)
  expect(customTestRun("import $ from './other'; print 2", {
    modules: { 'other': 'let x = 3' }
  })[0].raw).toBe(2n)
  expect(() => customTestRun("import $ from './other'", {
    modules: { 'other': 'function fn() { export let x = 2 }' }
  })).toThrow('Syntax error')
})

test('Exports work with destructuring', () => {
  expect(customTestRun("import other from './other'; begin { print other.x + other.y }", {
    modules: { 'other': 'export let { a: x, b: y where y == 3 } = { a: 2, b: 3 }' }
  })[0].raw).toBe(5n)
})

test('Imported modules are cached', () => {
  expect(customTestRun("import $ from './mod1'; import $ from './mod2'", {
    modules: {
      'mod1': "import mod2 from './mod2'",
      'mod2': "print 5",
    }
  }).length).toBe(1)
})

test('Circular dependencies are not allowed', () => {
  expect(() => customTestRun("import $ from './mod1'", {
    modules: {
      'mod1': "import $ from './mod2'",
      'mod2': "import $ from './mod1'",
    }
  })).toThrow('Circular dependency detected')
})

test('Can not use export in the main module', () => {
  expect(() => customTestRun("export let x = 2"))
    .toThrow('Can not export from a main module')
})

test('Can not use a begin block in an imported module', () => {
  expect(() => customTestRun("import $ from './other'", {
    modules: { 'other': 'begin { print 2 }' }
  })).toThrow('Can not use a begin block in an imported module')
})

//
// tags
//

test('Basic tag functionality', () => {
  expect(customTestRun('let id = tag #int; let myId = id@ 2; let id@ myId2 = myId; print myId2')[0].raw).toBe(2n)
  expect(customTestRun('let myTag = tag #{ x #int }; let boxed = myTag@ { x: 2 }; let myTag@ { x: value } = boxed; print value')[0].raw).toBe(2n)
})

test('Tags can only unbox their own kind', () => {
  expect(() => customTestRun('let a = tag #int; let b = tag #int; let boxed = a@ 2; let b@ x = boxed'))
    .toThrow('Found type "#:tag #int", but expected type "#:tag #int".')
})

test('Each tag has a unique type', () => {
  expect(() => customTestRun('let a = tag #int; let b = tag #int; let result = if true then a else b'))
    .toThrow('The following "if true" case of this condition has the type "#typeof<tag #int>", which is incompatible with the "if not" case\'s type, "#typeof<tag #int>".')
})

test('Tags in pattern matching', () => {
  // You can't pattern match against different tags (they're incompatible types).
  // You need to know which tag you're unwrapping in advance.
  // (The plan is, if the tag is part of a variant, then you're allowed to pattern match against each variant, otherwise, you can't).
  expect(() => customTestRun('let a = tag #int; let b = tag #int; print match a@ 2 { when b@ x then x; when a@ x then x + 1 }'))
    .toThrow('Found type "#:tag #int", but expected type "#:tag #int".')
})

test('Type checking against tags', () => {
  expect(customTestRun('let myTag = tag #int; let boxed #:myTag = myTag@ 2; let myTag@ value = boxed; print value')[0].raw).toBe(2n)
  expect(customTestRun('let myTag = tag #int; let boxed = myTag@ 2; let myTag@ value = boxed as #:myTag; print value')[0].raw).toBe(2n)
})

test('Tagging can be nested', () => {
  expect(customTestRun('let b = tag #int; let a = tag #:b; let boxed = a@ b@ 2; let a@ b@ unboxed = boxed; print unboxed')[0].raw).toBe(2n)
})

test('Can not use "#:" syntax on descendents of a tag', () => {
  expect(() => customTestRun('let a = tag #int; let boxed = a@ 2; type alias #BadType = #:boxed'))
    .toThrow('The provided value can not be used to make a descendent-matching type.')
})

//
// etc
//

test('Able to have odd spacing', () => {
  expect(customTestRun(' begin { print 2 } ')[0].raw).toBe(2n)
  expect(customTestRun('begin{print 2;print 3}')[1].raw).toBe(3n)
  expect(customTestRun('begin{print 2 ; print 3}')[1].raw).toBe(3n)
  expect(customTestRun(' let x = 2 begin { print 0 print x } ')[1].raw).toBe(2n)
  expect(customTestRun(' let x = 2 ; begin { print 0 print x } ')[1].raw).toBe(2n)
  expect(customTestRun(' print 2 ')[0].raw).toBe(2n)
  expect(customTestRun('').length).toBe(0)
  expect(customTestRun(' ').length).toBe(0)
  expect(customTestRun(" import other from './other' print other.x ", {
    modules: { 'other': 'export let x = 2' }
  })[0].raw).toBe(2n)
  expect(customTestRun(" import other from './other' ; print other.x ", {
    modules: { 'other': 'export let x = 2' }
  })[0].raw).toBe(2n)
  expect(customTestRun(" import other from './other' begin { print other.x } ", {
    modules: { 'other': 'export let x = 2' }
  })[0].raw).toBe(2n)
  expect(customTestRun(" import other from './other' let y = other.x + 1 begin { print y } ", {
    modules: { 'other': 'export let x = 2' }
  })[0].raw).toBe(3n)
  expect(customTestRun(" import other from './other' ", {
    modules: { 'other': 'print 2' }
  })[0].raw).toBe(2n)
})

/* OTHER TESTS
# generics
# unknown and never - e.g. addition with unknown types.
# I should make a special print function (like I did with _printType), that prints out variables captured in a closure, for testing purposes (I can see if I'm correctly not capturing variables that don't need ot be captured)
# stdLib (maybe it can be done in its own file)
*/