// Install the verified Google-only Delivery sign-in and onboarding screens.
// Rename this TXT to install-google-delivery-login.cjs and run from project root:
// node <extracted-folder>/install-google-delivery-login.cjs
// Copies only these seven auth/onboarding source files, creating dated backups.
'use strict'
const fs=require('node:fs')
const path=require('node:path')
const root=process.cwd()
const sources=[
  'app/components/DeliveryGoogleAccess.jsx',
  'app/delivery/login/page.jsx',
  'app/delivery/signup/page.jsx',
  'app/delivery/complete-profile/page.jsx',
  'app/auth/delivery-callback/page.jsx',
  'app/api/delivery/customer/google-profile/route.js',
  'lib/deliveryGoogleAuth.js',
]
if (!fs.existsSync(path.join(root,'package.json')) || !fs.existsSync(path.join(root,'app','delivery'))) {
  console.error('Run this from the DIGITAL-DINING Next.js project root (the folder containing package.json).')
  process.exitCode=1
} else {
  const missing=sources.filter(p=>!fs.existsSync(path.join(__dirname,p+'.txt')))
  if(missing.length){console.error('Missing extracted TXT files:',missing);process.exitCode=1}
  else{
    const backups=path.join(root,'.delivery-login-backups',new Date().toISOString().replace(/[.:]/g,'-'))
    let changed=0
    for(const relative of sources){
      const input=fs.readFileSync(path.join(__dirname,relative+'.txt'),'utf8')
      const dest=path.join(root,relative)
      const old=fs.existsSync(dest)?fs.readFileSync(dest,'utf8'):null
      if(old===input){console.log('UNCHANGED:',relative);continue}
      if(old!==null){
        const copy=path.join(backups,relative)
        fs.mkdirSync(path.dirname(copy),{recursive:true})
        fs.writeFileSync(copy,old)
      }
      fs.mkdirSync(path.dirname(dest),{recursive:true})
      fs.writeFileSync(dest,input)
      console.log('UPDATED:',relative)
      changed++
    }
    if(changed)console.log('Backup originals (where present):',backups)
    console.log('Files updated:',changed,'\nNext: npm run build, then test Google sign-in and onboarding.')
  }
}
