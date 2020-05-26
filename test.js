const fs = require('fs')
const jst = require('./src/engine')
const pkg = require('./package')

const content = fs.readFileSync('./test/index.html', {encoding: 'utf8'}).toString()

const html = jst.render(content, pkg)
fs.writeFileSync('./test/output.html', html, {encoding: 'utf8'})

