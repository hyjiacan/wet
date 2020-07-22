module.exports = {
  /**
   * 运行动态代码
   * @param code
   * @param context
   * @return {*}
   */
  runCode(code, context) {
    return new Function(`{${Object.keys(context).join(',')}}`, code)(context)
  },

  /**
   * 数组迭代
   * @param {Object} context
   * @param {string} key
   * @param {string} value
   * @param {string} data
   * @param {string} range
   * @param {number} step
   */
  runForOf(context, {key, value, data, range, step}) {
    if (range) {
      let from
      let to

      if (/^[0-9]+$/.test(range)) {
        // data 是数值
        from = 0
        to = parseInt(range)
      } else {
        // data 是范围
        [from, to] = range.split('-').map(i => parseInt(i))
      }
      context = {
        range: []
      }
      for (let i = from; i <= to; i++) {
        context.range.push(i)
      }
      data = 'range'
    }
    if (key) {
      return this.runCode(`
    const data = []
    for (let i = 0; i < ${data}.length; i+=${step}) {
       const item = ${data}[i]
      data.push({
       ${key}: i,
       ${value}: item
      })
    }
    return data`, context)
    }

    return this.runCode(`
    const data = []
    for (let i = 0; i < ${data}.length; i+=${step}) {
       const item = ${data}[i]
       data.push({
        ${value}: item
       })
    }
    return data`, context)
  },

  /**
   * 对象迭代
   * @param {Object} context
   * @param {string} key
   * @param {string} value
   * @param {string} data
   */
  runForIn(context, {key, value, data}) {
    if (key) {
      return this.runCode(`
    const data = []
    for(const key in ${data}) {
      const value = ${data}[key]
      data.push({
        ${key}: key,
        ${value}: value
      })
    }
    return data`, context)
    }
    return this.runCode(`
    const data = []
    for(const key in ${data}) {
      const value = ${data}[key]
      data.push({
        ${value}: {
          key,
          value
        }
      })
    }
    return data`, context)
  },

  /**
   * 从上下文中计算表达式的值
   * @param context
   * @param expression
   * @return {*}
   */
  getExpressionValue(context, expression) {
    return this.runCode(`return ${expression}`, context)
  }
}
