import { customTestRun, errorCodeOf } from './util'

describe('Literals', () => {
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
    expect(() => customTestRun(String.raw`print 'x \a'`)[0].raw).toThrow('Unrecognized string escape sequence "\\a". -- \'x \\a\'.')
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
})

describe('Main syntax', () => {
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
})

describe('Assignment', () => {
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
      .toThrow('Identifier "x" already exists in scope, please choose a different name. -- x.')
    expect(() => customTestRun('begin { let x = 2; let x = 3 }'))
      .toThrow('Identifier "x" already exists in scope, please choose a different name. -- x.')
    expect(() => customTestRun('print let x = 2 let x = 3 in x'))
      .toThrow('Identifier "x" already exists in scope, please choose a different name. -- x.')
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
      .toThrow('Attempted to access undefined variable $ -- $.')
  })
})

describe('Functions', () => {
  test('No parameter function', () => {
    expect(customTestRun('let fn = () => 2; print fn()')[0].raw).toBe(2n)
  })

  test('Function with parameters', () => {
    expect(customTestRun('let fn = (x #int, y #int) => x + y; print fn(2, 3)')[0].raw).toBe(5n)
    // Ensuring function arguments can use variables from the outside scope
    // (i.e. you can't execute the argument list in the newly created scope, even though you need to assign the results to that new scope)
    expect(customTestRun('let fn = (x #int, y #int) => x + y; begin { let x = 2; print fn(x, 3) }')[0].raw).toBe(5n)
  })

  test('Calling with correct purity levels', () => {
    expect(customTestRun('let fn = () => 2; begin { print fn() }')[0].raw).toBe(2n)
    expect(() => customTestRun('let fn = () => 2; begin { print get fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must not use any purity annotations -- fn().')
    expect(() => customTestRun('let fn = () => 2; begin { print run fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must not use any purity annotations -- fn().')
    expect(() => customTestRun('let fn = gets () => 2; begin { print fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "get" -- fn().')
    expect(customTestRun('let fn = gets () => 2; begin { print get fn() }')[0].raw).toBe(2n)
    expect(() => customTestRun('let fn = gets () => 2; begin { print run fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "get" -- fn().')
    expect(() => customTestRun('function fn() { return 2 }; begin { print fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "run" -- fn().')
    expect(() => customTestRun('function fn() { return 2 }; begin { print get fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "run" -- fn().')
    expect(customTestRun('function fn() { return 2 }; begin { print run fn() }')[0].raw).toBe(2n)

    // Testing get/run as a statement
    expect(customTestRun('let fn = gets () => print 2; begin { get fn() }')[0].raw).toBe(2n)
    expect(customTestRun('function fn() { print 2 }; begin { run fn() }')[0].raw).toBe(2n)
  })

  test('Using a purity annotation in an incorrect location', () => {
    expect(() => customTestRun('let fn = gets () => 2; print get fn()'))
      .toThrow('Attempted to call a function which was less pure than its containing environment. -- fn().')
    expect(() => customTestRun('let fn = gets () => 2; let fn2 = () => get fn()'))
      .toThrow('Attempted to call a function which was less pure than its containing environment. -- fn().')
    expect(() => customTestRun('function fn() { return 2 }; let fn2 = () => run fn()'))
      .toThrow('Attempted to call a function which was less pure than its containing environment. -- fn().')
    expect(() => customTestRun('function fn() { return 2 }; let fn2 = gets () => run fn()'))
      .toThrow('Attempted to call a function which was less pure than its containing environment. -- fn().')
  })

  test('Can not use a purity annotation on a non-function', () => {
    expect(() => customTestRun('print get 2'))
      .toThrow('This expression received a purity annotation, but such annotations should only be used on function calls. -- 2.')
    expect(() => customTestRun('begin { get 2 }'))
      .toThrow('This expression received a purity annotation, but such annotations should only be used on function calls. -- 2.')
  })

  test('Can not use return outside of a function', () => {
    expect(() => customTestRun('begin { return 2 }'))
      .toThrow('Can not use a return outside of a function. -- return 2.')
    expect(() => customTestRun('begin { if false { return 2 } }'))
      .toThrow('Can not use a return outside of a function. -- return 2.')
  })
})

describe('Scoping', () => {
  test('Unable to access variables outside of block scope', () => {
    expect(() => customTestRun('begin { if true { let x = 2 }; print x }'))
      .toThrow('Attempted to access undefined variable x -- x.')
    expect(() => customTestRun('begin { if false { let x = 2 }; print x }'))
      .toThrow('Attempted to access undefined variable x -- x.')
  })

  test('Unable to access variables outside of expression-let scope', () => {
    expect(() => customTestRun('let result = let x = 2 in x print x'))
      .toThrow('Attempted to access undefined variable x -- x.')
  })

  test('Unable to access variables outside of function scope', () => {
    expect(() => customTestRun('function fn() { let x = 2 } begin { run fn() print x }'))
      .toThrow('Attempted to access undefined variable x -- x.')
    expect(() => customTestRun('function fn() { let x = 2 } print x'))
      .toThrow('Attempted to access undefined variable x -- x.')
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
})

describe('Types', () => {
  test('Can assign to correct primitive type declarations', () => {
    expect(customTestRun('let x #int = 2; print x')[0].raw).toBe(2n)
    expect(customTestRun('let x #boolean = true; print x')[0].raw).toBe(true)
    expect(customTestRun("let x #string = 'abc'; print x")[0].raw).toBe('abc')
  })

  test('Can not assign to incorrect primitive type declarations', () => {
    expect(() => customTestRun('let x #boolean = 2; print x'))
      .toThrow('Can not assign the type "#int" to an lvalue with the constraint \"#boolean\". -- x.')
    expect(() => customTestRun('let x #string = true; print x'))
      .toThrow('Can not assign the type \"#boolean\" to an lvalue with the constraint \"#string\". -- x.')
    expect(() => customTestRun("let x #int = 'abc'; print x"))
      .toThrow('Can not assign the type \"#string\" to an lvalue with the constraint \"#int\". -- x.')
    expect(() => customTestRun("let { x: y #int } = { x: 'abc' }; print x"))
      .toThrow('Can not assign the type \"#string\" to an lvalue with the constraint \"#int\". -- y.')
  })

  test('Record types', () => {
    expect(customTestRun('let x #{ x #int } = { x: 2 }').length).toBe(0)
    expect(customTestRun('let x #{ x #int } = { x: 2, y: 3 }').length).toBe(0)
    expect(() => customTestRun('let x #{ x #int, y #int } = { x: 2 }'))
      .toThrow('Can not assign the type "#{ x #int }" to an lvalue with the constraint "#{ x #int, y #int }". -- x.')
  })

  test('Core function types', () => {
    expect(customTestRun('let fn #(#int) => #int = (x #int) => x').length).toBe(0)
    expect(() => customTestRun('let fn #() => #int = (x #int) => x'))
      .toThrow('Can not assign the type "#(#int) => #int" to an lvalue with the constraint "#() => #int". -- fn.')
    expect(() => customTestRun('let fn #(#int, #int) => #int = (x #int) => x'))
      .toThrow('Can not assign the type "#(#int) => #int" to an lvalue with the constraint "#(#int, #int) => #int". -- fn.')
    expect(() => customTestRun('let fn #(#int) => #string = (x #int) => x'))
      .toThrow('Can not assign the type "#(#int) => #int" to an lvalue with the constraint "#(#int) => #string". -- fn.')
    expect(customTestRun('let fn #() => #{ x #int } = () => { x: 2, y: 3 }').length).toBe(0)
    expect(() => customTestRun('let fn #() => #{ x #int, y #int } = () => { x: 2 }'))
      .toThrow('Can not assign the type "#() => #{ x #int }" to an lvalue with the constraint "#() => #{ x #int, y #int }". -- fn.')
    expect(customTestRun('let fn #(#{ x #int, y #int }) => #int = (x #{ x #int }) => 2').length).toBe(0)
    expect(() => customTestRun('let fn #(#{ x #int }) => #int = (x #{ x #int, y #int }) => 2').length).toThrow('Can not assign the type "#(#{ x #int, y #int }) => #int" to an lvalue with the constraint "#(#{ x #int }) => #int". -- fn')
  })

  test('Function type purity', () => {
    expect(customTestRun('let fn #() => #int = () => 2').length).toBe(0)
    expect(customTestRun('let fn #gets () => #int = () => 2').length).toBe(0)
    expect(customTestRun('let fn #function() #int = () => 2').length).toBe(0)

    expect(() => customTestRun('let fn #() => #int = gets () => 2'))
      .toThrow('Can not assign the type "#gets () => #int" to an lvalue with the constraint "#() => #int". -- fn.')
    expect(customTestRun('let fn #gets () => #int = gets () => 2').length).toBe(0)
    expect(customTestRun('let fn #function() #int = gets () => 2').length).toBe(0)

    expect(() => customTestRun('function fn() {}; let fn2 #() => #unit = fn'))
      .toThrow('Can not assign the type "#function() #unit" to an lvalue with the constraint "#() => #unit". -- fn2.')
    expect(() => customTestRun('function fn() {}; let fn2 #gets () => #unit = fn'))
      .toThrow('Can not assign the type "#function() #unit" to an lvalue with the constraint "#gets () => #unit". -- fn2.')
    expect(customTestRun('function fn() {}; let fn2 #function() #unit = fn').length).toBe(0)
  })

  test('Calling with correct purity annotations depends on current type, not underlying type', () => {
    expect(customTestRun('let fn #gets () => #int = () => 2; begin { print get fn() }')[0].raw).toBe(2n)
    expect(() => customTestRun('let fn #gets () => #int = () => 2; begin { print fn() }'))
      .toThrow('Attempted to do this function call with the wrong purity annotation. You must use "get" -- fn().')
  })

  test('Each return must provide compatible types.', () => {
    expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { x: 3 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
    expect(customTestRun('function fn() { if true { return { x: 2 } } else { return { x: 3, y: 2 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
    expect(customTestRun('function fn() {}; _printType fn')[0]).toBe('#function() #unit')
    // Handling never types
    expect(customTestRun('function fn(cb #()=>#never) { return cb() }; _printType fn')[0]).toBe('#function(#() => #never) #never')
    expect(customTestRun('function fn(cb #function()#never) { run cb() }; _printType fn')[0]).toBe('#function(#function() #never) #never')

    expect(() => customTestRun('function fn() { if true { return { x: 2 } } else { return { y: 2 } } }; _printType fn'))
      .toThrow('Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation. -- function fn().')
    expect(() => customTestRun("function fn() { if true { return { x: 2 } } else { return { x: 'string' } } }; _printType fn"))
      .toThrow('Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation. -- function fn().')
    expect(() => customTestRun("function fn() { if true { return 2 } else { return 'string' } }; _printType fn")[0])
      .toThrow('Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation. -- function fn().')
    
    // Three returns
    expect(() => customTestRun('function fn() { if true { return { x: 2 } } else if true { return { y: 2 } } else { return { x: 3, y: 3 } } }; _printType fn'))
      .toThrow('Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation. -- function fn().')
    expect(customTestRun('function fn(cb #()=>#never) { if true { return cb() } else { return { x: 2 } } }; _printType fn')[0]).toBe('#function(#() => #never) #{ x #int }')
    expect(() => customTestRun('function fn(cb #()=>#never) { if true { return cb() } else if true { return { x: 2 } } else { return { y: 2 } } }; _printType fn'))
      .toThrow('Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation. -- function fn(cb #()=>#never).')
    expect(customTestRun('function fn() { if true { return { x: 2 } } else if true { return { x: 2, y: 2 } } else { return { x: 2, z: 3 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
    expect(customTestRun('function fn() { if true { return { x: 2, z: 3 } } else if true { return { x: 2, y: 2 } } else { return { x: 2 } } }; _printType fn')[0]).toBe('#function() #{ x #int }')
  })

  test('Assignment can not be used to widen types', () => {
    expect(() => customTestRun('let x #{ x #int } = { x: 2 } as #{}'))
      .toThrow('Can not assign the type "#{}" to an lvalue with the constraint "#{ x #int }". -- x.')
  })

  test('"as" operator', () => {
    expect(customTestRun('let obj = { x: 2 } as #{}').length).toBe(0)
    expect(() => customTestRun('let obj = { x: 2 } as #{ x #int, y #int }').length)
      .toThrow('"as" type assertion failed - failed to convert a type from "#{ x #int }" to #{ x #int, y #int }') // runtime error
    expect(() => customTestRun('let obj = { x: 2 } as #{ y #int }').length)
      .toThrow('Attempted to change a type from "#{ x #int }" to type "#{ y #int }". "as" type assertions can only widen or narrow a provided type. -- as #{ y #int }.')
    expect(() => customTestRun('let obj = { x: 2 } as #int').length)
      .toThrow('Attempted to change a type from "#{ x #int }" to type "#int". "as" type assertions can only widen or narrow a provided type. -- as #int.')
    expect(() => customTestRun('let obj = { x: 2, y: 3 } as #{ x #int }; print obj.y'))
      .toThrow('Failed to find the identifier "y" on the record of type #{ x #int }. -- obj.y')
    expect(customTestRun('let obj1 #{ x #int } = { x: 2, y: 3 }; let obj2 = obj1 as #{ x #int, y #int }; print obj2.y')[0].raw).toBe(3n)
    expect(() => customTestRun('let obj1 #{ x #int } = { x: 2, y: 3 }; let obj2 = obj1 as #{ y #int }'))
      .toThrow('Attempted to change a type from "#{ x #int }" to type "#{ y #int }". "as" type assertions can only widen or narrow a provided type. -- as #{ y #int }.')
  })

  test('Both arms of expression-if must return compatible types', () => {
    expect(customTestRun('print if true then { x: 2 } else { x: 3 }')[0].raw.get('x').raw).toBe(2n)
    expect(customTestRun('print if true then { x: 2 } else { x: 3, y: 2 }')[0].raw.get('x').raw).toBe(2n)
    expect(() => customTestRun('print if true then { x: 2 } else { y: 2 }'))
      .toThrow('The following "if true" case of this condition has the type "#{ x #int }", which is incompatible with the "if not" case\'s type, "#{ y #int }". -- { x: 2 }.')
    expect(() => customTestRun('print if true then { x: 2, z: 0 } else { y: 2, z: 1 }'))
      .toThrow('The following "if true" case of this condition has the type "#{ x #int, z #int }", which is incompatible with the "if not" case\'s type, "#{ y #int, z #int }". -- { x: 2, z: 0 }.')
    expect(customTestRun('type alias #MyRec = #{ z #int }; print if true then { x: 2, z: 0 } as #MyRec else { y: 2, z: 1 } as #MyRec'))
  })
})

describe('Pattern matching', () => {
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

    expect(() => customTestRun('print match { x: 2 } { when { x: X, y: Y } then Y }'))
      .toThrow('Could not auto-determine the type of this lvalue, please specify it with a type constraint. -- Y.')
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
      .toThrow('Attempted to perform a record-destructure on the non-record type #int. -- { x: x }.')
  })

  test('Nested record pattern in pattern matching', () => {
    expect(customTestRun('print match { x: { y: 2 } } { when { x: { y: z } } then z }')[0].raw).toBe(2n)
  })
})

describe('Imports', () => {
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
    })).toThrow("Circular dependency detected -- import $ from './mod1'")
  })

  test('Can not use export in the main module', () => {
    expect(() => customTestRun("export let x = 2"))
      .toThrow('Can not export from a main module -- export let x = 2.')
  })

  test('Can not use a begin block in an imported module', () => {
    expect(() => customTestRun("import $ from './other'", {
      modules: { 'other': 'begin { print 2 }' }
    })).toThrow('Can not use a begin block in an imported module -- begin { print 2 }.')
  })

  test('Modules can access local variables', () => {
    expect(customTestRun("import other from './other'; print other.fn()", {
      modules: { 'other': 'let x = 2; export let fn = () => x' }
    })[0].raw).toBe(2n)
  })

  test("Modules don't expose non-exported variables", () => {
    expect(() => customTestRun("import other from './other'; print other.x", {
      modules: { 'other': 'let x = 2' }
    })).toThrow('Failed to find the identifier "x" on the record of type #{}. -- other.x.')
    expect(() => customTestRun("import other from './other'; let other2 = other as #{ x #int }; print other2.x", {
      modules: { 'other': 'let x = 2' }
    })).toThrow('"as" type assertion failed - failed to convert a type from "#{}" to #{ x #int }') // Runtime error
  })

  test("Modules don't expose types of non-exported variables in the module-type", () => {
    expect(customTestRun("import other from './other'; _printType other", {
      modules: { 'other': 'let x = 2' }
    })[0]).toBe('#{}')
  })
})

describe('tags', () => {
  test('Basic tag functionality', () => {
    expect(customTestRun('let id = tag #int; let myId = id@ 2; let id@ myId2 = myId; print myId2')[0].raw).toBe(2n)
    expect(customTestRun('let myTag = tag #{ x #int }; let boxed = myTag@ { x: 2 }; let myTag@ { x: value } = boxed; print value')[0].raw).toBe(2n)
  })

  test('Tags can only unbox their own kind', () => {
    expect(() => customTestRun('let a = tag #int; let b = tag #int; let boxed = a@ 2; let b@ x = boxed'))
      .toThrow('Attempted to perform a tag-destructure with type \"#:tag #int\" on an lvalue of an incompatible tag \"#:tag #int\". -- b@ x.')
  })

  test('Each tag has a unique type', () => {
    expect(() => customTestRun('let a = tag #int; let b = tag #int; let result = if true then a else b'))
      .toThrow('The following "if true" case of this condition has the type "#typeof<tag #int>", which is incompatible with the "if not" case\'s type, "#typeof<tag #int>". -- a.')
  })

  test('Tags in pattern matching', () => {
    // You can't pattern match against different tags (they're incompatible types).
    // You need to know which tag you're unwrapping in advance.
    // (The plan is, if the tag is part of a variant, then you're allowed to pattern match against each variant, otherwise, you can't).
    expect(() => customTestRun('let a = tag #int; let b = tag #int; print match a@ 2 { when b@ x then x; when a@ x then x + 1 }'))
      .toThrow('Attempted to perform a tag-destructure with type \"#:tag #int\" on an lvalue of an incompatible tag \"#:tag #int\". -- b@ x')
  })

  test('Type checking against tags', () => {
    expect(customTestRun('let myTag = tag #int; let boxed #:myTag = myTag@ 2; let myTag@ value = boxed; print value')[0].raw).toBe(2n)
    expect(customTestRun('let myTag = tag #int; let boxed = myTag@ 2; let myTag@ value = boxed as #:myTag; print value')[0].raw).toBe(2n)
  })

  test('Tagging can be nested', () => {
    expect(customTestRun('let b = tag #int; let a = tag #:b; let boxed = a@ b@ 2; let a@ b@ unboxed = boxed; print unboxed')[0].raw).toBe(2n)
  })

  test('Can not use "#:" syntax on descendants of a tag', () => {
    expect(() => customTestRun('let a = tag #int; let boxed = a@ 2; type alias #BadType = #:boxed'))
      .toThrow('The provided value can not be used to make a descendent-matching type. -- #:boxed.')
  })
})

describe('Etc', () => {
  test('Able to have odd spacing', () => {
    expect(customTestRun('').length).toBe(0)
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

  test('Able to use variable names with keywords', () => {
    expect(customTestRun('let printX = 2; let inX = 3; let trueX = 4; print printX + inX + trueX')[0].raw).toBe(9n)
  })
})

describe('Generics', () => {
  test('Basic generic functionality', () => {
    expect(customTestRun('let fn = <#T>(which #boolean, x #T, y #T) => if which then x else y; print fn<#int>(true, 2, 3)')[0].raw).toBe(2n)
    expect(customTestRun("let fn = <#T, #U>(which #boolean, x #T, y #U) => if which then x else y; print fn<#int, #string>(false, 2, 'hi')")[0].raw).toBe('hi')

    expect(() => customTestRun("let fn = <#T>(which #boolean, x #T, y #T) => if which then x else y; print fn<#int>(true, 2, 'hi')"))
      .toThrow('Failed to match a type found from an argument, \"#string\", with the generic param type \"#int\". -- \'hi\'.')
  })

  // TODO: I assume this has the same issue as the "Type constraints on generics" test
  xtest('Auto-determine generic types', () => {
    expect(customTestRun('let fn = <#T>(which #boolean, x #T, y #T) => if which then x else y; print fn(true, 2, 3)')[0].raw).toBe(2n)
    expect(customTestRun("let fn = <#T, #U>(which #boolean, x #T, y #U) => if which then x else y; print fn(false, 2, 'hi')")[0].raw).toBe('hi')
    expect(customTestRun("let fn = <#T, #U>(which #boolean, x #T, y #U) => if which then x else y; print fn<#int>(false, 2, 'hi')")[0].raw).toBe('hi')
    expect(customTestRun('let fn = <#T>({ inner: inner #T }) => inner; print fn({ inner: 2 })')[0].raw).toBe(2n)

    expect(() => customTestRun("let fn = <#T>(x #T) => x; print fn<#string>(2)"))
      .toThrow('Found type "#int", but expected type "#string".')
    expect(() => customTestRun("let fn = <#T>(which #boolean, x #T, y #T) => if which then x else y; print fn(true, 2, 'hi')"))
      .toThrow('Found type "#string", but expected type "#int". -- ?')

    expect(customTestRun("let fn = <#T of #{ x #int }>(which #boolean, x #T, y #T) => if which then x else y; print fn(true, { x: 2 }, { x: 4, y: 3 }).x")[0].raw).toBe(2n)
    expect(customTestRun("let fn = <#T of #{ x #int }>(which #boolean, x #T, y #T) => if which then x else y; _printType fn(true, { x: 2 }, { x: 4, y: 3 })")[0]).toBe('#{ x #int }')
  })

  test('Provide too many generic params', () => {
    expect(() => customTestRun("let fn = <#T>(x #T) => x; print fn<#string, #int>(2)"))
      .toThrow('The function of type #(#T) => #T must be called with at most 1 generic parameters, but got called with 2. -- fn<#string, #int>(2).')
  })

  // TODO: I need a way to automatically instantiate generic types to fix these tests
  // so that the type constraint in a function parameter can have it's generic resolved at execution time.
  xtest('Type constraints on generics', () => {
    expect(customTestRun('let fn = <#T of #{ x #int }>(obj #T) => obj.x; print fn({ x: 3, y: 4 }) - 1')[0].raw).toBe(2n)
    expect(customTestRun('let fn = <#T of #{ x #int }>(obj #T) => obj.x; print fn({ x: 3, y: 4 }) - 1')[0].raw).toBe(2n)
    expect(customTestRun('let fn = <#T of #{ x #int }>({ inner: inner #T }) => inner.x; print fn({ inner: { x: 3, y: 4 } }) - 1')[0].raw).toBe(2n)
    expect(customTestRun('let fn = <#T of #{ x #int }>({ inner: inner #T }) => inner.x; print fn<#{ x #int, y #int }>({ inner: { x: 3, y: 4 } }) - 1')[0].raw).toBe(2n)
    expect(() => customTestRun('let fn = <#T of #{ x #int }>({ inner: inner #T }) => inner.x; print fn<#{ y #int }>({ inner: { y: 4 } })'))
      .toThrow('Found type "#{ y #int }", but expected type "#{ x #int }". -- ?')
    expect(() => customTestRun('let fn = <#T of #{ x #int }>({ inner: inner #T }) => inner.x; print fn<#{ x #int, y #int }>({ inner: { x: 2 } })'))
      .toThrow('Found type "#{ x #int }", but expected type "#{ x #int, y #int }". -- ?')
    expect(() => customTestRun('let fn = <#T of #{ x #int }>(obj #T) => obj.x; print fn({ y: 4 })'))
      .toThrow('Found type "#{ y #int }", but expected type "#{ x #int }". -- ?')
    expect(() => customTestRun('let fn = <#T of #{ x #int }>({ inner: inner #T }) => inner.x; print fn({ inner: { y: 4 } })'))
      .toThrow('Found type "#{ y #int }", but expected type "#{ x #int }". -- ?')
  })

  test('Generic return types/values', () => {
    expect(customTestRun('let fn = <#T>(value #T) #{ x #T } => { x: value }; print fn(2).x')[0].raw).toBe(2n)
    expect(customTestRun('let fn = <#T>(value #T) => { x: value }; print fn(2).x')[0].raw).toBe(2n)
  })

  test('Multiple generics when destructuring', () => {
    expect(customTestRun("let fn = <#T>({ a: a #T, b: b #T }) => b; print fn({ a: 2, b: 3 })")[0].raw).toBe(3n)
    expect(() => customTestRun("let fn = <#T>({ a: a #T, b: b #T }) => b; print fn({ a: 2, b: 'hi' })"))
      .toThrow('Failed to match a type found from an argument, \"#string\", with the generic param type \"#int\". -- { a: 2, b: \'hi\' }.')

    expect(customTestRun("let fn = <#T, #U>({ a: a #T, b: b #U }) => { x: a, y: b }; print fn({ a: 2, b: 'hi' }).y")[0].raw).toBe('hi')
  })

  // TODO
  test('Generic types are not interchangeable', () => {
    // expect(() => customTestRun("let fn = <#T, #U>(a #T, b #U) => if true then a else b; print fn(2, 'hi')"))
    //   .toThrow('?')
    // expect(() => customTestRun("let fn = <#T, #U>(a #T, b #U) => let x #U = a in x; print fn(2, 'hi')"))
    //   .toThrow('?')
    expect(() => customTestRun("let fn = <#T of #{ x #int }, #U of #{ x #int }>(a #T, b #U) => if true then a else b; print fn({ x: 2, z: 3 }, { x: 2, y: 3 })"))
      .toThrow('The following "if true" case of this condition has the type "#T", which is incompatible with the "if not" case\'s type, "#U". -- a')
    expect(() => customTestRun("let fn = <#T of #{ x #int }, #U of #{ x #int }>(a #T, b #U) => let z #U = a in z; print fn({ x: 2, z: 3 }, { x: 2, y: 3 })"))
      .toThrow('Can not assign the type "#T" to an lvalue with the constraint "#U". -- z.')
  })

  // TODO
  xtest('Generics from the same source are interchangeable', () => {
    expect(customTestRun('let fn = <#T>(x #T) => let y #T = x in y; print fn(2)')[0].raw).toBe(2n)
    expect(customTestRun('let fn = <#T of #{ y #int }>(x #T) => let y #T = x in y; print fn({ y: 2 }).y')[0].raw).toBe(2n)
  })

  // TODO
  xtest('<unnamed test>', () => {
    // TODO: I need to store the generic params on the stack, if I'm wanting to be able to use them in these sorts of locations.
    expect(customTestRun("let fn = <#T of #int>(a #T) => let b #T = a in b; print fn(2)")[0].raw).toBe(2n)
  })

  // Assigning generics to each other
  // * nested generics
  // * Multiple generics vs reusing the same generic
  // * With constraints
  // * expect(customTestRun("let fn = <#T of #int>(a #T) => let b #T = a in b; print fn(2)")[0].raw).toBe(2n)
  // Use one generic param within the constraint of another
  // Try things like addition and function calling with generics (w/ type constraints) - I might not be doing concrete/param types correctly
  // Eventually: Usage with tags.
})

/* OTHER TESTS
# Can't access type definitions that were defined in a scope. (e.g. don't do { type alias #x = #int } let y #x = 2)
# Invalid built-in types should throw errors (e.g. #something)
# Make sure to test the different assignmentTarget nodes within function parameters and pattern matching.
# Test having a tagged value with a large data type, get assigned to a smaller destructure, and vice-versa (possibly already tested)
# All function parameters must have a declared type (this error has changed, but I should still test it)
# Do I have good type-alias tests?
#
# unknown and never
# * When all branches of an if/else throw, the function's return type should be #never instead of #unit
# I should make a special print function (like I did with _printType), that prints out variables captured in a closure, for testing purposes (I can see if I'm correctly not capturing variables that don't need ot be captured)
# * Be sure to test `#:xyz` syntax with this, as it's not supposed to cause closures to capture anything from inside the "xyz" expression.
*/