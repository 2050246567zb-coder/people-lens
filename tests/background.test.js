import test from 'node:test';import assert from 'node:assert/strict';
import {cacheKey,settingsOf,targetOf} from '../extension/lib/core.js';
import {GLOSSARY_MARKER} from '../extension/lib/analysis.js';
const id=n=>n.toString(16).padStart(24,'0');
let listener,connect;const memory={settings:{endpoint:'http://127.0.0.1:1234/v1',model:'test',apiKey:'fake-test-secret'}};
const area={setAccessLevel:async()=>{},get:async key=>key===null?{...memory}:{[key]:memory[key]},set:async obj=>Object.assign(memory,obj),remove:async keys=>{for(const k of [].concat(keys))delete memory[k];}};
globalThis.chrome={storage:{local:area,session:area},runtime:{getURL:p=>'chrome-extension://test/'+p,onConnect:{addListener:f=>connect=f},onMessage:{addListener:f=>listener=f},openOptionsPage:async()=>{}},permissions:{contains:async()=>true},tabs:{query:async()=>[],sendMessage:async()=>({ok:true})},scripting:{executeScript:async({args})=>[{result:{profile:{userPageData:{posted:1,basicInfo:{nickname:'目标用户',desc:'公开简介'}},notes:[[{noteId:id(1),user:{userId:args[0]},desc:'公开文字',title:'作品',time:1790000000000}]]},details:[]}}]}};
globalThis.fetch=async()=>Response.json({choices:[{message:{content:'关注公开作品。[1]'},finish_reason:'stop'}]});
await import('../extension/background.js');
const page={url:'https://www.xiaohongshu.com/explore/'+id(9),tab:{id:1}},ui={url:'chrome-extension://test/options.html',tab:{id:2}};
const message=(msg,sender)=>new Promise(resolve=>{const accepted=listener(msg,sender,resolve);if(accepted===false)resolve(null);});

test('one model call produces a clean description plus cached glossary without exposing its protocol',async()=>{
  const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:'分享 SDK 接入过程。\n'+GLOSSARY_MARKER+'\n'+JSON.stringify([{term:'SDK',meaning:'用于接入某个平台功能的一套开发工具。'}])},finish_reason:'stop'}]});};
  const p=peer();try{p.send({type:'analyze',requestId:'glossary',target:{id:id(1500)}});const done=await p.wait(e=>e.type==='done'||e.type==='error');assert.equal(done.type,'done');assert.equal(calls,1);assert.equal(done.result.text,'分享 SDK 接入过程。');assert.equal(done.result.terms.length,1);assert(p.events.filter(e=>e.type==='text').every(e=>!e.text.includes(GLOSSARY_MARKER)&&!e.text.includes('meaning')));assert(Object.values(memory).some(v=>v?.terms?.[0]?.term==='SDK'));}finally{globalThis.fetch=originalFetch;p.disconnect();}
});
test('truncation inside glossary preserves the clean introduction and never caches incomplete analysis',async()=>{
  const originalFetch=globalThis.fetch,target=targetOf({id:id(1501)}),key=await cacheKey(target,settingsOf(memory.settings));
  const raw='这位分享 SDK 的接入经验。\n'+GLOSSARY_MARKER+'\n[{"term":"SDK","meaning":"还没完成';
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:raw},finish_reason:'length'}]});const p=peer();
  try{p.send({type:'analyze',requestId:'partial-glossary',target});await p.wait(e=>e.type==='error');assert.equal(p.events.filter(e=>e.type==='text').at(-1).text,'这位分享 SDK 的接入经验。');assert.equal(p.events.some(e=>e.type==='done'),false);assert.equal(memory[`result:${key}`],undefined);}finally{globalThis.fetch=originalFetch;p.disconnect();}
});
function peer(name='people-lens'){
  let receive,disconnect;const events=[],waiters=[];
  connect({name,sender:page,onMessage:{addListener:f=>receive=f},onDisconnect:{addListener:f=>disconnect=f},postMessage:e=>{events.push(e);for(const w of [...waiters])if(w.match(e)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(e);}}});
  return {events,send:m=>receive(m),disconnect:()=>disconnect(),wait:match=>{const found=events.find(match);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={match,resolve,timer:setTimeout(()=>reject(new Error('test event timed out')),1500)};waiters.push(w);});}};
}
async function replyFixture(n){
  const target=targetOf({id:id(n)}),s=settingsOf(memory.settings),key=await cacheKey(target,s);
  memory[`result:${key}`]={profile:{id:target.id,name:'目标用户'},text:'喜欢手工制作，分享具体的过程。',analyzedAt:Date.now()};
  return {target,context:{mode:'comment',post:{id:id(9),authorId:id(1),title:'一个周末做完的小书架',text:'笔记里分享了接榫的过程。'},comment:{id:id(n+100),authorId:target.id,name:'目标用户',text:'连接处用了什么方法？'},parent:{name:'上文作者',text:'这个角落的设计很实用。'}}};
}
test('reply suggestions reuse introduction, include post and selected speech, and cache per conversation',async()=>{
  const fixture=await replyFixture(2100),originalFetch=globalThis.fetch;let calls=0,payload;
  globalThis.fetch=async(_url,init)=>{calls++;payload=JSON.parse(init.body);return Response.json({choices:[{message:{content:JSON.stringify([{label:'自然接话',text:'这个连接细节值得展开说说。'},{label:'追问细节',text:'想知道固定时最需要注意哪一步？'},{label:'轻松一点',text:'这处小细节很见功夫。'}])},finish_reason:'stop'}]});};
  const a=peer('people-lens-replies'),b=peer('people-lens-replies'),c=peer('people-lens-replies'),d=peer('people-lens-replies');
  try{
    a.send({type:'suggest',requestId:'reply-one',...fixture});const done=await a.wait(e=>e.type==='done'||e.type==='error');assert.equal(done.type,'done');assert.equal(done.result.suggestions.length,3);assert.equal(calls,1);
    const input=JSON.parse(payload.messages[1].content);assert.equal(input.context.post.title,fixture.context.post.title);assert.equal(input.context.comment.text,fixture.context.comment.text);assert.equal(input.person.introduction,'喜欢手工制作，分享具体的过程。');assert(!JSON.stringify(payload).includes('fake-test-secret'));
    b.send({type:'suggest',requestId:'reply-cached',...fixture});assert.equal((await b.wait(e=>e.type==='done')).result.cached,true);assert.equal(calls,1);
    c.send({type:'suggest',requestId:'reply-other-comment',...fixture,context:{...fixture.context,comment:{...fixture.context.comment,id:id(2210),text:'工具是在哪儿买的？'}}});await c.wait(e=>e.type==='done');assert.equal(calls,2);
    d.send({type:'suggest',requestId:'reply-refresh',...fixture,refresh:true,avoid:done.result.suggestions.map(s=>s.text)});await d.wait(e=>e.type==='done');assert.equal(calls,3);assert.equal(JSON.parse(payload.messages[1].content).avoid.length,3);
  }finally{a.disconnect();b.disconnect();c.disconnect();d.disconnect();globalThis.fetch=originalFetch;}
});
test('reply reconnection resumes the same paid request; a lost ticket never starts another one',async()=>{
  const fixture=await replyFixture(2300),originalFetch=globalThis.fetch;let calls=0,finish,begin;
  const started=new Promise(r=>begin=r);globalThis.fetch=async()=>{calls++;begin();return new Promise(r=>finish=r);};const a=peer('people-lens-replies');let b;
  try{
    a.send({type:'suggest',requestId:'reply-resume',...fixture});await started;a.send({type:'ping',requestId:'reply-resume'});await a.wait(e=>e.type==='pong');a.disconnect();b=peer('people-lens-replies');b.send({type:'resume',requestId:'reply-resume',...fixture});await b.wait(e=>e.message?.includes('恢复'));assert.equal(calls,1);
    finish(Response.json({choices:[{message:{content:'[{"label":"追问细节","text":"这个步骤能再展开说说吗？"}]'},finish_reason:'stop'}]}));await b.wait(e=>e.type==='done');
    const lost=peer('people-lens-replies');try{lost.send({type:'resume',requestId:'unknown-reply',...fixture});assert.match((await lost.wait(e=>e.type==='error')).message,/中断/);assert.equal(calls,1);}finally{lost.disconnect();}
  }finally{b?.disconnect();globalThis.fetch=originalFetch;}
});
test('invalid reply identity is rejected before a model call and explicit cancel aborts in-flight generation',async()=>{
  const fixture=await replyFixture(2500),originalFetch=globalThis.fetch;let calls=0,begin,modelSignal;
  const started=new Promise(r=>begin=r);globalThis.fetch=async(_url,init)=>{calls++;modelSignal=init.signal;begin();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));};
  const bad=peer('people-lens-replies'),active=peer('people-lens-replies');try{
    bad.send({type:'suggest',requestId:'reply-wrong',...fixture,context:{...fixture.context,comment:{...fixture.context.comment,authorId:id(1)}}});assert.match((await bad.wait(e=>e.type==='error')).message,/不一致/);assert.equal(calls,0);
    active.send({type:'suggest',requestId:'reply-cancel',...fixture});await started;active.send({type:'cancel',requestId:'reply-cancel'});assert.equal(modelSignal.aborted,true);assert.equal(active.events.some(e=>e.type==='done'),false);
  }finally{bad.disconnect();active.disconnect();globalThis.fetch=originalFetch;}
});
test('page cannot read API key or save settings; trusted options tab can',async()=>{const denied=await message({type:'GET_SETTINGS'},page);assert.equal(denied.ok,false);const allowed=await message({type:'GET_SETTINGS'},ui);assert.equal(allowed.value.apiKey,'fake-test-secret');const publicConfig=await message({type:'PUBLIC_SETTINGS'},page);assert.equal(JSON.stringify(publicConfig).includes('fake-test-secret'),false);});
test('unrelated origins cannot call privileged message handlers',async()=>{assert.equal(await message({type:'GET_SETTINGS'},{url:'https://evil.test',tab:{id:8}}),null);});
test('enabled toggle is separate from model permissions',async()=>{const r=await message({type:'SET_ENABLED',enabled:false},ui);assert.equal(r.ok,true);assert.equal(memory.settings.enabled,false);await message({type:'SET_ENABLED',enabled:true},ui);});
test('background pipeline stamps request ID, provides coverage, and persists finished result only',async()=>{
  let receive,disconnected;const events=[];const done=new Promise((resolve,reject)=>{
    connect({name:'people-lens',sender:page,onMessage:{addListener:f=>receive=f},onDisconnect:{addListener:f=>disconnected=f},postMessage:event=>{events.push(event);if(event.type==='done')resolve(event);if(event.type==='error')reject(new Error(event.message));}});
  });
  receive({type:'analyze',requestId:'B',target:{id:id(777),url:'https://www.xiaohongshu.com/user/profile/'+id(777),name:'目标'}});
  const result=await done;assert.equal(result.requestId,'B');assert.equal(result.result.coverage.full,1);assert(events.every(e=>e.requestId==='B'));assert(Object.keys(memory).some(k=>k.startsWith('result:')));disconnected();
});
test('ping does not cancel active work; a new port resumes without a second API request',async()=>{
  const originalFetch=globalThis.fetch;let count=0,finish,signal,start;
  const started=new Promise(r=>start=r);
  globalThis.fetch=async(_url,options)=>{count++;signal=options.signal;start();return new Promise((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});};
  const target={id:id(778),url:'https://www.xiaohongshu.com/user/profile/'+id(778)};
  const first=peer();let second;
  try{
    first.send({type:'analyze',requestId:'recover',target});await started;
    first.send({type:'ping',requestId:'noise'});await first.wait(e=>e.type==='pong');assert.equal(signal.aborted,false);
    first.disconnect();assert.equal(signal.aborted,false);
    second=peer();second.send({type:'resume',requestId:'recover',target});await second.wait(e=>e.message?.includes('连接已恢复'));
    assert.equal(count,1);assert.equal(signal.aborted,false);
    finish(Response.json({choices:[{message:{content:'原任务完成。[1]'},finish_reason:'stop'}]}));
    const done=await second.wait(e=>e.type==='done');assert.equal(done.requestId,'recover');assert.equal(done.result.text,'原任务完成。[1]');assert.equal(count,1);
  }finally{globalThis.fetch=originalFetch;second?.disconnect();}
});
test('resume after completion restores cached work without calling the model',async()=>{
  const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not request');};const p=peer();
  try{p.send({type:'resume',requestId:'B',target:{id:id(777),url:'https://www.xiaohongshu.com/user/profile/'+id(777)}});const done=await p.wait(e=>e.type==='done'||e.type==='error');assert.equal(done.type,'done');assert.equal(done.result.cached,true);assert.equal(calls,0);}finally{globalThis.fetch=originalFetch;p.disconnect();}
});
test('lost task never silently restarts the provider or restores an older refresh result',async()=>{
  const target=targetOf({id:id(1007)}),key=await cacheKey(target,settingsOf(memory.settings));
  memory['request:1:lost']={key,startedAt:Date.now(),acceptCached:false};memory[`result:${key}`]={analyzedAt:Date.now()-10000,text:'older result'};
  const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not request');};const p=peer();
  try{p.send({type:'resume',requestId:'lost',target});const e=await p.wait(e=>e.type==='done'||e.type==='error');assert.equal(e.type,'error');assert.match(e.message,/任务已中断/);assert.equal(calls,0);}finally{globalThis.fetch=originalFetch;p.disconnect();}
});
test('truncated model output is fully preserved and never added to completed cache',async()=>{
  const originalFetch=globalThis.fetch;const target=targetOf({id:id(1008)}),key=await cacheKey(target,settingsOf(memory.settings));
  globalThis.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"半句"}}]}\n\ndata: {"choices":[{"delta":{"content":"继续但没完成"}}]}\n\ndata: {"choices":[{"finish_reason":"length"}]}\n\n',{headers:{'content-type':'text/event-stream'}});
  const p=peer();try{p.send({type:'analyze',requestId:'truncated',target});await p.wait(e=>e.type==='error');const text=p.events.filter(e=>e.type==='text').at(-1).text;assert.equal(text,'半句继续但没完成');assert.equal(memory[`result:${key}`],undefined);assert.equal(p.events.some(e=>e.type==='done'),false);}finally{globalThis.fetch=originalFetch;p.disconnect();}
});
