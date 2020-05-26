// simple javascript template engine

const htmlParser = require('./htmlparser')

// 允许的标签
const TAGS = {
  IF: 't-if',
  ELSE: 't-else',
  ELIF: 't-elif',
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
  return data`, context)
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
 * @return {string}
 */
function renderFor(attributes, children, context) {
  if (!attributes.hasOwnProperty('on')) {
    throw new Error('Missing attribute "on" for t-for')
  }
  const expression = attributes.on
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
      ...item
    }
    result.push(parseChildren(children, itemContext))
  }
  return result.join('')
}

function renderCondition(attributes, children, context, node) {
  const expression = attributes.on
  const result = getObjectValue(context, expression)

  // 给否则条件设置值
  const nextNode = node.nextElement
  if (nextNode && (nextNode.tag === TAGS.ELSE || nextNode.tag === TAGS.ELIF)) {
    nextNode.__condition__ = !result
  }

  if (!result) {
    return ''
  }

  return parseChildren(children, context)
}

function renderIf(attributes, children, context, node) {
  if (!attributes.hasOwnProperty('on')) {
    throw new Error('Missing attribute "on" for t-if')
  }
  return renderCondition(attributes, children, context, node)
}

function renderElif(attributes, children, context, node) {
  if (!attributes.hasOwnProperty('on')) {
    throw new Error('Missing attribute "on" for t-elif')
  }

  if (!node.hasOwnProperty('__condition__')) {
    throw new Error('t-elif must after t-if or t-elif')
  }

  return renderCondition(attributes, children, context, node)
}

function renderElse(attributes, children, context, node) {
  if (!node.hasOwnProperty('__condition__')) {
    throw new Error('t-else must after t-if or t-elif')
  }

  if (!node.__condition__) {
    return ''
  }

  return parseChildren(children, context)
}

function parseChildren(children, context) {
  return children.map(element => {
    return parseElement(element, context)
  }).join('').replace(/{{2}(.+?)}{2}/g, (input, exp) => {
    return getObjectValue(context, exp)
  })
}

function parseElement(node, context) {
  const {type, raw} = node
  if (type === htmlParser.NODE_TYPES.DOCUMENT_TYPE_NODE) {
    return raw
  }

  if (type === htmlParser.NODE_TYPES.TEXT_NODE) {
    return raw.replace(/{{2}(.+?)}{2}/g, (input, exp) => {
      return getObjectValue(context, exp)
    })
  }

  const {tag, attrs, children} = node

  let content = ''

  if (tag === TAGS.FOR) {
    return renderFor(attrs, children, context)
  }

  if (tag === TAGS.IF) {
    return renderIf(attrs, children, context, node)
  }

  if (tag === TAGS.ELIF) {
    return renderElif(attrs, children, context, node)
  }

  if (tag === TAGS.ELSE) {
    return renderElse(attrs, children, context, node)
  }

  const childrenElements = children ? children.map(child => parseElement(child, context)) : []

  content = `<${tag}${node.attrsString}>${childrenElements.join('')}</${tag}>`
  return content
}

function render(content, context) {
  const start = new Date().getTime()
  const dom = htmlParser.parse(content)
  const html = dom.map(element => {
    return parseElement(element, context)
  }).join('')
  const end = new Date().getTime()
  return html.replace('@{timestamp}@', (end - start).toString())
}

const jst = {
  /**
   * 根据模板内容渲染 html
   * @param {string} content
   * @param {object} context
   * @return {string}
   */
  render
}

module.exports = jst
