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
    let makeFn = (x #int) => () => x
    let fn2 = makeFn(2)
    let fn3 = makeFn(3)
    print fn2()
    print fn3()
  `)
  expect(results[0].raw).toBe(2n)
  expect(results[1].raw).toBe(3n)
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

xtest('Each return must provide compatible types.', () => {
  // TODO: These tests need to be updated. They're not supposed to result in functions that return #never.
  expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { x: 3 } } }; _printType fn')[0]).toBe('#function() #never')
  expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { x: 3, y: 2 } } }; _printType fn')[0]).toBe('#function() #never')
  expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { y: 2 } } }; _printType fn')[0]).toBe('#function() #never')

  expect(customTestRun("function fn() { if true { return { x: 2 } } else { return { x: 'string' } } }; _printType fn")[0]).toBe('#function() #never')
  expect(customTestRun("function fn() { if true { return 2 } else { return 'string' } }; _printType fn")[0]).toBe('#function() #never')
  
  // Other things to test:
  // * three returns
  // * zero returns (means unit is returned)
  // * Automatically determines never types if error is thrown or what-not.
})

test('Assignment can not be used to widen types', () => {
  expect(() => customTestRun('let x #{ x #int } = { x: 2 } as #{}'))
    .toThrow('Found type "#{}", but expected type "#{ x #int }". -- let x #{ x #int } = { x: 2 } as #{}')
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

/* OTHER TESTS
# generics
# unknown and never - e.g. addition with unknown types.
# pattern match
*/