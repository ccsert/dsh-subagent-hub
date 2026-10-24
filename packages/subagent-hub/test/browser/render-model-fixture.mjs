// Actual Hub contribution inside the installed conversation header's own CSS/slot structure.
// No profile writes, credentials, model calls, or external resources.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const output = resolve(process.argv[2] ?? 'output/playwright/model-badge.html')
const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
const react = readFileSync(resolve(dirname(require.resolve('react/package.json')), 'umd/react.development.js'), 'utf8')
const reactDOM = readFileSync(resolve(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js'), 'utf8')
const native = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8')
const css = [...native.matchAll(/const css(?:\$\w+)? = ("(?:[^"\\]|\\.)*");/g)]
  .map(match => JSON.parse(match[1])).find(value => value.includes('_headerUtilities'))
const mapping = native.match(/var ConversationRoot_module_css_default = \{([\s\S]*?)\};/)
if (!css || !mapping) throw new Error('Installed conversation header CSS contract not found')
const classes = Object.fromEntries([...mapping[1].matchAll(/"([^"]+)": "([^"]+)"/g)].map(match => [match[1], match[2]]))
const safe = value => value.replace(/<\/script/gi, '<\\/script')
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>子 agent 模型标识 · 交互验收</title>
<style>:root{--dsw-alias-label-primary:#e6e6e6;--dsw-alias-label-secondary:#b8b8b8;--dsw-alias-label-tertiary:#8c8c8c;--dsw-alias-border-l1:#36373b;--dsw-alias-border-l2:#36373b;--dsw-alias-bg-layer-2:#232529;--dsw-alias-bg-layer-3:#202126;--dsw-alias-state-business-primary:#5686fe;--dsw-radius-sm:6px;--dsw-radius-lg:10px}body{margin:0;background:#151516;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}main{max-width:1000px;margin:auto;padding:20px 12px}h1{font-size:18px;margin:0 0 8px}.fixture-note{font-size:12px;color:var(--dsw-alias-label-secondary,#a6a6ab);margin:0 0 20px}.fixture-conversation{border:1px solid #36373b;border-radius:12px;min-height:480px;background:#1c1d20}.fixture-body{padding:30px 24px;font-size:14px;line-height:1.8}.fixture-user{max-width:440px;margin:0 0 30px auto;padding:10px 16px;background:var(--dsw-alias-bg-layer-3,#292b31);border-radius:12px}.fixture-assistant{max-width:650px;margin:0 auto}.fixture-corner{border:0;background:transparent;color:inherit;width:28px;height:28px}.fixture-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.fixture-tabs button{color:inherit;background:var(--dsw-alias-bg-layer-2,#232529);border:1px solid var(--dsw-alias-border-l1,#36373b);border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer}.fixture-tabs button:focus-visible{outline:2px solid #5686fe;outline-offset:2px}@media(max-width:480px){main{padding:12px 8px}.fixture-body{padding:24px 14px}}</style><style>${css}</style>
<main><h1>子 agent 模型信息</h1><p class="fixture-note">实际 Hub 组件 + 官方标题栏样式 · 独立测试数据，不修改真实会话</p><div id="root"></div></main>
<script>${safe(react)}</script><script>${safe(reactDOM)}</script><script>window.__ModuleLoader__={load(entry){window.clientEntry=entry}}</script><script>${safe(source)}</script><script>
const h=React.createElement
const ui=window.clientEntry.factory(id=>id==='react'?React:{})
let dictionaries,slot,Contribution
const lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'
document.documentElement.lang=lang
function t(key,params={}){return (dictionaries[lang][key]??key).replace(/\\{(\\w+)\\}/g,(_,name)=>params[name]??'')}
const locale={register(ns,value){dictionaries=value},bind(){return t}}
function store(initial){let value=initial;const listeners=new Set();return{getSnapshot(){return value},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},set(next){value=next;for(const fn of listeners)fn()},count(){return listeners.size}}}
const route={provider:'magpie',model:'minimax-cn/MiniMax-M3.1-Flash',reasoningEffort:'max'}
const sessions={}
for(const id of ['root','child','empty','unknown']){const projection=store(id==='unknown'?undefined:id==='empty'?{lastUsed:null,next:route}:{lastUsed:route,next:route});const session=store({sessionId:id,subagent:id==='root'?null:{address:{parentSessionId:'root',childSessionId:id,mode:'one-shot'}}});session.projections={faceOf(key){if(key!=='modelSelection')throw new Error('unexpected projection');return projection}};sessions[id]={session,projection}}
const scopes={sessions:{binding(id){return sessions[id]}},slots:{inject(name,register){if(name!=='conversation.session.header.utilities')throw new Error('unexpected slot');return register()},register(options,body){if(!options.id)throw new Error("list slot requires options.id");slot=options;Contribution=body}}}
ui.apply({effect(fn){fn()},inject(names,register){register(scopes)},locale,configForms:{whileServed(){}},slots:scopes.slots})
const c=${JSON.stringify(classes)}
const root=ReactDOM.createRoot(document.getElementById('root'))
let current='child'
window.qa={open(id){current=id;render()},setProjection(id,value){sessions[id].projection.set(value)},setSession(id,value){sessions[id].session.set(value)},counts(){return Object.fromEntries(Object.entries(sessions).map(([id,row])=>[id,{session:row.session.count(),projection:row.projection.count()}]))},slot:slot.name}
function App(){return h(React.Fragment,null,
 h('section',{className:'fixture-conversation'},
  h('header',{className:c.header,'data-window-drag':true},
   h('div',{className:c.headerLeading}),
   h('div',{className:c.titleRow},
    h('div',{className:c.titleCluster},h('nav',{className:c.crumbs,'aria-label':'会话层级'},h('span',{className:c.crumbSeg},h('span',{className:c.crumbCurrent},current==='root'?'主会话':'代码审查子任务'))),h('div',{className:c.headerActions})),
    h('div',{className:c.headerUtilities},h(Contribution,{...slot.inject(current),t})),
    h('div',{className:c.headerCorner},h('button',{className:'fixture-corner','aria-label':'会话菜单'},'···')))),
  h('div',{className:'fixture-body'},h('div',{className:'fixture-user'},'检查这次改动，只报告发现，不修改文件。'),h('div',{className:'fixture-assistant'},h('p',null,'已完成检查，下面是需要关注的改动。'),h('p',null,'标题栏里的模型信息来自当前子会话的最近请求记录。点开可以查看完整供应商、模型和推理强度。')))),
 h('div',{className:'fixture-tabs'},[['child','已请求的子会话'],['empty','尚未请求的子会话'],['unknown','信息未就绪'],['root','主会话']].map(([id,label])=>h('button',{key:id,onClick:()=>qa.open(id)},label))))}
function render(){root.render(h(React.StrictMode,null,h(App)))}
render()
</script></html>`
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, html)
console.log(output)
