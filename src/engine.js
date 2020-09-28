// simple javascript template engine

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const util = require('util')
const {Node, parse} = require('./htmlparser')
const runner = require('./coderunner')
const TAGS = require('./tags')
const ParseError = require('./parse-error')

// htmlparser 解析出的树缓存
const DOM_CACHE = Object.create(null)

function raiseTemplateError(options, node, e) {
  let msg
  let level = 0
  if (e instanceof ParseError) {
    level = e.level + 1
    msg = `${e.message}
${node.line.toString().padStart(5, ' ')}:${''.padStart(level, ' ')} ${node.raw.trim()}`
  } else {
    const lineNumber = node.line.toString()
    const paddedLineNumber = lineNumber.padStart(5, ' ')
    const raw = node.raw.trim()
    msg = `${e.message}
${options.filename}:${lineNumber}
${paddedLineNumber}: ${raw}
${''.padStart(paddedLineNumber.length + 2, ' ')}${''.padStart(raw.length, '^')}`
  }
  throw new ParseError(msg, level)
}

class Engine {
  /**
   *
   * @param content
   * @param context
   * @param {{}} [options]
   * @param {boolean} [options.debug=false]
   * @param {boolean} [options.cache=false]
   * @param {boolean} [options.filename] 模板文件路径
   */
  constructor(content, context, options) {
    // 用于渲染树的节点缓存
    this.TREE_CACHE = Object.create(null)
    this.content = content
    this.context = context
    this.options = {
      cache: false,
      ...options
    }
  }

  async render() {
    const dom = this.parseDOM(this.content, this.options.cache)
    const html = await Promise.all(dom.map(element => {
      return this.parseElement(element, this.context)
    }))
    return html.join('')
      // 处理不需要被解析的 {{ }} 符号
      .replace(/{!{/g, '{{')
      .replace(/}!}/g, '}}')
  }


  /**
   *
   * @param {Node} node
   * @param children
   * @return {string|*}
   */
  renderTemplateTag({tagName}, children) {
    if (!this.options.debug) {
      return children
    }
    return `<!-- ${tagName} BEGIN -->
${children}
<!-- ${tagName} END -->`
  }

  /**
   *
   * @param {Node} node
   * @param {Object} context
   * @return {Promise<boolean|string>}
   */
  async renderTemplateTags(node, context) {
    switch (node.tagName) {
      case TAGS.FOR:
        return this.renderTemplateTag(node, await this.renderFor(node, context))
      case TAGS.IF:
        return this.renderTemplateTag(node, await this.renderIf(node, context))
      case TAGS.ELIF:
        return this.renderTemplateTag(node, await this.renderElif(node, context))
      case TAGS.ELSE:
        return this.renderTemplateTag(node, await this.renderElse(node, context))
      case TAGS.WITH:
        return this.renderTemplateTag(node, await this.renderWith(node, context))
      case TAGS.TREE:
        return this.renderTemplateTag(node, await this.renderTree(node, context))
      case TAGS.CHILDREN:
        return this.renderTemplateTag(node, this.prepareTreeChildren(node, context))
      case TAGS.INCLUDE:
        return this.renderTemplateTag(node, await this.renderInclude(node, context))
      case TAGS.HTML:
        return this.renderTemplateTag(node, await this.renderHTML(node, context))
      case TAGS.HOLE:
        return this.renderTemplateTag(node, await this.renderHole(node, context))
      case TAGS.FILL:
        throw new Error(`${TAGS.FILL} must be a child of ${TAGS.INCLUDE}`)
      default:
        return false
    }
  }

  async parseElement(node, context) {
    const {nodeType, raw} = node
    if (nodeType === Node.DOCUMENT_TYPE_NODE) {
      return raw
    }
    try {
      switch (nodeType) {
        case  Node.TEXT_NODE:
          return runner.resolveExpression(raw, context)
        case Node.COMMENT_NODE:
        case Node.CDATA_SECTION_NODE:
          return raw
      }

      const result = await this.renderTemplateTags(node, context)
      if (result !== false) {
        return result
      }

      const {tagName, childNodes} = node

      let childrenElements = []
      if (childNodes) {
        childrenElements = await Promise.all(childNodes.map(async child => await this.parseElement(child, context)))
      }
      const parsedAttrs = runner.resolveExpression(node.attrsString, context)
      return `<${tagName.toLowerCase()}${parsedAttrs ? ' ' : ''}${parsedAttrs}>${childrenElements.join('')}</${tagName.toLowerCase()}>`
    } catch (e) {
      raiseTemplateError(this.options, node, e)
    }
  }

  parseDOM(content, cache) {
    if (!cache) {
      // 调用 htmlParser.parse
      return parse(content)
    }
    // 读取内容的md5
    const md5 = crypto.createHash('md5').update(content).digest('hex')
    if (md5 in DOM_CACHE) {
      return DOM_CACHE[md5]
    }
    return DOM_CACHE[md5] = parse(content)
  }

  async parseChildren(children, context) {
    const temp = await Promise.all(children.map(async element => {
      return await this.parseElement(element, context)
    }))

    return runner.resolveExpression(temp.join(''), context)
  }

  /**
   * 渲染 For 结构，包括 for...in 和 for...of
   * @param node
   * @param context
   * @return {string}
   */
  async renderFor(node, context) {
    const {attributes, childNodes} = node
    if (!(attributes.hasOwnProperty('on'))) {
      throw new Error(`Missing attribute "on" for ${TAGS.FOR}`)
    }
    const expression = attributes.on.value

    // array:
    // for item of array
    // for item, index of array
    // for item of 10
    // for item of 1-10
    // object:
    // for item in object
    // for value, key in object
    const match = /^(?<value>[$0-9a-zA-Z_]+)(\s*,\s*(?<key>[$0-9a-zA-Z_]+))?\s+(?<operator>(of|in))\s+((?<data>[$a-zA-Z_][$0-9a-zA-Z_.]*)|(?<range>[0-9]+(-[0-9]+)?))$/.exec(expression)
    if (!match) {
      throw new Error(`Invalid ${TAGS.FOR} expression: ${expression}`)
    }

    const {value, key, operator, data, range} = match.groups
    // continue 条件
    const continueOn = attributes.hasOwnProperty('continue') ? attributes['continue'].value : ''
    // break 条件
    const breakOn = attributes.hasOwnProperty('break') ? attributes['break'].value : ''

    let loopContext
    if (operator === 'of') {
      // 步长
      const step = attributes.hasOwnProperty('step') ? parseInt(attributes.step.value) : 1
      if (!step || step < 0) {
        throw new Error(`Invalid "step" value of ${TAGS.FOR}: ${step}`)
      }
      loopContext = runner.runForOf(context, {
        value,
        key,
        data,
        range,
        step,
        continueOn,
        breakOn
      })
    } else if (operator === 'in') {
      loopContext = runner.runForIn(context, {
        value,
        key,
        data,
        continueOn,
        breakOn
      })
    }

    const result = []

    for (const item of loopContext) {
      const itemContext = {
        ...context,
        ...item
      }
      const parsedChildren = await this.parseChildren(childNodes, itemContext)
      result.push(parsedChildren)
    }
    return result.join('')
  }

  async renderCondition(node, context) {
    const {attributes, childNodes} = node
    const expression = attributes.on.value

    const result = runner.getExpressionValue(context, expression)

    // 给否则条件设置值
    const nextNode = node.nextElementSibling
    if (nextNode && (nextNode.tagName === TAGS.ELSE || nextNode.tagName === TAGS.ELIF)) {
      nextNode.__prev_condition_result__ = node.__prev_condition_result__ || result
    }

    if (!result) {
      return this.options.debug ? '<!-- FALSE -->' : ''
    }

    return await this.parseChildren(childNodes, context)
  }

  renderIf(node, context) {
    if (!(node.attributes.hasOwnProperty('on'))) {
      throw new Error(`Missing attribute "on" for ${TAGS.IF}`)
    }
    return this.renderCondition(node, context)
  }

  renderElif(node, context) {
    if (!(node.attributes.hasOwnProperty('on'))) {
      throw new Error(`Missing attribute "on" for ${TAGS.ELIF}`)
    }

    if (!(node.hasOwnProperty('__prev_condition_result__'))) {
      throw new Error(`${TAGS.ELIF} must behind ${TAGS.IF} or ${TAGS.ELIF}`)
    }

    return this.renderCondition(node, context)
  }

  async renderElse(node, context) {
    if (!(node.hasOwnProperty('__prev_condition_result__'))) {
      throw new Error(`${TAGS.ELSE} must behind ${TAGS.IF} or ${TAGS.ELIF}`)
    }

    if (node.__prev_condition_result__) {
      return this.options.debug ? '<!-- FALSE -->' : ''
    }

    return await this.parseChildren(node.childNodes, context)
  }

  /**
   * 渲染 with 语法
   * @param node
   * @param context
   */
  async renderWith(node, context) {
    const {attributes, childNodes} = node
    const alias = Object.create(null)

    if (!attributes.length) {
      throw new Error(`Must specify at least one attribute for ${TAGS.WITH}`)
    }

    for (const attribute of attributes) {
      alias[attribute.name] = runner.runCode(`return ${attribute.value}`, context)
    }

    return await this.parseChildren(childNodes, {
      ...context,
      ...alias
    })
  }

  /**
   * 渲染 tree 语法
   * @param node
   * @param context
   */
  async renderTree(node, context) {
    const {attributes, childNodes} = node
    if (!(attributes.hasOwnProperty('on'))) {
      throw new Error(`Missing attribute "on" for ${TAGS.TREE}`)
    }

    const expression = attributes.on.value
    // 树数据的变量名称与树项的变量名称
    const [treeName, varName] = expression.split(' as ')
    let treeData = context[treeName]
    if (!Array.isArray(treeData)) {
      throw new Error(`Data must be an Array for ${TAGS.TREE}: ${treeName}`)
    }

    const treeId = `${new Date().getTime()}${Math.round(Math.random() * 1000)}`

    this.TREE_CACHE[treeId] = {
      children: childNodes,
      varName
    }

    const result = await this.renderTreeChildren(treeData, treeId, context)

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

  /**
   *
   * @param {Node} node
   * @param {{field: string}} node.attributes
   * @param context
   * @return {string|Promise<*>}
   */
  prepareTreeChildren({attributes}, context) {
    const treeId = context.__tree_id__
    const field = attributes.hasOwnProperty('field') ? attributes.field.value : 'children'
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
   * @param attributes
   * @param childNodes
   * @param context
   * @return {*}
   */
  async renderInclude({attributes, childNodes}, context) {
    // 避免污染父级
    context = {
      ...context,
      // 存放 hole 的集合
      __include_holes__: Object.create(null),
      // 存放 fill 的集合
      __include_fills__: Object.create(null)
    }

    // 收集 fills
    await Promise.all(childNodes.map(async child => {
      const {attributes, tagName, childNodes, isElement} = child
      if (!isElement) {
        return
      }
      if (tagName !== TAGS.FILL) {
        raiseTemplateError(this.options, child, new Error(`${TAGS.INCLUDE} can only contain ${TAGS.FILL} as child`))
      }
      const name = attributes.hasOwnProperty('name') ? attributes.name : ''
      if (name in context.__include_fills__) {
        if (name === '') {
          raiseTemplateError(this.options, child, new Error(`Default ${TAGS.FILL} can only appear once`))
        }
        raiseTemplateError(this.options, child, new Error(`${TAGS.FILL} name must be unique: ${name}`))
      }
      context.__include_fills__[name] = null
      context.__include_fills__[name] = this.renderTemplateTag(child, await this.parseChildren(childNodes, context))
    }))


    if (!(attributes.hasOwnProperty('file'))) {
      throw new Error(`Missing attribute "file" for ${TAGS.INCLUDE}`)
    }

    const file = path.resolve(path.join(path.dirname(this.options.filename), attributes.file.value))
    return await render(file, context, {
      ...this.options,
      filename: file
    })
  }

  /**
   *
   * @param node
   * @param context
   * @return {*}
   */
  async renderHole(node, context) {
    const {attributes, childNodes} = node
    // hole name
    const name = attributes.hasOwnProperty('name') ? attributes.name.value : ''
    // 出现多次
    if (name in context.__include_holes__) {
      if (name === '') {
        throw new Error(`Default ${TAGS.HOLE} can only appear once`)
      }

      throw new Error(`${TAGS.HOLE} name must be unique: ${name}`)
    }

    context.__include_holes__[name] = Object.create(null)

    if (context.__include_fills__[name]) {
      return context.__include_fills__[name]
    }
    return this.parseChildren(childNodes, context)
  }

  /**
   *
   * @param node
   * @param node.childNodes
   * @param context
   * @return {*}
   */
  async renderHTML({childNodes}, context) {
    return await this.parseChildren(childNodes, {
      ...context,
      __useRawHTML: true
    })
  }
}

/**
 *
 * @param filename
 * @param {{}} context
 * @param {{}} options
 * @param {boolean} [options.cache=false]
 * @param {boolean} [options.debug=true]
 * @return {Promise<string>}
 */
async function render(filename, context, options) {
  const start = process.hrtime()
  // 获取绝对路径
  filename = path.resolve(filename)
  const buffer = await util.promisify(fs.readFile)(filename, {
    flag: 'r'
  })

  const engine = new Engine(buffer.toString('utf-8'), context, {
    filename: filename,
    debug: true,
    cache: true,
    ...options
  })
  const result = await engine.render()
  const [ms, ns] = process.hrtime(start)
  return result.replace('@{timestamp}@', (ms + (ns / 1e9)).toFixed(6))
}

module.exports = {
  render
}
