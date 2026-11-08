let ts
try { ts = require('typescript') } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript') }
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..')
let count = 0, errors = 0
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/\.(js|jsx)$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8')
      const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS)
      count++
      for (const error of node.parseDiagnostics) {
        errors++
        const { line, character } = node.getLineAndCharacterOfPosition(error.start)
        console.error(`${path.relative(root,file)}:${line+1}:${character+1}: ${ts.flattenDiagnosticMessageText(error.messageText,' ')}`)
      }
    }
  }
}
walk(root)
console.log(`${count} JavaScript/JSX files parsed; ${errors} syntax errors`)
process.exitCode = errors ? 1 : 0
