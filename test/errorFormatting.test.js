import * as Position from '../language/Position'
import { _testingHelpers } from '../errorFormatting'
const { formatPosition } = _testingHelpers

const customFormatPosition = ({ line, col, length }, text) => {
  return formatPosition(
    Position.create({
      file: 'test-file.toy',
      line,
      col,
      offset: (
        text.split('\n').slice(0, line - 1).join('\n').length +
        text.split('\n')[line - 1].slice(0, col).length
      ),
      length,
    }),
    { colorOutput: false, loadModule: () => text }
  )
}

test('It properly underlines the error', () => {
  expect(customFormatPosition({ line: 2, col: 7, length: 2 }, [
    'begin {',
    'print 23 + 4',
    '}',
  ].join('\n')))
    .toBe([
      'At line 2',
      '',
      'print 23 + 4',
      '      ~~',
    ].join('\n'))
})

test('It removes indentation in the output', () => {
  expect(customFormatPosition({ line: 2, col: 9, length: 2 }, [
    'begin {',
    '  print 23 + 4',
    '}',
  ].join('\n')))
    .toBe([
      'At line 2',
      '',
      'print 23 + 4',
      '      ~~',
    ].join('\n'))
})

test('It requests the proper path from loadModule', () => {
  const pos = Position.create({ file: 'test-file.toy', line: 2, col: 9, offset: 16, length: 2 })
  let path = null

  formatPosition(pos, {
    loadModule: path_ => {
      path = path_
      return [
        'begin {',
        '  print 23 + 4',
        '}',
      ].join('\n')
    },
    colorOutput: false,
  })

  expect(path).toBe('test-file.toy')
})

test('It requests the proper path from loadModule', () => {
  const pos = Position.create({ file: Position.internalFile, line: 1, col: 1, offset: 0, length: 0 })

  const result = formatPosition(pos, {
    loadModule: path => { throw new Error('This should not be called') },
    colorOutput: false,
  })

  expect(result).toBe('At <internal file>')
})

test('It will truncate long lines on the right', () => {
  expect(customFormatPosition({ line: 2, col: 40, length: 5 }, [
    'begin {',
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM',
    '}',
  ].join('\n')))
    .toBe([
      'At line 2',
      '',
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()qwe…',
      '                                       ~~~~~',
    ].join('\n'))
})

test('It will truncate long lines on the left', () => {
  expect(customFormatPosition({ line: 2, col: 80, length: 5 }, [
    'begin {',
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM',
    '}',
  ].join('\n')))
    .toBe([
      'At line 2',
      '',
      '…XYZ!@#$%^&*()qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM',
      '                     ~~~~~',
    ].join('\n'))
})

test('It will truncate long lines on both sides', () => {
  expect(customFormatPosition({ line: 2, col: 80, length: 5 }, [
    'begin {',
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM 9876543210 314159265358979323846264338327',
    '}',
  ].join('\n')))
    .toBe([
      'At line 2',
      '',
      '…XYZ!@#$%^&*()qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM 987654321…',
      '                     ~~~~~',
    ].join('\n'))
})

test('It handles ranges over multiple lines', () => {
  expect(customFormatPosition({ line: 2, col: 3, length: 15 }, [
    'begin {',
    '> abc',
    '> def',
    '> ghi',
    '}',
  ].join('\n')))
    .toBe([
      'At line 2',
      '',
      '> abc…',
      '  ~~~~',
    ].join('\n'))
})

test('It can handle empty strings', () => {
  // This might happen if, for example, the file got changed or deleted while the code was running.
  const pos = Position.create({ file: 'test-file.toy', line: 2, col: 3, length: 5, offset: 10 })
  expect(formatPosition(pos, { loadModule: () => '', colorOutput: false }))
    .toBe([
      'At line 2',
      '',
      '',
      '  ~~~~~', // This underline might not make sense if there would have been a new line, but at least something shows up.
    ].join('\n'))
})
