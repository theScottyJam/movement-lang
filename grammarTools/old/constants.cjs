'use strict'

module.exports = {
  PURITY: {
    none: 'NONE',
    gets: 'GETS',
    pure: 'PURE',
  },
  getPurityLevel: purity => ({ PURE: 2, GETS: 1, NONE: 0 })[purity],
  FLOW_CONTROL: {
    return: 'RETURN',
  },
}