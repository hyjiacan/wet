function getContinueStatement(expression) {
  if (!expression) {
    return ''
  }
  return `if (${expression}) {
    continue
  }`
}

function getBreakStatement(expression) {
  if (!expression) {
    return ''
  }
  return `if (${expression}) {
    break
  }`
}

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
   * @param {string} continueOn
   * @param {string} breakOn
   */
  runForOf(context, {
    key, value, data, range, step,
    continueOn, breakOn
  }) {
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
    for (let ${key} = 0; ${key} < ${data}.length; ${key}+=${step}) {
      const ${value} = ${data}[${key}]
      ${getContinueStatement(continueOn)}
      ${getBreakStatement(breakOn)}
      data.push({
       ${key},
       ${value}
      })
    }
    return data`, context)
    }

    return this.runCode(`
    const data = []
    for (let _for_of_index_ = 0; _for_of_index_ < ${data}.length; _for_of_index_+=${step}) {
       const ${value} = ${data}[_for_of_index_]
      ${getContinueStatement(continueOn)}
      ${getBreakStatement(breakOn)}
       data.push({
        ${value}
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
   * @param {string} continueOn
   * @param {string} breakOn
   */
  runForIn(context, {
    key, value, data,
    continueOn, breakOn
  }) {
    if (key) {
      return this.runCode(`
    const data = []
    for(const ${key} in ${data}) {
      const ${value} = ${data}[${key}]
      ${getContinueStatement(continueOn)}
      ${getBreakStatement(breakOn)}
      data.push({
        ${key},
        ${value}
      })
    }
    return data`, context)
    }
    return this.runCode(`
    const data = []
    for(const _for_in_key_ in ${data}) {
      const ${value} = {
        key,
        value: ${data}[_for_in_key_]
      }
      ${getContinueStatement(continueOn)}
      ${getBreakStatement(breakOn)}
      data.push({
        ${value}
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
  },
  resolveExpression(content, context) {
    if (/^\s*$/.test(content)) {
      return content
    }
    return content
      // 解析表达式
      .replace(/{{2}([\s\S]+?)}{2}/g, (input, exp) => {
        // 移除表达式前后的空白字符
        let value = this.getExpressionValue(context, exp.trim())
        if (Object.prototype.toString.call(value) === '[object Object]') {
          value = JSON.stringify(value)
        }
        // 保持原数据，用于 t-html 的渲染
        if (context.__useRawHTML) {
          return value
        }
        // 避免注入脚本
        return String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')
      })
  }
}
