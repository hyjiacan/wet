/**
 * 处理模板时的异常
 */
class ParseError extends Error {
  constructor(message, level) {
    super(message)
    this.name = 'ParseError'
    this.level = level || 0
  }
}

module.exports = ParseError
