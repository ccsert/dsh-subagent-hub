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
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>子代理中枢 · 交互验收</title>
<style>body{margin:0;background:#151516;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.qa-host{height:100dvh;overflow:auto;padding:24px;box-sizing:border-box}main{max-width:960px;margin:auto;padding-top:120px}h1{font-size:20px;margin:0 0 8px}#fixture-note{font-size:12px;color:#a6a6ab;margin:0 0 20px}body[data-theme=light]{background:#f4f5f7;color:#17181b;--dsw-alias-bg-layer-2:#fff;--dsw-alias-bg-layer-3:#f6f7f9;--dsw-alias-label-primary:#17181b;--dsw-alias-label-secondary:#515761;--dsw-alias-label-tertiary:#626974;--dsw-alias-border-l2:#d5dae1;--dsw-alias-border-l1:#e5e7eb;--dsw-alias-interactive-bg-hover:rgba(0,0,0,.05);--dsw-alias-state-business-primary:#3365cc}</style>
<div class="qa-host"><main><h1>子代理中枢</h1><p id="fixture-note">交互验收数据 · 保存仅写入本页内存，不修改实际配置</p><div id="root"></div></main></div>
<script>${safeScript(react)}</script><script>${safeScript(reactDOM)}</script>
<script>window.__ModuleLoader__={load(entry){window.clientEntry=entry}}</script><script>${safeScript(client)}</script>
<script>
const ui=window.clientEntry.factory(id=>id==='react'?React:{})
let dictionaries
const locale={register(ns,dict){dictionaries=dict},bind(){return t}}
const language=new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'
document.body.dataset.theme=new URLSearchParams(location.search).get('theme')==='light'?'light':'dark'
function t(key,params={}){return (dictionaries[language][key]??key).replace(/\\{(\\w+)\\}/g,(_,key)=>params[key]??'')}
ui.apply({effect(fn){fn()},inject(){},locale,configForms:{whileServed(){}},slots:{}})
const initial={showAgentOverview:false,manageOfficialSettings:true,maxConcurrent:4,routes:[
 {id:'flash',provider:'deepseek-official',model:'deepseek-flash',tags:['fast','cheap'],note:'DeepSeek Flash'},
 {id:'minimax',provider:'magpie',model:'minimax-cn/MiniMax-M3.1-Flash',reasoningEffort:'max',tags:['reasoning','vision','免费'],note:'MiniMax M3.1 Flash'}
],agents:[
 {id:'builder',name:'功能开发',description:'实现明确范围内的功能，并运行相关测试',instructions:'只修改任务范围内的文件。遵循现有代码结构，完成后报告改动与验证结果。',routes:['flash','minimax']},
 {id:'reviewer',name:'代码审查',description:'审查代码改动，只报告问题，不修改文件',instructions:'逐个阅读改动，报告问题位置、原因和建议。',routes:['minimax']},
 {id:'researcher',name:'资料调研',description:'查阅资料与代码，整理证据和可执行建议',instructions:'保持只读，区分事实与推断，注明证据来源。',routes:['flash']}
]}
// Deterministic states for screenshots: ?managed=0 unmanages the official settings, and
// ?allow=provider/model,... pins the allowlist a new Session would capture.
const fixtureParams=new URLSearchParams(location.search)
const pinnedAllowlist=(fixtureParams.get('allow')??'').split(',').filter(Boolean).map(pair=>{const [provider,...rest]=pair.split('/');return {provider,model:rest.join('/')}})
if(fixtureParams.get('managed')==='0')initial.manageOfficialSettings=false
window.qa={saves:[],sessions:[],failSave:false,throwSave:false,initial,clipboard:'',syncMode:'ready',syncReads:0,
 officialAllowlist:pinnedAllowlist.length===0?undefined:{enabled:true,allowedModels:pinnedAllowlist}}
let snapshot={status:fixtureParams.has('loading')?'loading':'ready',writable:true,revision:1,value:fixtureParams.has('loading')?{}:initial}
const listeners=new Set()
const scope={getSnapshot(){return snapshot},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},async mutate(ops,revision){
 qa.saves.push({ops,revision})
 if(qa.saveDelay)await new Promise(resolve=>setTimeout(resolve,qa.saveDelay))
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
  uiWorkspace: { startSession(address, options) { qa.sessions.push({ address, options }) } },
  configForms: {
    get(ns) {
      if (ns === 'subagent-hub') return scope
      if (ns === 'subagent-model-selection-settings') {
        return { getSnapshot() { return { status: 'ready', value: qa.officialAllowlist ?? { enabled: true, allowedModels: (snapshot.value.routes??initial.routes).map(({ provider, model }) => ({ provider, model })) } } } }
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
        { id: 'hub-configurator', name: 'Hub 配置助手' },
        ...(qa.syncMode === 'pending' ? [] : (snapshot.value.agents??initial.agents).map(agent => ({ id: 'hub-agent-' + agent.id })))
      ] } }
    } }
  }
}
qa.value=()=>snapshot.value
qa.finishLoading=()=>{snapshot={status:'ready',writable:true,revision:2,value:initial};for(const fn of listeners)fn()}
qa.externalUpdate=value=>{snapshot={...snapshot,revision:snapshot.revision+1,value:{...snapshot.value,...value}};for(const fn of listeners)fn()}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(ui.SectionPage,{ctx,t})))
</script></html>`
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, html)
console.log(output)
