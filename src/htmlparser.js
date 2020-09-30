// 解析 html 字符串，得到 DOM 结构

const NamedNodeMap = require('./NamedNodeMap')

class Entity {
  /**
   *
   * @param {string} data
   * @param startLineNumber
   */
  constructor(data, startLineNumber) {
    this.data = data
    this.lineNumber = startLineNumber
    this.type = this._getEntityType(data)
    if (this.type !== Node.ELEMENT_NODE) {
      return
    }
    if (/^<\//.test(data)) {
      this.state = 'close'
    } else if (/\/>$/.test(data) || /^<(link|input|meta|img|hr)\s/i.test(data)) {
      this.state = 'self-close'
    } else {
      this.state = 'open'
    }
  }


  _getEntityType(data) {
    if (data.startsWith('<!--')) {
      return Node.COMMENT_NODE
    }
    if (data.startsWith('<!CDATA[[')) {
      return Node.CDATA_SECTION_NODE
    }
    if (data.startsWith('<?')) {
      return Node.PROCESSING_INSTRUCTION_NODE
    }
    if (/^<!doctype /i.test(data)) {
      return Node.DOCUMENT_TYPE_NODE
    }
    if (/^<[a-z_\-\/]/i.test(data)) {
      return Node.ELEMENT_NODE
    }

    return Node.TEXT_NODE
  }
}

function decode(text, remove) {
  return text.replace(/_@#![0-9]+!#@_/g, (placeholder) => {
    const value = PLACEHOLDERS[placeholder]
    if (remove) {
      delete PLACEHOLDERS[placeholder]
    }
    return value
  })
}

class Node {
  /**
   *
   * @param {Entity} [entity]
   */
  constructor(entity) {
    this.childNodes = []
    this.attributes = new NamedNodeMap()
    this.parentElement = null
    this._index = -1

    if (!entity) {
      return
    }
    this._raw = entity.data
    this.nodeType = entity.type
    this.lineNumber = entity.lineNumber

    if (this.isElement) {
      // 解析数据
      this._resolve(entity)
    }

    // 从 placeholder 中读取属性值
    this.raw = decode(decode(this._raw), true)
  }

  /**
   *
   * @param {Entity} [entity]
   */
  _resolve(entity) {
    if (entity.state === 'close') {
      const tagName = /^<\/([^\/>]+)>$/.exec(entity.data)[1]
      // 标签名称中可能包含变量
      this.tagName = decode(tagName).toUpperCase()
      return
    }

    const tagName = /^<([^\s\/>]+)/.exec(entity.data)[1]
    // 属性名称中可能包含变量
    this.tagName = decode(tagName).toUpperCase()

    // 读取属性，移除末尾的 > 符号和换行符
    const attrText = entity.data.substring(tagName.length + 1).replace(/\/?[>\r\n]+$/, '')
    const attrReg = /(?<name>[^\s=]+)(=(['"]?)(?<value>[\S]*)\3)?/ig

    let match
    while (true) {
      match = attrReg.exec(attrText)
      if (!match) {
        break
      }
      let value = PLACEHOLDERS[match.groups.value]
      // 空属性
      if (!value) {
        continue
      }

      const name = match.groups.name
      // 属性值中可能包含变量
      value = decode(value)

      this.attributes.setNamedItem({
        name,
        value
      })
    }
  }

  /**
   *
   * @param {Entity} [entity]
   */
  close(entity) {
    this.closed = true
  }

  /**
   *
   * @param {Node} node
   */
  appendChild(node) {
    node.parentElement = this
    node._index = this.childNodes.length
    this.childNodes.push(node)
  }

  /**
   *
   * @return {string}
   */
  get outerHTML() {
    // return this._raw

    if (!this.isElement) {
      return this.raw
    }

    const children = this.childNodes.map(item => item.outerHTML).join('')

    return `<${this.tagName}${this.attrsString}>${children}</${this.tagName}>`
  }


  /**
   *
   * @return {Node}
   */
  get nextSibling() {
    return this.parentElement.childNodes[this._index + 1]
  }

  /**
   *
   * @return {Node}
   */
  get nextElementSibling() {
    const next = this.nextSibling
    if (!next) {
      return null
    }
    // 当 next 是元素时，就返回 next
    // 否则返回 next.next
    if (next.isElement) {
      return next
    }
    return next.nextSibling
  }

  /**
   *
   * @return {Node}
   */
  get prevSibling() {
    return this.parentElement.childNodes[this._index - 1]
  }

  /**
   *
   * @return {Node}
   */
  get prevElementSibling() {
    const prev = this.prevSibling
    if (!prev) {
      return null
    }
    // 当 prev 是元素时，就返回 prev
    // 否则返回 prev.prev
    if (prev.isElement) {
      return prev
    }
    return prev.prevSibling
  }

  get attrsString() {
    if (!this.attributes.length) {
      return ''
    }
    return Array.from(this.attributes).map(attribute => {
      return `${attribute.name}="${attribute.value}"`
    }).join(' ')
  }

  get isElement() {
    return this.nodeType === Node.ELEMENT_NODE
  }
}

// NODE_TYPES
// @see https://developer.mozilla.org/zh-CN/docs/Web/API/Node/nodeType
Object.defineProperties(Node, {
  // 元素 节点，例如 <p> 和 <div>
  ELEMENT_NODE: {
    configurable: false,
    value: 1
  },
  // Element 或者 Attr 中实际的  文字
  TEXT_NODE: {
    configurable: false,
    value: 3
  },
  // CDATASection，例如 <!CDATA[[ … ]]>。
  CDATA_SECTION_NODE: {
    configurable: false,
    value: 4
  },
  // Comment 节点
  COMMENT_NODE: {
    configurable: false,
    value: 8
  },
  // 描述文档类型的 DocumentType 节点。例如 <!DOCTYPE html>
  DOCUMENT_TYPE_NODE: {
    configurable: false,
    value: 10
  }
})

const PLACEHOLDERS = Object.create(null)
let placeholderIndex = 0

function getPlaceholder() {
  placeholderIndex++
  return `_@#!${placeholderIndex}!#@_`
}

/**
 * 预处理
 * 替换内容中的html属性值
 * @param content
 */
function preProcess(content) {
  content = content
    .replace(/\\./g, (input) => {
      // 处理 转义字符
      const p = getPlaceholder()
      PLACEHOLDERS[p] = input
      return p
    })
    .replace(/{{[\s\S]+?}}/g, input => {
      // 处理 模板表达式
      return input.split('\n').map(line => {
        const p = getPlaceholder()
        PLACEHOLDERS[p] = line
        return p
      }).join('\n')
    })
    .replace(/=\s*(['"])([\s\S]*?)\1/g, (input, quote, value) => {
      // 处理 html 属性值
      const p = getPlaceholder()
      PLACEHOLDERS[p] = value
      return `=${quote}${p}${quote}`
    })
  return content
}

function getNextEntity(content, offset, rowIndex) {
  const buffer = []
  let rowCount = 0
  let ltFound = false

  for (let i = offset; i < content.length; i++) {
    const char = content[i]
    if (char === '<') {
      // buffer 不为空，那么返回buffer内容
      if (buffer.length) {
        break
      }
      ltFound = true
      // 遇到 < 如果此时 buffer 为空，那么将其作为起始
      buffer.push(char)
      continue
    }

    if (char === '>') {
      // 如果已经遇到过 < ，此时遇到 > 就认为此标签闭合了
      if (ltFound) {
        buffer.push(char)
        break
      }
    }

    if (char === '\n') {
      rowCount++
    }

    buffer.push(char)
  }

  return {
    rowCount,
    // 如果有换行，那么此项的行号仅需要+1（不管多少行，行号始终表示起始行）
    // 如果没有换行，就 +0 (保持不变)
    entity: new Entity(buffer.join(''), rowIndex + (rowCount ? 1 : 0))
  }
}

/**
 *
 * @param content
 * @return {Node[]}
 */
function parse(content) {
  const tree = new Node()

  let currentNode = tree

  content = preProcess(content)

  const contentLength = content.length
  let index = 0

  let rowIndex = 1

  while (index < contentLength) {
    const {entity, rowCount} = getNextEntity(content, index, rowIndex)
    rowIndex += rowCount
    index += entity.data.length
    const node = new Node(entity)

    // 不是元素时，直接添加到 children 中
    if (entity.type !== Node.ELEMENT_NODE) {
      currentNode.appendChild(node)
      continue
    }

    // 是元素
    if (currentNode.closed) {
      if (entity.state === 'close') {
        // 此时的 state === close 直接丢弃
        continue
      }

      // 添加为兄弟元素
      currentNode.parentElement.appendChild(node)
      // 自闭合元素没有下级
      if (entity.state === 'open') {
        currentNode = node
      }
      continue
    }

    // 自闭合元素，添加为下级，不设置为当前节点
    if (entity.state === 'self-close') {
      currentNode.appendChild(node)
      continue
    }

    // 当前元素未结束，又遇到新元素，那么就是下级了
    if (entity.state === 'open') {
      currentNode.appendChild(node)
      currentNode = node
      continue
    }

    // 元素结束
    currentNode.close(entity)
    currentNode = currentNode.parentElement
  }
  return tree.childNodes
}

module.exports = {
  Node,
  parse
}
