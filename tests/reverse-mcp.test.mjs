import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { prepareInstall, applyInstall } from '../lib/reverse/install.js'
import { probeManagedMcp } from '../lib/reverse/connection.js'

test('real JSON-RPC initialization and tool discovery work against a local fixture', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-rea-mcp-test-'))
  try {
    const absent = await probeManagedMcp({root})
    assert.equal(absent.connected,false)
    const plan = prepareInstall('install',{root,npmCli:'/test/npm-cli.js'})
    const installed = await applyInstall({approvalId:plan.approvalId,confirmation:plan.confirmation},
      {root,npmCli:'/test/npm-cli.js',installRunner:async(_cli,args)=>{
        const prefix=args[args.indexOf('--prefix')+1]
        const pkg=join(prefix,'node_modules','rea-agents','package.json')
        const entry=join(dirname(pkg),'scripts','rea.mjs')
        mkdirSync(dirname(entry),{recursive:true})
        writeFileSync(pkg,JSON.stringify({name:'rea-agents',version:'6.4.0',bin:{rea:'scripts/rea.mjs'}}))
        writeFileSync(entry,[
          "let input = '';",
          "process.stdin.on('data', chunk => {",
          "  input += chunk.toString();",
          "  let end;",
          "  while ((end = input.indexOf('\\n')) !== -1) {",
          "    const line = input.slice(0, end); input = input.slice(end + 1);",
          "    let packet;",
          "    try { packet = JSON.parse(line) } catch { continue }",
          "    if (packet.id === 1) process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}}) + '\\n')",
          "    if (packet.id === 2) process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[{name:'analyze_fixture',inputSchema:{type:'object'}}]}}) + '\\n')",
          "  }",
          "});"
        ].join('\n'))
        return 'mock install completed'
      }})
    assert.equal(installed.status.installed,true)
    const result=await probeManagedMcp({root,timeoutMs:5000})
    assert.equal(result.connected,true,JSON.stringify(result))
    assert.equal(result.toolCount,1)
    assert.deepEqual(result.toolNames,['analyze_fixture'])
  } finally {
    rmSync(root,{recursive:true,force:true})
  }
})
