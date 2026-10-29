import {targetOf,cacheKey} from './core.js';
import {completion} from './api.js';
import {replyContextOf,replyHash,replyMessages,parseReplySuggestions} from './replies.js';
export function createReplyHandler({hub,settings,permissionFor,getAnalysis,rememberRequest,isXhs}){
  const cached=async key=>{const value=(await chrome.storage.local.get(`reply:${key}`))[`reply:${key}`];return value&&Date.now()-value.createdAt<1800000?value:null;};
  const save=async(key,value)=>{
    await chrome.storage.local.set({[`reply:${key}`]:value});const all=await chrome.storage.local.get(null),keys=Object.keys(all).filter(k=>k.startsWith('reply:')).sort((a,b)=>all[b].createdAt-all[a].createdAt);
    if(keys.length>60)await chrome.storage.local.remove(keys.slice(60));
  };
  async function run(target,s,context,analysis,key,avoid,signal,emit){
    let last='';emit({type:'progress',message:'正在结合笔记和这条发言，想几种回复…'});
    const options=raw=>{const suggestions=parseReplySuggestions(raw,{partial:true}),stamp=JSON.stringify(suggestions);if(suggestions.length&&stamp!==last){last=stamp;emit({type:'options',suggestions});}};
    let result;try{result=await completion(s,replyMessages(context,analysis,avoid),{signal,timeoutMs:45000,onText:options,onStatus:message=>emit({type:'progress',message})});}
    catch(err){if(err.partialText)options(err.partialText);if(err.code==='OUTPUT_TRUNCATED')throw new Error('回复生成达到长度限制，已收到的建议会保留，可点击重试。');throw err;}
    signal.throwIfAborted();const out={suggestions:parseReplySuggestions(result.text),targetId:target.id,postId:context.post.id,commentId:context.comment?.id||'',createdAt:Date.now(),usage:result.usage};await save(key,out);return out;
  }
  return port=>{
    if(!isXhs(port.sender))return;
    let unsubscribe=null,generation=0,alive=true,requestId='';
    const send=(g,event)=>{if(alive&&generation===g)try{port.postMessage({...event,requestId});}catch{}};
    port.onMessage.addListener(async msg=>{
      if(msg.type==='ping'){try{port.postMessage({type:'pong',requestId:String(msg.requestId||'')});}catch{}return;}
      if(!['suggest','resume','cancel'].includes(msg.type))return;
      const g=++generation;requestId=String(msg.requestId||'');unsubscribe?.();unsubscribe=null;if(msg.type==='cancel')return;
      try{
        if(!/^[\w-]{1,80}$/.test(requestId))throw new Error('请求标识无效，请重新生成建议。');
        const target=targetOf(msg.target),context=replyContextOf(msg.context,target),s=await settings();
        if(!s.enabled)throw new Error('人物速览已暂停。');await permissionFor(s);
        const scope=await cacheKey(target,s),base=await replyHash({version:1,scope,context}),ticket=`request:${port.sender.tab.id}:${requestId}`;
        if(msg.type==='resume'){
          const record=(await chrome.storage.session.get(ticket))[ticket];
          if(!record||record.kind!=='reply'||record.base!==base)throw new Error('原回复任务已中断，请点击重试，不会自动重复调用模型。');
          const value=await cached(record.key);if(value&&(record.acceptCached||value.createdAt>=record.startedAt)){send(g,{type:'done',result:{...value,cached:true}});return;}
          if(!alive||generation!==g)return;if(!hub.has(`reply:${record.key}`))throw new Error('回复任务已中断，已显示的建议会保留，请点击重试。');
          send(g,{type:'progress',message:'连接已恢复，继续原回复任务…'});unsubscribe=hub.subscribe(`reply:${record.key}`,()=>{throw new Error('原任务不存在。');},e=>send(g,e));return;
        }
        const analysis=await getAnalysis(scope,s);if(!analysis?.text)throw new Error('请先完成对方的人物介绍，再生成回复建议。');
        const key=await replyHash({base,analysisAt:analysis.analyzedAt,introduction:analysis.text});
        if(!msg.refresh){const value=await cached(key);if(value){await rememberRequest(ticket,{kind:'reply',key,base,startedAt:Date.now(),acceptCached:true});send(g,{type:'done',result:{...value,cached:true}});return;}}
        await rememberRequest(ticket,{kind:'reply',key,base,startedAt:Date.now(),acceptCached:false});if(!alive||generation!==g)return;
        const avoid=Array.isArray(msg.avoid)?msg.avoid:[];
        unsubscribe=hub.subscribe(`reply:${key}`,(signal,emit)=>run(target,s,context,analysis,key,avoid,signal,emit),e=>send(g,e));
      }catch(err){send(g,{type:'error',message:err.message||'回复建议生成失败。'});}
    });
    port.onDisconnect.addListener(()=>{alive=false;generation++;unsubscribe?.({graceMs:5000});unsubscribe=null;});
  };
}
