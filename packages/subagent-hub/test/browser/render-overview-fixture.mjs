// Real Hub React components, synthetic native projection stores; no model calls.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const output = resolve(process.argv[2] ?? 'output/playwright/overview.html')
const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
const react = readFileSync(resolve(dirname(require.resolve('react/package.json')), 'umd/react.development.js'), 'utf8')
const reactDOM = readFileSync(resolve(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js'), 'utf8')
const safe = value => value.replace(/<\/script/gi, '<\\/script')
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Hub Overview QA</title>
<style>:root{--dsw-alias-label-primary:#e6e6e6;--dsw-alias-label-secondary:#b8b8b8;--dsw-alias-label-tertiary:#8c8c94;--dsw-alias-label-caption:#6e6e78;--dsw-alias-border-l1:#47494e;--dsw-alias-border-l2:#ffffff1f;--dsw-alias-bg-layer-1:#1c1d20;--dsw-alias-bg-layer-2:#232529;--dsw-alias-interactive-bg-hover:#ffffff14;--dsw-alias-state-business-primary:#9bb8ff;--dsw-specific-menu:#303136f0;--dsw-menu-backdrop-filter:blur(40px) saturate(150%);--dsw-elevation-stroke:0 0 0 .5px var(--dsw-elevation-stroke-color);--dsw-elevation-prominent:var(--dsw-elevation-stroke),0 3px 8px 0 #0000000a,0 0 20px 0 #0000000d}body{margin:0;background:#151516;color:#e6e6e6;font:14px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}header{padding:16px;display:flex;justify-content:space-between;border-bottom:1px solid #47494e}main{padding:24px}</style>
<header><span>Implementation review</span><div id="root"></div></header><main>实际 Hub 组件 · 独立测试数据 · 不修改真实会话</main>
<script>${safe(react)}</script><script>${safe(reactDOM)}</script><script>window.__ModuleLoader__={load(entry){window.clientEntry=entry}}</script><script>${safe(source)}</script><script>
const h=React.createElement,ui=clientEntry.factory(id=>id==='react'?React:{}),lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'zh';document.documentElement.lang=lang;
const t=(key,args={})=>(ui.overviewLocales[lang][key]??key).replace(/\\{(\\w+)\\}/g,(_,name)=>args[name]??'');
const ready=values=>({state:'ready',values});
function store(initial){let value=initial;const listeners=new Set();return{getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},set(next){value=next;for(const fn of listeners)fn()}}}
const route={provider:'minimax',model:'MiniMax-M3.1-Flash'},long='feature/long-session-name-with-a-model-provider-and-deep-project-path/'.repeat(3);
const state=store({phase:'ready',byId:{a:{running:false},b:{running:true},c:{running:false},d:{running:false},e:{running:false}},projectionsBySession:{
 root:ready({subagentCatalog:[{id:'a',label:'架构审查 Reviewer',mode:'one-shot',createdAt:Date.now()-30000},{id:'b',label:'实现 Builder',mode:'continuable'},{id:'c',label:'中断的测试任务',mode:'one-shot'},{id:'d',label:long,mode:'external'},{id:'e',label:'等待请求',mode:'one-shot'}],agentTeam:{members:[{id:'root',name:'lead',role:'lead',phase:'active'},{id:'b',name:'Builder',role:'teammate',phase:'active'}],tasks:[{id:'task-1',subject:'实现总览',description:'聚合原生子任务与 Team 成员。',status:'in_progress',ownerName:'Builder',blockedBy:[],writeScopes:['lib/client.js'],writeScopeWarnings:[]},{id:'task-2',subject:'验证与文档',description:'核对持久化历史与交互。',status:'pending',blockedBy:['task-1'],ready:false,writeScopes:['lib/client.js','docs/'],writeScopeWarnings:['Shared write scope: lib/client.js']} ]},subagentHubDispatch:{total:1,records:[{seq:35,time:Date.now()-60000,callId:'call-guard',tool:'spawn_teammate',reason:'subagent-hub: inherited parent route is outside configured child routes.'}]}}),
 a:ready({modelSelection:{lastUsed:route,next:{provider:'next-provider',model:'planned-model'}},subagentTiming:{settledMs:3456,lastTurnCompleted:true},tokenUsage:{uncachedInputTokens:100,outputTokens:20,cacheReadTokens:50,cacheWriteTokens:10}}),
 b:ready({modelSelection:{lastUsed:route,next:route},subagentTiming:{settledMs:2000,active:{since:Date.now()-5000,through:Date.now()-1000}}}),
 c:ready({subagentTiming:{settledMs:1500,lastTurnCompleted:false}}),d:ready({}),e:ready({modelSelection:{lastUsed:null,next:route}})}});
const status=store(new Map());let fail=false;const calls=[],opened=[];
const sessions={list:state,async refreshProjections(id){calls.push(id);if(fail)throw new Error('Read failed: '+id)}};
const useSessions=selector=>selector(React.useSyncExternalStore(state.subscribe,state.getSnapshot));
const useSessionStatus=selector=>selector(React.useSyncExternalStore(status.subscribe,status.getSnapshot));
const overviewForm=store({status:'ready',value:{showAgentOverview:true}});
function App(){return h(ui.OverviewGate,{overviewForm,sessionId:'root',useSession:selector=>selector({}),useSessions,useSessionStatus,sessions,openSession:address=>opened.push(address),t})}
window.qa={calls,opened,state,status,setOverview(value){overviewForm.set({status:'ready',value:{showAgentOverview:value}})},setFailure(value){fail=value},setEmpty(){state.set({phase:'ready',byId:{},projectionsBySession:{root:ready({subagentCatalog:[],agentTeam:{members:[],tasks:[]}})}})}};
ReactDOM.createRoot(document.getElementById('root')).render(h(React.StrictMode,null,h(App)));
</script></html>`
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, html)
console.log(output)
