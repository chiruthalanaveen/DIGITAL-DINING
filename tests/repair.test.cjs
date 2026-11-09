'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fixFiles } = require('../tools/fix-restaurant-location-import.cjs')
const pkgRoot = path.join(__dirname, '..')
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-picker-fix-'))
  const c = path.join(root,'app/components/AdminRestaurantOrderingControls.jsx')
  const p = path.join(root,'app/components/RestaurantLocationPicker.jsx')
  fs.mkdirSync(path.dirname(c),{recursive:true})
  fs.writeFileSync(c, fs.readFileSync(path.join(pkgRoot,'TXT_CODE/app/components/AdminRestaurantOrderingControls.jsx.txt'),'utf8').replace("import { RestaurantLocationPicker } from '@/app/components/RestaurantLocationPicker'", "import RestaurantLocationPicker from '@/app/components/RestaurantLocationPicker'"))
  fs.writeFileSync(p, fs.readFileSync(path.join(pkgRoot,'TXT_CODE/app/components/RestaurantLocationPicker.jsx.txt'),'utf8').replace('export function RestaurantLocationPicker(', 'export default function RestaurantLocationPicker(').replace(/\n\n\/\/ Keep the default export for any other existing imports\.\nexport default RestaurantLocationPicker\n/, '\n'))
  return {root,c,p}
}
test('fixes default import/export to named import/export and retains default export',()=>{
  const f=fixture(); try {
    const beforeC=fs.readFileSync(f.c,'utf8');const beforeP=fs.readFileSync(f.p,'utf8')
    const r=fixFiles(f.root)
    assert.equal(r.changed,true)
    const afterC=fs.readFileSync(f.c,'utf8'); const afterP=fs.readFileSync(f.p,'utf8')
    assert.ok(afterC.includes("import { RestaurantLocationPicker } from '@/app/components/RestaurantLocationPicker'"))
    assert.ok(afterP.includes('export function RestaurantLocationPicker('))
    assert.ok(afterP.includes('export default RestaurantLocationPicker'))
    assert.equal(afterC.replace("import { RestaurantLocationPicker } from '@/app/components/RestaurantLocationPicker'", "import RestaurantLocationPicker from '@/app/components/RestaurantLocationPicker'"),beforeC)
    assert.equal(afterP.replace('export function RestaurantLocationPicker(', 'export default function RestaurantLocationPicker(').replace(/\n\n\/\/ Retain default export for any existing consumers\.\nexport default RestaurantLocationPicker\n/, '\n'),beforeP)
    assert.equal(fs.readFileSync(path.join(r.backupDir,'AdminRestaurantOrderingControls.jsx'),'utf8'),beforeC)
    assert.equal(fs.readFileSync(path.join(r.backupDir,'RestaurantLocationPicker.jsx'),'utf8'),beforeP)
    assert.equal(fixFiles(f.root).changed,false)
  } finally {fs.rmSync(f.root,{recursive:true,force:true})}
})
test('rejects unexpected JSX without writing',()=>{
  const f=fixture(); try {
    const beforeP=fs.readFileSync(f.p,'utf8');fs.writeFileSync(f.c,'import something from "elsewhere"')
    assert.throws(()=>fixFiles(f.root),/Unexpected import\/export/)
    assert.equal(fs.readFileSync(f.p,'utf8'),beforeP)
    assert.equal(fs.existsSync(path.join(f.root,'dd-location-component-fix-backups')),false)
  } finally {fs.rmSync(f.root,{recursive:true,force:true})}
})
