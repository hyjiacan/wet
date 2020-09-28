/**
 * 仿系统的数据结构
 * @return {NamedNodeMap}
 * @constructor
 */
function NamedNodeMap() {
  if (!(this instanceof NamedNodeMap)) {
    return new NamedNodeMap()
  }

  Object.defineProperties(this, {
    _index: {
      configurable: false,
      enumerable: false,
      value: 0,
      writable: true
    },
    itemList: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: []
    },
    itemSet: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: Object.create(null)
    }
  })
}

Object.defineProperties(NamedNodeMap.prototype, {
  length: {
    configurable: false,
    enumerable: false,
    get() {
      return this.itemList.length
    }
  },
  setNamedItem: {
    configurable: false,
    enumerable: false,
    writable: false,
    value(attr) {
      if (attr.name in this.itemSet) {
        Object.assign(this.itemSet[attr.name], attr)
        return
      }
      this.itemList.push(attr)
      this.itemSet[attr.name] = attr
      this[attr.name] = attr
    }
  },
  getNamedItem: {
    configurable: false,
    enumerable: false,
    writable: false,
    value(name) {
      return this.itemSet[name]
    }
  },
  [Symbol.iterator]: {
    configurable: false,
    enumerable: false,
    writable: false,
    value() {
      return this
    }
  },
  next: {
    configurable: false,
    enumerable: false,
    writable: false,
    value() {
      if (this._index === this.length) {
        return {
          done: true
        }
      }

      const value = this.itemList[this._index]
      this._index = this._index + 1

      return {
        value,
        done: false
      }
    }
  }
})

// const attrs = new NamedNodeMap()
// attrs.setNamedItem({
//   name: 'title',
//   value: 'the title'
// })
// attrs.setNamedItem({
//   name: 'length',
//   value: 20
// })
// attrs.setNamedItem({
//   name: 'tabindex',
//   value: 12
// })
//
// new NamedNodeMap().setNamedItem({
//   name: 'tabindex',
//   value: 15
// })
//
// console.info('hasOwnProperty length', attrs.hasOwnProperty('length'))
// console.info('hasOwnProperty title', attrs.hasOwnProperty('title'))
// console.info('length', attrs.length)
// console.info(attrs.getNamedItem('title'))
//
// for (const attr of attrs) {
//   console.info(attr)
// }

module.exports = NamedNodeMap
