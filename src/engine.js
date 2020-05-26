// simple javascript template engine

const htmlParser = require('./htmlparser')

// 允许的标签
const TAGS = {
  IF: 't-if',
  FOR: 't-for'
}

/**
 * 运行动态代码
 * @param code
 * @param context
 * @return {*}
 */
function runCode(code, context) {
  return new Function(`{${Object.keys(context).join(',')}}`, code)(context)
}

/**
 * 数组迭代
 */
function runForOf(context, varName, dataName) {
  return runCode(`return ${dataName}.map(${varName} => ${varName})`, context)
}

/**
 * 对象迭代
 */
function runForIn(context, varName, dataName) {
  return runCode(`
  const data = []
  for(const key in ${dataName}) {
    const value = ${dataName}[key]
    data.push({
      ${varName}: {
        key,
        value
      }
    })
  }
  return data`)
}

/**
 * 从对象中获取值
 * @param obj
 * @param valueNames
 * @return {*}
 */
function getObjectValue(obj, valueNames) {
  return runCode(`return ${valueNames}`, obj)
}

/**
 * 渲染 For 结构，包括 for...in 和 for...of
 * @param attributes
 * @param children
 * @param context
 * @return {[]}
 */
function renderFor(attributes, children, context) {
  if (!attributes.hasOwnProperty('loop')) {
    throw new Error('Missing attribute "loop" for t-for')
  }
  const expression = attributes.loop
  const temp = expression.split(' ')

  const varName = temp[0]
  const operator = temp[1]
  const data = temp[2]

  let loopContext
  if (operator === 'of') {
    loopContext = runForOf(context, varName, data)
  } else if (operator === 'in') {
    loopContext = runForIn(context, varName, data)
  }

  const result = []

  for (const item of loopContext) {
    const itemContext = {
      ...context,
      [varName]: item
    }
    result.push(parseChildren(children, itemContext))
  }
  return result.join('')
}

function renderIf(attributes, children, context) {
  if (!attributes.hasOwnProperty('on')) {
    throw new Error('Missing attribute "on" for t-if')
  }
  const expression = attributes.on
  const result = getObjectValue(context, expression)
  if (!result) {
    return ''
  }

  return parseChildren(children, context)
}

function parseChildren(children, context) {
  return children.map(element => {
    return parseElement(element, context)
  }).join('').replace(/\{\{(.+?)\}\}/g, (input, exp) => {
    return getObjectValue(context, exp)
  })
}

function parseElement({type, raw, tag, attrs, attrsString, children}, context) {
  if (type === htmlParser.NODE_TYPES.DOCUMENT_TYPE_NODE) {
    return raw
  }

  if (type === htmlParser.NODE_TYPES.TEXT_NODE) {
    return raw.replace(/\{\{(.+?)\}\}/g, (input, exp) => {
      return getObjectValue(context, exp)
    })
  }

  let content = ''

  if (tag === TAGS.FOR) {
    return renderFor(attrs, children, context)
  }

  if (tag === TAGS.IF) {
    return renderIf(attrs, children, context)
  }

  const childrenElements = children ? children.map(child => parseElement(child, context)) : []

  content = `<${tag}${attrsString}>${childrenElements.join('')}</${tag}>`
  return content
}

function render(content, context) {
  return new Promise((resolve, reject) => {
    const start = new Date().getTime()
    try {
      const dom = htmlParser.parse(content)
      const html = dom.map(element => {
        return parseElement(element, context)
      }).join('')
      const end = new Date().getTime()
      resolve(html.replace('@{timestamp}@', (end - start).toFixed(3)))
    } catch (e) {
      reject(e)
    }
  })
}

const jst = {
  /**
   * 根据模板内容渲染 html
   * @param {string} content
   * @param {object} context
   * @return {string}
   */
  async render(content, context) {
    return render(content, context)
  }
}

module.exports = jst
