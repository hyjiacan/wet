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
   */
  runForOf(context, varName, dataName) {
    return this.runCode(`return ${dataName}.map(item => item)`, context)
  },

  /**
   * 对象迭代
   */
  runForIn(context, varName, dataName) {
    return this.runCode(`
  const data = []
  for(const key in ${dataName}) {
    const value = ${dataName}[key]
    data.push({
      key,
      value
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
