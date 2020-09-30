// 此模块用于动态执行代码

/**
 * t-for 的 continue 支持
 * @param {string} expression
 * @return {string}
 */
function getContinueStatement(expression) {
  if (!expression) {
    return ''
  }
  return `if (${expression}) {
    continue
  }`
}

/**
 * t-for 的 break 支持
 * @param {string} expression
 * @return {string}
 */
function getBreakStatement(expression) {
  if (!expression) {
    return ''
  }
  return `if (${expression}) {
    break
  }`
}

/**
 * 可以作为变量名的字符集
 * @type {string}
 */
const VAR_CHARS = '$_QWERTYUIOPLKJHGFDSAZXCVBNMqwertyuioplkjhgfdsazxcvbnm0123456789'
const VAR_CHARS_LENGTH = VAR_CHARS.length

/**
 * 获取一个随机的变量名称（长度为 32 位）
 * @return {string}
 */
function getRandomVarName() {
  const result = ['__']

  // 生成30个字符
  for (let i = 0; i < 30; i++) {
    result.push(VAR_CHARS.charAt(Math.round(Math.random() * VAR_CHARS_LENGTH)))
  }

  return result.join('')
}

module.exports = {
  /**
   * 运行动态代码
   * 利用 ES6 的自动解构将对象处理成参数列表
   * @param {string} code 待执行的代码体
   * @param {{}} context 要执行代码的上下文（用于提供执行作用域的数据）
   * @return {*}
   */
  runCode(code, context) {
    return new Function(`{${Object.keys(context).join(',')}}`, code)(context)
  },

  /**
   * t-for 数组迭代
   * @param {{}} context
   * @param {string} key 循环时的索引变量名
   * @param {string} value 循环时的值变量名
   * @param {string} data 待迭代的数据变量名
   * @param {string} range 指定的范围，用以支持 1-9 这样的写法
   * @param {number} step 循环的步长
   * @param {string} continueOn continue 条件表达式
   * @param {string} breakOn break 条件表达式
   * @return {*}
   */
  runForOf(context, {
    key, value, data, range, step,
    continueOn, breakOn
  }) {
    // 指定了范围的时候，将范围解析成数组
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
      // 设置一个动态的数据变量
      // 将其名称设置到 data 上，
      // 以在后面的代码中使用与用户指定变量名时相同的逻辑
      data = getRandomVarName()
      context = {
        [data]: []
      }
      for (let i = from; i <= to; i++) {
        context[data].push(i)
      }
    }

    // 如果没有指定 key
    key = key || getRandomVarName()

    // 创建一个临时变量，
    // 用来存储数据
    // 避免与 context 中的项发生冲突
    const resultVarName = getRandomVarName()

    return this.runCode(`
    const ${resultVarName} = []
    for (let ${key} = 0; ${key} < ${data}.length; ${key}+=${step}) {
      const ${value} = ${data}[${key}]
      ${getContinueStatement(continueOn)}
      ${getBreakStatement(breakOn)}
      ${resultVarName}.push({
       ${key},
       ${value}
      })
    }
    return ${resultVarName}`, context)
  },

  /**
   * 对象迭代
   * @param {{}} context
   * @param {string} key 迭代时的对象键名
   * @param {string} value 迭代时的对象键值
   * @param {string} data 待迭代的数据变量名
   * @param {string} continueOn continue 条件表达式
   * @param {string} breakOn break 条件表达式
   * @return {*}
   */
  runForIn(context, {
    key, value, data,
    continueOn, breakOn
  }) {
    // 未指定数据项键名时
    key = key || getRandomVarName()
    // 创建一个临时变量，
    // 用来存储数据
    // 避免与 context 中的项发生冲突
    const resultVarName = getRandomVarName()

    return this.runCode(`
    const ${resultVarName} = []
    for(const ${key} in ${data}) {
      if (!${data}.hasOwnProperty(${key})) {
        continue
      }
      const ${value} = ${data}[${key}]
      ${getContinueStatement(continueOn)}
      ${getBreakStatement(breakOn)}
      ${resultVarName}.push({
        ${key},
        ${value}
      })
    }
    return ${resultVarName}`, context)
  },

  /**
   * 从上下文中计算表达式的值
   * @param {{}} context
   * @param {string} expression
   * @return {*}
   */
  getExpressionValue(context, expression) {
    return this.runCode(`return ${expression}`, context)
  },
  /**
   * 从字符串中解析表达式 {{}} 包围的内容
   * @param {string} content
   * @param {{}} context
   * @return {string}
   */
  resolveExpression(content, context) {
    if (/^\s*$/.test(content)) {
      return content
    }
    return content
      // 解析表达式
      .replace(/{{2}([\s\S]+?)}{2}/g, (input, exp) => {
        // 需要移除内容前后的空白字符
        const value = this.getExpressionValue(context, exp.trim())

        let strValue
        // 如果返回值是对象，那么在显示的时候，就处理成 JSON
        if (Object.prototype.toString.call(value) === '[object Object]') {
          strValue = JSON.stringify(value)
        } else {
          strValue = String(value)
        }
        // 保持原数据，用于 t-html 的渲染
        if (context.__useRawHTML) {
          return strValue
        }
        // 转义 <> 符号
        // 避免注入脚本
        return strValue.replace(/[<>]/g, match => {
          return match === '<' ? '&lt;' : '&gt;'
        })
      })
  }
}
