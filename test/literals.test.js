const { testRun } = require('../parser')
const { BaseParseTimeError } = require('../grammarTools')

const customTestRun = text => {
  try {
    return testRun(text)
  } catch (err) {
    if (!(err instanceof BaseParseTimeError)) throw err
    const { message, pos } = err
    const lines = text.split('\n').slice(pos.first_line - 1, pos.last_line)
    if (pos.first_line === pos.last_line) {
      lines[0] = lines[0].slice(pos.first_column, pos.last_column)
    } else {
      lines[0] = lines[0].slice(0, pos.first_column)
      lines[lines.length - 1] = lines[lines.length - 1].slice(pos.last_column)
    }
    throw new Error(message + ' -- ' + lines.join('\\n'))
  }
}

test('It creates an integer', () => {
  expect(customTestRun('print 2')[0].raw).toBe(2n);
});

test('It creates a boolean', () => {
  expect(customTestRun('print true')[0].raw).toBe(true);
});

test('It creates a string', () => {
  expect(customTestRun("print 'abc'")[0].raw).toBe('abc');
});

test('It creates an empty string', () => {
  expect(customTestRun("print ''")[0].raw).toBe('');
});

test('It creates a string with valid escape sequences', () => {
  expect(customTestRun(String.raw`print 'x\n\r\t\\\'\"\0'`)[0].raw).toBe('x\n\r\t\\\'\"\0');
});

test('It throws on an invalid escape sequence', () => {
  expect(() => customTestRun(String.raw`print 'x \a'`)[0].raw).toThrow('x \\a');
});

test('It creates a record', () => {
  const map = customTestRun(`print { x: false, y: 'test', z: 2, w: {}, v: { a: 1 } }`)[0].raw
  expect(map.get('x').raw).toBe(false);
  expect(map.get('y').raw).toBe('test');
  expect(map.get('z').raw).toBe(2n);
  expect(map.size).toBe(5);
  expect(map.get('w').raw.size).toBe(0);
  expect(map.get('v').raw.get('a').raw).toBe(1n);
});
