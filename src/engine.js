// simple javascript template engine

const crypto = require('crypto')
const htmlParser = require('./htmlparser')

// htmlparser 解析出的树缓存
const DOM_CACHE = {}

// 用于渲染树的节点缓存
const TREE_CACHE = {}

// 允许的标签
const TAGS = {
  IF: 't-if',
  ELSE: 't-else',
  ELIF: 't-elif',
  FOR: 't-for',
  WITH: 't-with',
  TREE: 't-tree',
  CHILDREN: 't-children'
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
  return runCode(`return ${dataName}.map(item => item)`, context)
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
      key,
      value
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
      [varName]: item
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
    return '<!-- -->'
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
    return '<!-- -->'
  }

  return parseChildren(children, context)
}

/**
 * 渲染 with 语法
 * @param attributes
 * @param children
 * @param context
 */
function renderWith(attributes, children, context) {
  const alias = {}
  let hasKey = false
  for (const varName in attributes) {
    hasKey = true
    const expression = attributes[varName]

    alias[varName] = runCode(`return ${expression}`, context)
  }

  if (!hasKey) {
    throw new Error('Must specify at least one attribute for t-with')
  }

  return parseChildren(children, {
    ...context,
    ...alias
  })
}

/**
 * 渲染 tree 语法
 * @param attributes
 * @param children
 * @param context
 */
function renderTree(attributes, children, context) {
  if (!attributes.hasOwnProperty('on')) {
    throw new Error('Missing attribute "on" for t-tree')
  }

  const expression = attributes.on
  // 树数据的变量名称与树项的变量名称
  const [treeName, varName] = expression.split(' as ')
  let treeData = context[treeName]
  if (!Array.isArray(treeData)) {
    throw new Error(`Data must be an Array for t-tree: ${treeName}`)
  }

  const treeId = `${new Date().getTime()}${Math.round(Math.random() * 1000)}`

  TREE_CACHE[treeId] = {
    children,
    varName
  }

  const result = renderTreeChildren(treeData, treeId, context)

  delete TREE_CACHE[treeId]

  return result
}

function renderTreeChildren(data, treeId, context) {
  const {children, varName} = TREE_CACHE[treeId]
  return data.map(item => {
    return parseChildren(children, {
      __tree_id__: treeId,
      ...context,
      [varName]: item
    })
  }).join('')
}

function renderChildren(attrs, context) {
  const treeId = context.__tree_id__
  const field = attrs.field || 'children'
  const {varName} = TREE_CACHE[treeId]
  const data = context[varName][field]
  // 没有子元素了
  if (!data) {
    return ''
  }
  return renderTreeChildren(data, treeId, context)
}

function parseChildren(children, context) {
  return children.map(element => {
    return parseElement(element, context)
  }).join('').replace(/{{2}(.+?)}{2}/g, (input, exp) => {
    return getObjectValue(context, exp)
  })
}

function renderTemplateTag({tag}, children) {
  return `<!-- ${tag} begin -->
${children}
<!-- ${tag} end -->`
}

function parseElement(node, context) {
  const {type, raw} = node
  if (type === htmlParser.NODE_TYPES.DOCUMENT_TYPE_NODE) {
    return raw
  }

  if (type === htmlParser.NODE_TYPES.TEXT_NODE ||
    type === htmlParser.NODE_TYPES.COMMENT_NODE ||
    type === htmlParser.NODE_TYPES.CDATA_SECTION_NODE) {
    // if (node.prev && isTemplateTag(node.prev) && /^\s*$/.test(raw)) {
    //   return ''
    // }
    return raw.replace(/{{2}(.+?)}{2}/g, (input, exp) => {
      return getObjectValue(context, exp)
    })
  }

  const {tag, attrs, children} = node

  let content = ''

  if (tag === TAGS.FOR) {
    return renderTemplateTag(node, renderFor(attrs, children, context))
  }

  if (tag === TAGS.IF) {
    return renderTemplateTag(node, renderIf(attrs, children, context, node))
  }

  if (tag === TAGS.ELIF) {
    return renderTemplateTag(node, renderElif(attrs, children, context, node))
  }

  if (tag === TAGS.ELSE) {
    return renderTemplateTag(node, renderElse(attrs, children, context, node))
  }

  if (tag === TAGS.WITH) {
    return renderTemplateTag(node, renderWith(attrs, children, context))
  }

  if (tag === TAGS.TREE) {
    return renderTemplateTag(node, renderTree(attrs, children, context, node))
  }

  if (tag === TAGS.CHILDREN) {
    return renderChildren(attrs, context)
  }

  const childrenElements = children ? children.map(child => parseElement(child, context)) : []
  content = `<${tag}${node.attrsString}>${childrenElements.join('')}</${tag}>`
  return content
}

function parseDOM(content, cache) {
  if (!cache) {
    return htmlParser.parse(content)
  }
  // 读取内容的md5
  const md5 = crypto.createHash('md5').update(content).digest('hex')
  if (DOM_CACHE.hasOwnProperty(md5)) {
    return DOM_CACHE[md5]
  }
  return DOM_CACHE[md5] = htmlParser.parse(content)
}

/**
 *
 * @param content
 * @param context
 * @param {object} [options]
 * @param {boolean} [options.cache=false]
 * @return {string}
 */
function render(content, context, options) {
  options = {
    cache: false,
    ...options
  }

  const start = new Date().getTime()
  const dom = parseDOM(content, options.cache)
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
