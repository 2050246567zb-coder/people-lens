import {settingsOf,DEFAULTS} from '/extension/lib/core.js';import {sseEvents} from '/extension/lib/api.js';
const read=()=>settingsOf({...DEFAULTS,endpoint:location.origin+'/v1',model:'demo-fast',...JSON.parse(localStorage.getItem('people-lens-demo-settings') || '{}'),apiKey:''});
const cache=new Map(),inbox=[];
const message=async msg=>{
  const s=read();
  if(msg.type==='GET_SETTINGS')return s;
  if(msg.type==='PUBLIC_SETTINGS')return {...s,configured:true,apiKey:undefined};
  if(msg.type==='SAVE_SETTINGS'){localStorage.setItem('people-lens-demo-settings',JSON.stringify({...msg.settings,apiKey:''}));return true;}
  if(msg.type==='SET_ENABLED'){localStorage.setItem('people-lens-demo-settings',JSON.stringify({...s,enabled:msg.enabled}));return true;}
  if(msg.type==='CLEAR_CACHE'){cache.clear();return true;}
  if(msg.type==='OPEN_SETTINGS'){window.open('/settings','_blank');return true;}
  if(msg.type==='TEST_API')return (await fetch('/demo/test',{method:'POST'})).json();
  return true;
};
window.chrome={permissions:{request:async()=>true},runtime:{lastError:null,getURL:p=>'/extension/'+p,openOptionsPage:()=>window.open('/settings','_blank'),
  sendMessage:(msg,cb)=>{const p=message(msg).then(value=>({ok:true,value})).catch(error=>({ok:false,error:error.message}));if(cb){p.then(cb);return;}return p;},
  onMessage:{addListener:fn=>inbox.push(fn)},
  connect:({name}={})=>{
    const isAdvice=name==='people-lens-replies';
    const listeners=[];let controller;const emit=event=>listeners.forEach(fn=>fn(event));
    return {onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener:()=>{}},postMessage:async msg=>{
      if(msg.type==='ping'){emit({type:'pong',requestId:msg.requestId});return;}
      if(msg.type==='resume'){emit({type:'error',requestId:msg.requestId,message:'演示连接已结束，请重新分析。'});return;}
      controller?.abort();if(msg.type==='cancel')return;controller=new AbortController();const signal=controller.signal;const s=read(),profileKey=JSON.stringify([msg.target.id,s]),analysis=cache.get(profileKey),key=isAdvice?'reply:'+JSON.stringify([profileKey,msg.context,analysis?.analyzedAt]):profileKey;
      if(!msg.refresh && cache.has(key)){emit({type:'done',result:{...cache.get(key),cached:true},requestId:msg.requestId});return;}
      try{const response=await fetch(isAdvice?'/demo/replies':'/demo/analyze',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({target:msg.target,settings:s,context:msg.context,analysis:analysis?{profile:analysis.profile,text:analysis.text,analyzedAt:analysis.analyzedAt}:null,avoid:msg.avoid})});
        for await(const raw of sseEvents(response.body)){const e=JSON.parse(raw);if(e.type==='done')cache.set(key,e.result);if(!signal.aborted)emit({...e,requestId:msg.requestId});}
      }catch(err){if(!signal.aborted)emit({type:'error',message:err.message,requestId:msg.requestId});}
    }};
  }
}};
