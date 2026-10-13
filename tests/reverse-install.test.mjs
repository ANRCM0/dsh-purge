import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { managedStatus, prepareInstall, applyInstall, findNpmCli } from '../lib/reverse/install.js'
import { dispatchReverseUi } from '../lib/reverse/ui.js'

const disposable = async fn => {
  const root = mkdtempSync(join(tmpdir(), 'rea-managed-test-'))
  try { await fn(root) } finally { rmSync(root,{recursive:true,force:true}) }
}
const npmCli='/test/npm-cli.js'
async function mockedNpm(_,args){
  assert.ok(args.includes('rea-agents@6.4.0'))
  assert.ok(args.includes('--ignore-scripts'))
  assert.equal(args.some(x=>x==='--global'||x==='-g'),false)
  const root=args[args.indexOf('--prefix')+1]
  const pkg=join(root,'node_modules','rea-agents','package.json')
  mkdirSync(join(dirname(pkg),'scripts'),{recursive:true})
  writeFileSync(pkg,JSON.stringify({name:'rea-agents',version:'6.4.0',bin:{rea:'scripts/rea.mjs'}}))
  writeFileSync(join(dirname(pkg),'scripts','rea.mjs'), 'console.log("test")')
  return 'mock install ok'
}

test('plans are consent-gated and unguessable; user commands are not accepted',()=>disposable(async root=>{
  assert.equal(managedStatus(root).installed,false)
  assert.throws(()=>prepareInstall('arbitrary',{root,npmCli}),/invalid/)
  assert.throws(()=>prepareInstall('install',{root,npmCli:null}),/npm CLI/)
  const p=prepareInstall('install',{root,npmCli})
  assert.equal(p.command.args.includes('--ignore-scripts'),true)
  assert.equal(p.command.args.includes('--global'),false)
  assert.equal(p.confirmation,'INSTALL REA 6.4.0')
  await assert.rejects(()=>applyInstall({approvalId:p.approvalId,confirmation:'NO'},{root,npmCli,installRunner:mockedNpm}),/confirmation/)
  await assert.rejects(()=>applyInstall({approvalId:p.approvalId,confirmation:p.confirmation},{root,npmCli,installRunner:mockedNpm}),/expired or not found/)
  assert.throws(()=>dispatchReverseUi({op:'exec',command:'rm -rf /'},root),/unknown/)
}))

test('install / repair / uninstall only changes owned DSH-local runtime',()=>disposable(async root=>{
  const start=prepareInstall('install',{root,npmCli})
  const done=await applyInstall({approvalId:start.approvalId,confirmation:start.confirmation},{root,npmCli,installRunner:mockedNpm})
  assert.equal(done.status.installed,true)
  assert.equal(done.restartRequired,true)
  assert.equal(dispatchReverseUi({op:'reaStatus'},root).installed,true)
  assert.equal(prepareInstall('install',{root,npmCli}).alreadyInstalled,true)
  const repair=prepareInstall('repair',{root,npmCli})
  const re=await applyInstall({approvalId:repair.approvalId,confirmation:repair.confirmation},{root,npmCli,installRunner:mockedNpm})
  assert.equal(re.status.installed,true)
  assert.equal(existsSync(join(root,'.runtime-backup')),false)
  const remove=prepareInstall('uninstall',{root,npmCli:null})
  const removed=await applyInstall({approvalId:remove.approvalId,confirmation:remove.confirmation},{root,npmCli:null})
  assert.equal(removed.status.installed,false)
  assert.equal(existsSync(join(root,'runtime')),false)
}))

test('failed staging is cleaned and prior managed installation stays intact',()=>disposable(async root=>{
  let p=prepareInstall('install',{root,npmCli})
  await applyInstall({approvalId:p.approvalId,confirmation:p.confirmation},{root,npmCli,installRunner:mockedNpm})
  p=prepareInstall('repair',{root,npmCli})
  await assert.rejects(()=>applyInstall({approvalId:p.approvalId,confirmation:p.confirmation},{root,npmCli,installRunner:async (_cli,args)=>{
    mkdirSync(args[args.indexOf('--prefix')+1],{recursive:true})
    throw new Error('registry down')
  }}),/registry down/)
  assert.equal(managedStatus(root).installed,true)
  assert.equal(existsSync(join(root,'.runtime-installing')),false)
}))

test('unmanaged runtime is not overwritten or deleted',()=>disposable(async root=>{
  mkdirSync(join(root,'runtime'),{recursive:true})
  writeFileSync(join(root,'runtime','user-data'),'keep')
  assert.equal(managedStatus(root).existingUnmanaged,true)
  assert.throws(()=>prepareInstall('install',{root,npmCli}),/unmanaged/)
  assert.throws(()=>prepareInstall('uninstall',{root,npmCli}),/unmanaged/)
  assert.equal(existsSync(join(root,'runtime','user-data')),true)
}))

test('npm CLI resolver checks only explicit local candidates',()=>disposable(async root=>{
  const path=join(root,'node_modules','npm','bin','npm-cli.js')
  mkdirSync(dirname(path),{recursive:true})
  writeFileSync(path,'')
  assert.equal(findNpmCli({execPath:join(root,'node'),env:{}}),path)
}))
