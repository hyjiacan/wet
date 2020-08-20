const fs = require('fs')
const wet = require('./src/engine')
const pkg = require('./package')

wet.render('./test/index.html', pkg, {
  debug: false
}).then(html => {
  fs.writeFileSync('./test/output.html', html, {encoding: 'utf8'})
})
