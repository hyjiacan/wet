// simple javascript template engine

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const util = require('util')
const htmlParser = require('./htmlparser')

// htmlparser 解析出的树缓存
const DOM_CACHE = {}

// 允许的标签
const TAGS = {
  IF: 't-if',
  ELSE: 't-else',
  ELIF: 't-elif',
  FOR: 't-for',
  WITH: 't-with',
  TREE: 't-tree',
  CHILDREN: 't-children',
  INCLUDE: 't-include'
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

function resolveExpression(content, context) {
  return content.replace(/{{2}([\s\S]+?)}{2}/g, (input, exp) => {
    // 移除表达式前后的空白字符
    return getObjectValue(context, exp.trim())
  })
}

function renderTemplateTag({tag}, children) {
  return `<!-- ${tag.toUpperCase()} BEGIN -->
${children}
<!-- ${tag.toUpperCase()} END -->`
}

function fillChars() {

}

function raiseTemplateError(options, node, e) {
  let msg
  let level = 0
  if (e instanceof ParseError) {
    level = e.level + 1
    msg = `${e.message}
\t${' '.padStart(level * 2, ' ')}${node.line}: ${node.raw.trim()}`
  } else {
    msg = `${e.message}
\t${options.filename}:${node.line}
\t${node.line}: ${node.raw.trim()}
\t${''.padStart(node.line.toString().length + 2, ' ')}${''.padStart(node.raw.trim().length, '^')}`
  }
  throw new ParseError(msg, level)
}

class ParseError extends Error {
  constructor(message, level) {
    super(message)
    this.name = 'ParseError'
    this.level = level || 0
  }
}

class Engine {
  // 用于渲染树的节点缓存
  TREE_CACHE = {}

  /**
   *
   * @param content
   * @param context
   * @param {object} [options]
   * @param {boolean} [options.cache=false]
   * @param {boolean} [options.filename] 模板文件路径
   */
  constructor(content, context, options) {
    this.content = content
    this.context = context
    this.options = {
      cache: false,
      ...options
    }
  }

  async render() {
    // TODO 把耗时写入 context 中，和其它的表达式一样的用法
    const start = new Date().getTime()
    const dom = this.parseDOM(this.content, this.options.cache)
    const html = await Promise.all(dom.map(async element => {
      return await this.parseElement(element, this.context)
    }))
    const end = new Date().getTime()
    return html.join('').replace('@{timestamp}@', (end - start).toString())
  }

  async parseElement(node, context) {
    const {type, raw} = node
    if (type === htmlParser.NODE_TYPES.DOCUMENT_TYPE_NODE) {
      return raw
    }
    try {
      if (type === htmlParser.NODE_TYPES.TEXT_NODE ||
        type === htmlParser.NODE_TYPES.COMMENT_NODE ||
        type === htmlParser.NODE_TYPES.CDATA_SECTION_NODE) {
        // if (node.prev && isTemplateTag(node.prev) && /^\s*$/.test(raw)) {
        //   return ''
        // }
        return resolveExpression(raw, context)
      }

      const {tag, children} = node

      if (tag === TAGS.FOR) {
        return renderTemplateTag(node, await this.renderFor(node, context))
      }

      if (tag === TAGS.IF) {
        return renderTemplateTag(node, await this.renderIf(node, context))
      }

      if (tag === TAGS.ELIF) {
        return renderTemplateTag(node, await this.renderElif(node, context))
      }

      if (tag === TAGS.ELSE) {
        return renderTemplateTag(node, await this.renderElse(node, context))
      }

      if (tag === TAGS.WITH) {
        return renderTemplateTag(node, await this.renderWith(node, context))
      }

      if (tag === TAGS.TREE) {
        return renderTemplateTag(node, await this.renderTree(node, context))
      }

      if (tag === TAGS.CHILDREN) {
        return this.renderChildren(node, context)
      }

      if (tag === TAGS.INCLUDE) {
        return renderTemplateTag(node, await this.renderInclude(node, context))
      }

      const childrenElements = children ? await Promise.all(children.map(async child => await this.parseElement(child, context))) : []
      const parsedAttrs = resolveExpression(node.attrsString, context)
      return `<${tag}${parsedAttrs}>${childrenElements.join('')}</${tag}>`
    } catch (e) {
      raiseTemplateError(this.options, node, e)
    }
  }

  parseDOM(content, cache) {
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

  async parseChildren(children, context) {
    const temp = await Promise.all(children.map(async element => {
      return await this.parseElement(element, context)
    }))

    return resolveExpression(temp.join(''), context)
  }

  /**
   * 渲染 For 结构，包括 for...in 和 for...of
   * @param node
   * @param context
   * @return {string}
   */
  async renderFor(node, context) {
    const {attrs, children} = node
    if (!attrs.hasOwnProperty('on')) {
      throw new Error('Missing attribute "on" for t-for')
    }
    const expression = attrs.on
    const temp = expression.split(' ')

    const varName = temp[0]
    const operator = temp[1]
    const dataName = temp[2]

    let loopContext
    if (operator === 'of') {
      loopContext = runForOf(context, varName, dataName)
    } else if (operator === 'in') {
      loopContext = runForIn(context, varName, dataName)
    }

    const result = []

    for (const item of loopContext) {
      const itemContext = {
        ...context,
        [varName]: item
      }
      result.push(await this.parseChildren(children, itemContext))
    }
    return result.join('')
  }

  async renderCondition(node, context) {
    const {attrs, children} = node
    const expression = attrs.on
    const result = getObjectValue(context, expression)

    // 给否则条件设置值
    const nextNode = node.nextElement
    if (nextNode && (nextNode.tag === TAGS.ELSE || nextNode.tag === TAGS.ELIF)) {
      nextNode.__condition__ = !result
    }

    if (!result) {
      return '<!-- FALSE -->'
    }

    return await this.parseChildren(children, context)
  }

  renderIf(node, context) {
    if (!node.attrs.hasOwnProperty('on')) {
      throw new Error('Missing attribute "on" for t-if')
    }
    return this.renderCondition(node, context)
  }

  renderElif(node, context) {
    if (!node.attrs.hasOwnProperty('on')) {
      throw new Error('Missing attribute "on" for t-elif')
    }

    if (!node.hasOwnProperty('__condition__')) {
      throw new Error('t-elif must after t-if or t-elif')
    }

    return this.renderCondition(node, context)
  }

  async renderElse(node, context) {
    if (!node.hasOwnProperty('__condition__')) {
      throw new Error('t-else must after t-if or t-elif')
    }

    if (!node.__condition__) {
      return '<!-- FALSE -->'
    }

    return await this.parseChildren(node.children, context)
  }

  /**
   * 渲染 with 语法
   * @param node
   * @param context
   */
  async renderWith(node, context) {
    const {attrs, children} = node
    const alias = {}
    let hasKey = false
    for (const varName in attrs) {
      if (!attrs.hasOwnProperty(varName)) {
        continue
      }
      hasKey = true
      const expression = attrs[varName]

      alias[varName] = runCode(`return ${expression}`, context)
    }

    if (!hasKey) {
      throw new Error('Must specify at least one attribute for t-with')
    }

    return await this.parseChildren(children, {
      ...context,
      ...alias
    })
  }

  /**
   * 渲染 tree 语法
   * @param node
   * @param context
   */
  renderTree(node, context) {
    const {attrs, children} = node
    if (!attrs.hasOwnProperty('on')) {
      throw new Error('Missing attribute "on" for t-tree')
    }

    const expression = attrs.on
    // 树数据的变量名称与树项的变量名称
    const [treeName, varName] = expression.split(' as ')
    let treeData = context[treeName]
    if (!Array.isArray(treeData)) {
      throw new Error(`Data must be an Array for t-tree: ${treeName}`)
    }

    const treeId = `${new Date().getTime()}${Math.round(Math.random() * 1000)}`

    this.TREE_CACHE[treeId] = {
      children,
      varName
    }

    const result = this.renderTreeChildren(treeData, treeId, context)

    delete this.TREE_CACHE[treeId]

    return result
  }

  async renderTreeChildren(data, treeId, context) {
    const {children, varName} = this.TREE_CACHE[treeId]
    const temp = await Promise.all(data.map(async item => {
      return await this.parseChildren(children, {
        __tree_id__: treeId,
        ...context,
        [varName]: item
      })
    }))
    return temp.join('')
  }

  renderChildren({attrs}, context) {
    const treeId = context.__tree_id__
    const field = attrs.field || 'children'
    const {varName} = this.TREE_CACHE[treeId]
    const data = context[varName][field]
    // 没有子元素了
    if (!data) {
      return ''
    }
    return this.renderTreeChildren(data, treeId, context)
  }

  /**
   *
   * @param attrs
   * @param context
   * @return {*}
   */
  async renderInclude({attrs}, context) {
    const file = path.resolve(path.join(path.dirname(this.options.filename), attrs.file))
    return await render(file, context, {
      ...this.options,
      filename: file
    })
  }
}

async function render(filename, context, options) {
  const buffer = await util.promisify(fs.readFile)(filename, {
    flag: 'r'
  })

  const engine = new Engine(buffer.toString('utf-8'), context, {
    filename: filename,
    ...options
  })
  return await engine.render()
}

module.exports = {
  render
}
