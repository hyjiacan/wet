const fs = require('fs')
const parser = require('../src/htmlparser')

const htmlFile = fs.readFileSync('./index.html', {encoding: 'utf-8', flag: 'r'})

const html = parser.parse(htmlFile)
console.info(html.map(i => i.toString(true)).join(''))
