'use strict'

const isPos = Symbol('Position')
const throw_ = msg => { throw new Error(msg) }
const truncate = (msg, amount=100) => {
  if (msg.length <= amount) return msg
  return msg.slice(0, amount - 1) + '…'
}

const position_ = module.exports = {
  asPos: token => token.text == null
    ? throw_(`Internal error: Attempted to extract a position out of the non-token '${truncate(JSON.stringify(token))}'`)
    : ({
      [isPos]: true,
      line: token.line,
      col: token.col,
      length: token.text.length,
      offset: token.offset,
    }),
  range: (token1, token2) => {
    const pos1 = token1[isPos] ? token1 : position_.asPos(token1)
    const pos2 = token2[isPos] ? token2 : position_.asPos(token2)
    return {
      [isPos]: true,
      line: pos1.line,
      col: pos1.col,
      length: (pos2.offset - pos1.offset) + pos2.length,
      offset: pos1.offset,
    }
  },
}