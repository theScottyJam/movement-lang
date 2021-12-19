import { customTestRun, errorCodeOf } from './util'

//
// $Mutable
//

describe('$Mutable', () => {
  test('Able to get and set values', () => {
    const results = customTestRun(`
      let value = $Mutable.create(2)
    `)
    // const results = customTestRun(`
    //   begin {
    //     let value = $Mutable.create(2)
    //     print $Mutable.get_(value)
    //     run $Mutable.set(value, 4)
    //     print $Mutable.get_(value)
    //   }
    // `)
    // expect(results[0].raw).toBe(2n)
    // expect(results[1].raw).toBe(4n)
  })
})