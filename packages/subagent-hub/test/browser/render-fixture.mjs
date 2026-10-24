// Generate an interactive fixture of the actual client module. No Host writes or model calls.
// node packages/subagent-hub/test/browser/render-fixture.mjs [output.html]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const output = resolve(process.argv[2] ?? 'output/playwright/settings.html')
const client = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
const react = readFileSync(resolve(dirname(require.resolve('react/package.json')), 'umd/react.development.js'), 'utf8')
const reactDOM = readFileSync(resolve(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js'), 'utf8')
const safeScript = source => source.replace(/<\/script/gi, '<\\/script')
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>子代理中枢 · 交互验收</title>
<style>body{margin:0;padding:24px;background:#151516;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}main{max-width:960px;margin:auto}h1{font-size:20px;margin:0 0 8px}#fixture-note{font-size:12px;color:#a6a6ab;margin:0 0 20px}@media(max-width:480px){body{padding:12px}}</style>
<main><h1>子代理中枢</h1><p id="fixture-note">交互验收数据 · 保存仅写入本页内存，不修改实际配置</p><div id="root"></div></main>
<script>${safeScript(react)}</script><script>${safeScript(reactDOM)}</script>
<script>window.__ModuleLoader__={load(entry){window.clientEntry=entry}}</script><script>${safeScript(client)}</script>
<script>
const ui=window.clientEntry.factory(id=>id==='react'?React:{})
let dictionaries
const locale={register(ns,dict){dictionaries=dict},bind(){return t}}
const language=new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'
function t(key,params={}){return (dictionaries[language][key]??key).replace(/\\{(\\w+)\\}/g,(_,key)=>params[key]??'')}
ui.apply({effect(fn){fn()},locale,configForms:{whileServed(){}},slots:{}})
const initial={manageOfficialSettings:true,maxConcurrent:4,routes:[
 {id:'flash',provider:'deepseek-official',model:'deepseek-flash',tags:['fast','cheap'],note:'DeepSeek Flash'},
 {id:'minimax',provider:'magpie',model:'minimax-cn/MiniMax-M3.1-Flash',reasoningEffort:'max',tags:['reasoning','vision','免费'],note:'MiniMax M3.1 Flash'}
],agents:[{id:'reviewer',description:'审查代码改动，只报告问题，不修改文件',instructions:'逐个阅读改动，报告问题位置、原因和建议。',routes:['minimax']}]}
window.qa={saves:[],failSave:false,throwSave:false,initial,clipboard:'',syncMode:'ready',syncReads:0}
let snapshot={status:'ready',writable:true,revision:1,value:initial}
const listeners=new Set()
const scope={getSnapshot(){return snapshot},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},async mutate(ops,revision){
 qa.saves.push({ops,revision})
 if(qa.throwSave)throw new Error('模拟连接失败，请重试')
 if(qa.failSave)return false
 if(revision!==snapshot.revision)return false
 const value={...snapshot.value};for(const op of ops)value[op.path[0]]=op.value
 snapshot={...snapshot,revision:snapshot.revision+1,value};for(const fn of listeners)fn();return true
}}
const groups=[{id:'deepseek-official',name:'DeepSeek',models:[{id:'deepseek-flash',name:'DeepSeek Flash'},{id:'deepseek-pro',name:'DeepSeek Pro',reasoning:{efforts:[{id:'high',name:'High'},{id:'max',name:'Max'}]}}]},
{id:'magpie',name:'Magpie',models:[{id:'minimax-cn/MiniMax-M3.1-Flash',name:'MiniMax M3.1 Flash',reasoning:{efforts:[{id:'high',name:'High'},{id:'max',name:'Max'}]}}]},
{id:'zcode',name:'ZCode',models:[{id:'GLM-5.3-Flash',name:'GLM 5.3 Flash',reasoning:{efforts:[{id:'max',name:'Max'}]}}]}]
const ctx = {
  configForms: {
    get(ns) {
      if (ns === 'subagent-hub') return scope
      if (ns === 'subagent-model-selection-settings') {
        return { getSnapshot() { return { status: 'ready', value: { enabled: true, allowedModels: snapshot.value.routes.map(({ provider, model }) => ({ provider, model })) } } } }
      }
      return { getSnapshot() { return { status: 'unavailable', writable: false } } }
    }
  },
  remote: {
    session: { async modelCatalog() { return { ok: true, value: { groups, failures: [] } } } },
    agentPresets: { async list() {
      qa.syncReads++
      if (qa.syncMode === 'hang') return new Promise(() => {})
      if (qa.syncMode === 'error') throw new Error('模拟读取失败')
      return { ok: true, value: { presets: [
        { id: 'standard', name: '标准' }, { id: 'cordis', name: 'Cordis' },
        ...(qa.syncMode === 'pending' ? [] : snapshot.value.agents.map(agent => ({ id: 'hub-agent-' + agent.id })))
      ] } }
    } }
  }
}
qa.value=()=>snapshot.value
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(ui.SectionPage,{ctx,t})))
</script></html>`
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, html)
console.log(output)
