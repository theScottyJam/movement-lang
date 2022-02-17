import { customTestRun } from './util'

//
// $Mutable
//

describe('$Mutable', () => {
  test('Able to get and set values', () => {
    const results = customTestRun(`
      begin {
        let value = $Mutable.create(2)
        print $Mutable.get_(value)
        run $Mutable.set(value, 4)
        print $Mutable.get_(value)
      }
    `)
    expect(results[0].raw).toBe(2n)
    expect(results[1].raw).toBe(4n)
  })
})

describe('$Int', () => {
  test('Descendent-matching type', () => {
    expect(customTestRun('let x #:$Int = 2; print x')[0].raw).toBe(2n)
    expect(() => customTestRun("let x #:$Int = 'x'"))
      .toThrow('Can not assign the type "#string" to an lvalue with the constraint "#:$Int". -- x.')
    expect(customTestRun('let x #:$Int = 2; _printType x')[0]).toBe('#:$Int')
  })
})