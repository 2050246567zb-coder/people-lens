import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {parseHTML} from 'linkedom';import {readPublicPage,collect,clearDatasets} from '../extension/lib/collector.js';import {settingsOf,targetOf} from '../extension/lib/core.js';
const uid='000000000000000000000002';
function snap(pathname,state){const {document}=parseHTML('<html><body><div id="userPostedFeeds"></div></body></html>');return vm.runInNewContext(`(${readPublicPage.toString()})('${uid}')`,{window:{__INITIAL_STATE__:state},document,location:{pathname,href:'https://www.xiaohongshu.com'+pathname}});}
test('live snapshot serializes Vue refs but excludes current-user info and favorites',()=>{const r=snap('/user/profile/'+uid,{user:{userInfo:{credential:'not-public'},userPageData:{_value:{basicInfo:{nickname:'甲',desc:'简介',ipLocation:'不需要的位置'},posted:1,tags:[]}},notes:{_value:[[{id:'posted'}],[{id:'favorite'}]]}}});const text=JSON.stringify(r);assert(text.includes('posted'));assert(!text.includes('favorite'));assert(!text.includes('not-public'));assert(!text.includes('不需要的位置'));});
test('snapshot refuses another profile and returns only target-authored note details',()=>{const r=snap('/user/profile/000000000000000000000003',{user:{userPageData:{basicInfo:{nickname:'其他人'}}},note:{noteDetailMap:{a:{note:{noteId:'a',user:{userId:uid},desc:'目标文字'}},b:{note:{noteId:'b',user:{userId:'another'},desc:'别人的文字'}}}}});assert.equal(r.profile,null);assert.equal(r.details.length,1);assert.equal(r.details[0].desc,'目标文字');});
test('login redirect is explicit instead of an empty successful profile',()=>{assert.equal(snap('/login',{}).loginWall,true);});
test('public profile snapshot preserves small and large avatar fields',()=>{
  const r=snap('/user/profile/'+uid,{user:{userPageData:{basicInfo:{nickname:'目标',images:'https://sns-avatar-qc.xhscdn.com/avatar/small',imageb:'https://sns-avatar-qc.xhscdn.com/avatar/large'}},notes:[[]]}});
  assert.equal(r.profile.userPageData.basicInfo.images,'https://sns-avatar-qc.xhscdn.com/avatar/small');assert.equal(r.profile.userPageData.basicInfo.imageb,'https://sns-avatar-qc.xhscdn.com/avatar/large');
});
test('model-only retry reuses the dataset without opening a page or extending its age',async()=>{
  clearDatasets();const originalFetch=globalThis.fetch,now=Date.now;let current=1800000000000,calls=0;
  const target=targetOf({id:'000000000000000000000004'}),s=settingsOf({count:1});Date.now=()=>current;
  globalThis.fetch=async url=>{calls++;return {ok:true,url,text:async()=>'<script>window.__INITIAL_STATE__='+JSON.stringify({user:{userPageData:{posted:1,basicInfo:{nickname:'样本'}},notes:[[{noteId:'000000000000000000000005',user:{userId:target.id},time:1790000000000,title:'公开笔记',desc:'完整正文'}]]}})+'</script>'};};
  try{
    const signal=new AbortController().signal,first=await collect(target,s,null,signal,()=>{});
    current+=1000;const second=await collect(target,s,null,signal,()=>{},false);
    assert.equal(calls,1);assert.equal(second.data.fetchedAt,first.data.fetchedAt);assert.equal(second.notes[0].text,'完整正文');
    await collect(target,s,null,signal,()=>{},true);assert.equal(calls,2);
    current+=180001;await collect(target,s,null,signal,()=>{});assert.equal(calls,3);
  }finally{globalThis.fetch=originalFetch;Date.now=now;clearDatasets();}
});

function parallelFixture({count=10,failFirst=false,cancelDuringCreate=false,readableHTML=false}={}){
  const originalFetch=globalThis.fetch,originalChrome=globalThis.chrome;
  clearDatasets();const controller=new AbortController(),tabs=new Map(),created=[],removed=[],requested=[];
  let nextId=100,busy=0,peakBusy=0,peakTabs=0;
  const ids=Array.from({length:count},(_,i)=>(i+30).toString(16).padStart(24,'0'));
  const profile={userPageData:{posted:count,basicInfo:{nickname:'目标',desc:'公开简介'}},notes:[ids.map((id,i)=>({noteId:id,title:'项目'+i,user:{userId:uid},time:1790000000000+i*1000}))]};
  globalThis.fetch=async url=>{
    requested.push(String(url));
    if(!readableHTML)throw new Error('HTML unavailable');
    const id=new URL(url).pathname.split('/').at(-1);
    return {ok:true,url,text:async()=>`<script>window.__INITIAL_STATE__=${JSON.stringify({note:{noteDetailMap:{[id]:{note:{noteId:id,user:{userId:uid},desc:'HTML 完整正文',time:1790000000000}}}}})}</script>`};
  };
  globalThis.chrome={tabs:{
    create:async args=>{assert.equal(args.active,false);const id=nextId++;created.push(id);await new Promise(r=>setTimeout(r,id===100?4:12));tabs.set(id,args.url);peakTabs=Math.max(peakTabs,tabs.size);if(cancelDuringCreate && id===100)controller.abort(new Error('用户取消'));return {id};},
    update:async(id,args)=>{assert(tabs.has(id));tabs.set(id,args.url);return {id};},
    remove:async id=>{assert(tabs.has(id));removed.push(id);tabs.delete(id);},
  },scripting:{executeScript:async({target})=>{
    if(target.tabId===1)return [{result:{profile,details:[],url:'https://www.xiaohongshu.com/user/profile/'+uid}}];
    const url=tabs.get(target.tabId);assert(url);const id=new URL(url).pathname.split('/').at(-1);
    busy++;peakBusy=Math.max(peakBusy,busy);try{await new Promise(r=>setTimeout(r,18));}finally{busy--;}
    if(failFirst && id===ids.at(-1))return [{result:{loginWall:true}}];
    return [{result:{url,details:[{noteId:id,user:{userId:uid},title:'项目正文',desc:'公开制作记录 '+id,time:1790000000000+ids.indexOf(id)*1000}]}}];
  }}};
  return {controller,created,removed,requested,ids,profile,tabs,get peakBusy(){return peakBusy;},get peakTabs(){return peakTabs;},restore(){globalThis.fetch=originalFetch;globalThis.chrome=originalChrome;clearDatasets();}};
}
test('ten missing note bodies use three inactive reusable tabs and close only owned tabs',async()=>{
  const f=parallelFixture();try{
    const r=await collect(targetOf({id:uid}),settingsOf(),1,f.controller.signal,()=>{});
    assert.equal(r.notes.length,10);assert.equal(r.notes.filter(n=>n.full).length,10);
    assert.equal(f.created.length,3);assert.equal(f.peakTabs,3);assert.equal(f.peakBusy,3);
    assert.deepEqual([...f.removed].sort(),[...f.created].sort());assert.equal(f.tabs.size,0);
    assert(r.notes.every(n=>n.text.endsWith(n.id)),'each worker keeps its own note identity');
  }finally{f.restore();}
});
test('local concurrency can be reduced to one, and short samples create only needed tabs',async()=>{
  for(const [count,concurrency,expected] of [[4,1,1],[2,5,2]]){
    const f=parallelFixture({count});try{const r=await collect(targetOf({id:uid}),settingsOf({count,localConcurrency:concurrency}),1,f.controller.signal,()=>{});assert.equal(r.notes.filter(n=>n.full).length,count);assert.equal(f.created.length,expected);assert.equal(f.peakTabs,expected);}finally{f.restore();}
  }
});
test('cancellation during concurrent tab creation waits for all workers before closing every tab',async()=>{
  const f=parallelFixture({cancelDuringCreate:true});try{
    await assert.rejects(collect(targetOf({id:uid}),settingsOf(),1,f.controller.signal,()=>{}),/用户取消/);
    assert.equal(f.created.length,3);assert.deepEqual([...f.removed].sort(),[...f.created].sort());assert.equal(f.tabs.size,0);
  }finally{f.restore();}
});
test('one inaccessible page does not stop the other note workers',async()=>{
  const f=parallelFixture({failFirst:true});try{const r=await collect(targetOf({id:uid}),settingsOf(),1,f.controller.signal,()=>{});assert.equal(r.notes.length,10);assert.equal(r.notes.filter(n=>n.full).length,9);assert.equal(f.tabs.size,0);}finally{f.restore();}
});
test('successful HTML needs no fallback tabs; retry on the profile preserves cached bodies',async()=>{
  const f=parallelFixture({readableHTML:true});try{
    const args=[targetOf({id:uid}),settingsOf(),1,f.controller.signal,()=>{}];
    const first=await collect(...args);assert.equal(first.notes.filter(n=>n.full).length,10);assert.equal(f.created.length,0);assert.equal(f.requested.length,10);
    await collect(...args);assert.equal(f.requested.length,10);assert(f.requested.every(url=>new URL(url).origin==='https://www.xiaohongshu.com'));
  }finally{f.restore();}
});
