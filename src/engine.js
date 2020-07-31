// simple javascript template engine

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const util = require('util')
const {parse, NODE_TYPES} = require('./htmlparser')
const runner = require('./coderunner')

// htmlparser 解析出的树缓存
const DOM_CACHE = {}

// 模板标签
const TAGS = {
  IF: 't-if',
  ELSE: 't-else',
  ELIF: 't-elif',
  FOR: 't-for',
  WITH: 't-with',
  TREE: 't-tree',
  CHILDREN: 't-children',
  INCLUDE: 't-include',
  HTML: 't-html',
  HOLE: 't-hole',
  FILL: 't-fill'
}

function resolveExpression(content, context) {
  return content
    // 解析表达式
    .replace(/{{2}([\s\S]+?)}{2}/g, (input, exp) => {
      // 移除表达式前后的空白字符
      let value = runner.getExpressionValue(context, exp.trim())
      if (typeof value === 'object' && value.constructor && value.constructor.name === 'Object') {
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

function renderTemplateTag({tag}, children) {
  return `<!-- ${tag.toUpperCase()} BEGIN -->
${children}
<!-- ${tag.toUpperCase()} END -->`
}

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

class ParseError extends Error {
  constructor(message, level) {
    super(message)
    this.name = 'ParseError'
    this.level = level || 0
  }
}

class Engine {
  /**
   *
   * @param content
   * @param context
   * @param {object} [options]
   * @param {boolean} [options.cache=false]
   * @param {boolean} [options.filename] 模板文件路径
   */
  constructor(content, context, options) {
    // 用于渲染树的节点缓存
    this.TREE_CACHE = {}
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
   * @param {Object} context
   * @return {Promise<boolean|string>}
   */
  async renderTemplateTags(node, context) {
    const tag = node.tag

    switch (node.tag) {
      case TAGS.FOR:
        return renderTemplateTag(node, await this.renderFor(node, context))
      case TAGS.IF:
        return renderTemplateTag(node, await this.renderIf(node, context))
      case TAGS.ELIF:
        return renderTemplateTag(node, await this.renderElif(node, context))
      case TAGS.ELSE:
        return renderTemplateTag(node, await this.renderElse(node, context))
      case TAGS.WITH:
        return renderTemplateTag(node, await this.renderWith(node, context))
      case TAGS.TREE:
        return renderTemplateTag(node, await this.renderTree(node, context))
      case TAGS.CHILDREN:
        return this.prepareTreeChildren(node, context)
      case TAGS.INCLUDE:
        return renderTemplateTag(node, await this.renderInclude(node, context))
      case TAGS.HTML:
        return renderTemplateTag(node, await this.renderHTML(node, context))
      case TAGS.HOLE:
        return renderTemplateTag(node, await this.renderHole(node, context))
      case TAGS.FILL:
        throw new Error(`${TAGS.FILL} must be a child of ${TAGS.INCLUDE}`)
      default:
        return false
    }
  }

  async parseElement(node, context) {
    const {type, raw} = node
    if (type === NODE_TYPES.DOCUMENT_TYPE_NODE) {
      return raw
    }
    try {
      if (type === NODE_TYPES.TEXT_NODE ||
        type === NODE_TYPES.COMMENT_NODE ||
        type === NODE_TYPES.CDATA_SECTION_NODE) {
        // if (node.prev && isTemplateTag(node.prev) && /^\s*$/.test(raw)) {
        //   return ''
        // }
        return resolveExpression(raw, context)
      }

      const result = await this.renderTemplateTags(node, context)
      if (result !== false) {
        return result
      }

      const {tag, children} = node

      let childrenElements = []
      if (children) {
        childrenElements = await Promise.all(children.map(async child => await this.parseElement(child, context)))
      }
      const parsedAttrs = resolveExpression(node.attrsString, context)
      return `<${tag}${parsedAttrs}>${childrenElements.join('')}</${tag}>`
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
    if (DOM_CACHE.hasOwnProperty(md5)) {
      return DOM_CACHE[md5]
    }
    return DOM_CACHE[md5] = parse(content)
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
      throw new Error(`Missing attribute "on" for ${TAGS.FOR}`)
    }
    const expression = attrs.on

    const match = /^(?<value>[$0-9a-zA-Z_]+)(\s*,\s*(?<key>[$0-9a-zA-Z_]+))?\s+(?<operator>(of|in))\s+((?<data>[$a-zA-Z_][$0-9a-zA-Z_.]*)|(?<range>[0-9]+(-[0-9]+)?))$/.exec(expression)
    if (!match) {
      throw new Error(`Invalid ${TAGS.FOR} expression: ${expression}`)
    }

    const {value, key, operator, data, range} = match.groups

    let loopContext
    if (operator === 'of') {
      const step = parseInt(attrs.step) || 1
      loopContext = runner.runForOf(context, {
        value,
        key,
        data,
        range,
        step
      })
    } else if (operator === 'in') {
      loopContext = runner.runForIn(context, {
        value,
        key,
        data
      })
    }

    const result = []

    for (const item of loopContext) {
      const itemContext = {
        ...context,
        ...item
      }
      const parsedChildren = await this.parseChildren(children, itemContext)
      result.push(parsedChildren)
    }
    return result.join('')
  }

  async renderCondition(node, context) {
    const {attrs, children} = node
    const expression = attrs.on

    const result = runner.getExpressionValue(context, expression)

    // 给否则条件设置值
    const nextNode = node.nextElement
    if (nextNode && (nextNode.tag === TAGS.ELSE || nextNode.tag === TAGS.ELIF)) {
      nextNode.__prev_condition_result__ = node.__prev_condition_result__ || result
    }

    if (!result) {
      return '<!-- FALSE -->'
    }

    return await this.parseChildren(children, context)
  }

  renderIf(node, context) {
    if (!node.attrs.hasOwnProperty('on')) {
      throw new Error(`Missing attribute "on" for ${TAGS.IF}`)
    }
    return this.renderCondition(node, context)
  }

  renderElif(node, context) {
    if (!node.attrs.hasOwnProperty('on')) {
      throw new Error(`Missing attribute "on" for ${TAGS.ELIF}`)
    }

    if (!node.hasOwnProperty('__prev_condition_result__')) {
      throw new Error(`${TAGS.ELIF} must behind ${TAGS.IF} or ${TAGS.ELIF}`)
    }

    return this.renderCondition(node, context)
  }

  async renderElse(node, context) {
    if (!node.hasOwnProperty('__prev_condition_result__')) {
      throw new Error(`${TAGS.ELSE} must behind ${TAGS.IF} or ${TAGS.ELIF}`)
    }

    if (node.__prev_condition_result__) {
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

      alias[varName] = runner.runCode(`return ${expression}`, context)
    }

    if (!hasKey) {
      throw new Error(`Must specify at least one attribute for ${TAGS.WITH}`)
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
  async renderTree(node, context) {
    const {attrs, children} = node
    if (!attrs.hasOwnProperty('on')) {
      throw new Error(`Missing attribute "on" for ${TAGS.TREE}`)
    }

    const expression = attrs.on
    // 树数据的变量名称与树项的变量名称
    const [treeName, varName] = expression.split(' as ')
    let treeData = context[treeName]
    if (!Array.isArray(treeData)) {
      throw new Error(`Data must be an Array for ${TAGS.TREE}: ${treeName}`)
    }

    const treeId = `${new Date().getTime()}${Math.round(Math.random() * 1000)}`

    this.TREE_CACHE[treeId] = {
      children,
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
   * @param {Object} node.attrs
   * @param {string} [node.attrs.field=children]
   * @param context
   * @return {string|Promise<*>}
   */
  prepareTreeChildren({attrs}, context) {
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
   * @param children
   * @param context
   * @return {*}
   */
  async renderInclude({attrs, children}, context) {
    // 避免污染父级
    context = {
      ...context,
      // 存放 hole 的集合
      __include_holes__: {},
      // 存放 fill 的集合
      __include_fills__: {}
    }
    const file = path.resolve(path.join(path.dirname(this.options.filename), attrs.file))

    // 收集 fills
    await Promise.all(children.map(async child => {
      const {attrs, tag, type, children} = child
      if (type !== NODE_TYPES.ELEMENT_NODE) {
        return
      }
      if (tag !== TAGS.FILL) {
        raiseTemplateError(this.options, child, new Error(`${TAGS.INCLUDE} can only contain ${TAGS.FILL} as child`))
      }
      const name = attrs.name || ''
      if (context.__include_fills__.hasOwnProperty(name)) {
        if (name === '') {
          raiseTemplateError(this.options, child, new Error(`Default ${TAGS.FILL} can only appear once`))
        }
        raiseTemplateError(this.options, child, new Error(`${TAGS.FILL} name must be unique: ${name}`))
      }
      context.__include_fills__[name] = null
      context.__include_fills__[name] = await this.parseChildren(children, context)
    }))

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
    const {attrs, children} = node
    // hole name
    const name = attrs.name || ''
    // 出现多次
    if (context.__include_holes__.hasOwnProperty(name)) {
      if (name === '') {
        throw new Error(`Default ${TAGS.HOLE} can only appear once`)
      }

      throw new Error(`${TAGS.HOLE} name must be unique: ${name}`)
    }

    context.__include_holes__[name] = {}

    if (context.__include_fills__[name]) {
      return context.__include_fills__[name]
    }
    return this.parseChildren(children, context)
  }

  /**
   *
   * @param node
   * @param node.children
   * @param context
   * @return {*}
   */
  async renderHTML({children}, context) {
    return await this.parseChildren(children, {
      ...context,
      __useRawHTML: true
    })
  }
}

async function render(filename, context, options) {
  const start = process.hrtime()
  // 获取绝对路径
  filename = path.resolve(filename)
  const buffer = await util.promisify(fs.readFile)(filename, {
    flag: 'r'
  })

  const engine = new Engine(buffer.toString('utf-8'), context, {
    filename: filename,
    ...options
  })
  const result = await engine.render()
  const [ms, ns] = process.hrtime(start)
  return result.replace('@{timestamp}@', (ms + (ns / 1e9)).toFixed(6))
}

module.exports = {
  render
}
