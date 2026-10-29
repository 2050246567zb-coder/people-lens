import { settingsOf, targetOf, endpointOf, cacheKey, coverageOf } from './lib/core.js';
import { completion, modelMessages } from './lib/api.js';
import { collect, collectImages, clearDatasets } from './lib/collector.js';
import { TaskHub } from './lib/tasks.js';
import { analysisView } from './lib/analysis.js';
import { createReplyHandler } from './lib/reply-worker.js';
const hub=new TaskHub();
const ready=Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]);
const settings=async()=>{await ready;return settingsOf((await chrome.storage.local.get('settings')).settings);};
const isUI=sender=>Boolean(sender.url?.startsWith(chrome.runtime.getURL('')));
const isXhs=sender=>Boolean(sender.tab && sender.url?.startsWith('https://www.xiaohongshu.com/'));
async function publicSettings(){const s=await settings();return {enabled:s.enabled,autoAnalyze:s.autoAnalyze,mode:s.mode,count:s.count,configured:Boolean(s.model && s.endpoint && (s.apiKey || /localhost|127\.0\.0\.1/.test(s.endpoint)))};}
async function getCache(key,s){const item=(await chrome.storage.local.get(`result:${key}`))[`result:${key}`];return item && Date.now()-item.analyzedAt<s.cacheHours*3600000?item:null;}
async function putCache(key,value){
  await chrome.storage.local.set({[`result:${key}`]:value});
  const all=await chrome.storage.local.get(null), keys=Object.keys(all).filter(k=>k.startsWith('result:')).sort((a,b)=>all[b].analyzedAt-all[a].analyzedAt);
  if(keys.length>100)await chrome.storage.local.remove(keys.slice(100));
}
async function permissionFor(s){const origin=new URL(endpointOf(s.endpoint)).origin+'/*';if(!await chrome.permissions.contains({origins:[origin]}))throw new Error('尚未授权模型域名，请打开设置，点击“保存设置”。');}
const ticketName=(tabId,requestId)=>`request:${tabId}:${requestId}`;
async function rememberRequest(name,record){
  await chrome.storage.session.set({[name]:{...record,createdAt:Date.now()}});
  const all=await chrome.storage.session.get(null),keys=Object.keys(all).filter(k=>k.startsWith('request:')).sort((a,b)=>(all[b].createdAt||0)-(all[a].createdAt||0));
  if(keys.length>100)await chrome.storage.session.remove(keys.slice(100));
}
async function runAnalysis(target,s,sourceTabId,key,signal,emit,force=false){
  const started=Date.now();
  const {data,notes,collectionMs}=await collect(target,s,sourceTabId,signal,emit,force);
  const coverage=coverageOf(data,notes,s);
  emit({type:'coverage',coverage,sources:notes.map((n,i)=>({index:i+1,title:n.title || '无标题笔记',url:n.url,time:n.time,full:n.full})),profile:data.profile});
  if(!notes.length && !data.profile.bio && !data.profile.tags.length)throw new Error('该账号没有足够的公开资料，暂时无法生成介绍。');
  const images=await collectImages(notes,s,signal);
  if(s.contentMode==='vision' && images.length===0)coverage.warnings.push('未取得可分析的图片，本次依据文字生成。');
  emit({type:'progress',message:images.length?`正在结合文字和 ${images.length} 张图片认识这个人…`:'正在整理对这个人的印象…'});
  let last=0,glossaryStatus=false;
  const heartbeat=setInterval(()=>emit({type:'heartbeat'}),12000);
  let result;try{result=await completion(s,modelMessages(data,notes,s,images),{signal,onStatus:message=>emit({type:'progress',message}),onText:raw=>{
    const view=analysisView(raw);if(Date.now()-last>65){last=Date.now();emit({type:'text',text:view.text,terms:view.terms});}
    if(view.hasGlossary && !glossaryStatus){glossaryStatus=true;emit({type:'progress',message:'介绍已生成，正在补充词义…'});}
  }});}catch(err){if(err.partialText){const view=analysisView(err.partialText);emit({type:'text',text:view.text,terms:view.terms});}throw err;}finally{clearInterval(heartbeat);}
  signal.throwIfAborted();
  const view=analysisView(result.text);if(!view.text.trim())throw new Error('模型没有返回有效的人物介绍，请重试或调整模型。');
  const out={text:view.text,terms:view.terms,profile:data.profile,coverage,sources:notes.map((n,i)=>({index:i+1,title:n.title||'无标题笔记',url:n.url,time:n.time,full:n.full})),analyzedAt:Date.now(),
    model:s.model,imageCount:images.length,collectionMs,totalMs:Date.now()-started,usage:result.usage,maxOutputTokens:result.maxOutputTokens};
  await putCache(key,out);return out;
}
const handleReplies=createReplyHandler({hub,settings,permissionFor,getAnalysis:getCache,rememberRequest,isXhs});
chrome.runtime.onConnect.addListener(port=>{
  if(port.name==='people-lens-replies'){handleReplies(port);return;}
  if(port.name!=='people-lens' || !isXhs(port.sender))return;
  let unsubscribe=null, generation=0, alive=true, requestId='';
  const send=(g,event)=>{if(alive && generation===g)try{port.postMessage({...event,requestId});}catch{}};
  port.onMessage.addListener(async msg=>{
    // Keepalive must never detach or cancel the running subscription.
    if(msg.type==='ping'){try{port.postMessage({type:'pong',requestId:String(msg.requestId||'')});}catch{}return;}
    if(!['analyze','resume','cancel'].includes(msg.type))return;
    const g=++generation;requestId=String(msg.requestId||'');unsubscribe?.();unsubscribe=null;
    if(msg.type==='cancel')return;
    try {
      if(!/^[\w-]{1,80}$/.test(requestId))throw new Error('请求标识无效，请重新点击分析。');
      const target=targetOf(msg.target),s=await settings();
      if(!alive || generation!==g)return;
      if(!s.enabled)throw new Error('人物速览已暂停，请在设置中开启。');
      if(!s.model || (!s.apiKey && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(s.endpoint)))throw new Error('请先在设置中填写 API Key 和模型。');
      await permissionFor(s);
      const key=await cacheKey(target,s);
      const ticket=ticketName(port.sender.tab.id,requestId);
      if(msg.type==='resume'){
        const record=(await chrome.storage.session.get(ticket))[ticket];
        if(!record || record.key!==key)throw new Error('原分析任务已中断，请点击重试。不会自动重复调用模型。');
        const cached=await getCache(key,s);
        if(cached && (record.acceptCached || cached.analyzedAt>=record.startedAt)){send(g,{type:'done',result:{...cached,cached:true}});return;}
        if(!alive || generation!==g)return;
        if(!hub.has(key))throw new Error('后台任务已中断，已显示的文字会保留。请点击重试继续。');
        send(g,{type:'progress',message:'连接已恢复，继续原分析…'});
        unsubscribe=hub.subscribe(key,()=>{throw new Error('原任务不存在。');},event=>send(g,event));return;
      }
      if(!msg.refresh){const cached=await getCache(key,s);if(cached){await rememberRequest(ticket,{key,startedAt:Date.now(),acceptCached:true});send(g,{type:'done',result:{...cached,cached:true}});return;}}
      await rememberRequest(ticket,{key,startedAt:Date.now(),acceptCached:false});
      if(!alive || generation!==g)return;
      unsubscribe=hub.subscribe(key,(signal,emit)=>runAnalysis(target,s,port.sender.tab.id,key,signal,emit,msg.refreshData===true),event=>send(g,event));
    }catch(err){send(g,{type:'error',message:err.message});}
  });
  port.onDisconnect.addListener(()=>{alive=false;generation++;unsubscribe?.({graceMs:5000});unsubscribe=null;});
});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  const knownUI=isUI(sender),knownPage=isXhs(sender);
  if(!knownUI && !knownPage)return false;
  (async()=>{
    await ready;
    if(msg.type==='PUBLIC_SETTINGS')return publicSettings();
    if(msg.type==='OPEN_SETTINGS'){await chrome.runtime.openOptionsPage();return true;}
    if(!knownUI)throw new Error('该操作仅允许在扩展设置中进行。');
    if(msg.type==='GET_SETTINGS')return settings();
    if(msg.type==='SAVE_SETTINGS'){
      const s=settingsOf(msg.settings);endpointOf(s.endpoint);if(!s.model)throw new Error('请填写模型名称。');
      await permissionFor(s);hub.cancelAll();await chrome.storage.local.set({settings:s});await notifyPages();return true;
    }
    if(msg.type==='SET_ENABLED'){
      const s=await settings();s.enabled=msg.enabled===true;hub.cancelAll();await chrome.storage.local.set({settings:s});await notifyPages();return true;
    }
    if(msg.type==='TEST_API'){
      const s=settingsOf(msg.settings);await permissionFor(s);const t=Date.now();
      const result=await completion(s,[{role:'user',content:'只回复“连接成功”四个字。'}],{timeoutMs:20000});
      return {text:result.text,ms:Date.now()-t};
    }
    if(msg.type==='CLEAR_CACHE'){
      hub.cancelAll();clearDatasets();const all=await chrome.storage.local.get(null);await chrome.storage.local.remove(Object.keys(all).filter(k=>k.startsWith('result:')||k.startsWith('reply:')));return true;
    }
    if(msg.type==='ANALYZE_ACTIVE'){
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.url?.startsWith('https://www.xiaohongshu.com/'))throw new Error('请先打开小红书主页或笔记页。');
      return chrome.tabs.sendMessage(tab.id,{type:'SHOW_ACTIVE'});
    }
    throw new Error('不支持的操作。');
  })().then(value=>respond({ok:true,value})).catch(err=>respond({ok:false,error:err.message || '操作失败。'}));return true;
});
async function notifyPages(){const tabs=await chrome.tabs.query({url:'https://www.xiaohongshu.com/*'});await Promise.allSettled(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'OPTIONS_CHANGED'})));}
