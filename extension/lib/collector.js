import { parseInitialState, profileOf, noteOf, uniqueNotes, sampleNotes, unwrap } from './core.js';
const datasets = new Map();
export function clearDatasets() { datasets.clear(); }
const pause = (ms, signal) => new Promise((resolve,reject)=>{
  if (signal.aborted) return reject(signal.reason);
  const id=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  const abort=()=>{clearTimeout(id);reject(signal.reason);}; signal.addEventListener('abort',abort,{once:true});
});
// Serialized by chrome.scripting: deliberately self-contained. Only the target's public posted tab is returned.
export function readPublicPage(expectedId) {
  const unref = v => v?._value ?? v?.value ?? v;
  const clone = v => { try { return JSON.parse(JSON.stringify(v)); } catch { return null; } };
  const state = window.__INITIAL_STATE__ || {};
  const pageId = location.pathname.match(/^\/user\/profile\/([a-f0-9]{24})(?:\/|$)/i)?.[1];
  const user = state.user || {};
  const pageData = unref(user.userPageData);
  let profile = null;
  if (pageId === expectedId && !/\/user\/profile\/[a-f0-9]+\/[a-f0-9]+/i.test(location.pathname)) {
    const basic = pageData?.basicInfo;
    if (basic) {
      const groups = unref(user.notes) || [];
      const first = Array.isArray(groups[0]) ? groups[0] : groups;
      profile = { userPageData:{basicInfo:{nickname:basic.nickname,desc:basic.desc,images:basic.images,imageb:basic.imageb}, tags:pageData.tags,posted:pageData.posted},
        notes:[clone(first)] };
    } else if (document.querySelector('#userPageContainer .user-name')) {
      const links = [...document.querySelectorAll('#userPostedFeeds section')];
      const notes = links.map(el=>{
        const a=el.querySelector('a[href*="/user/profile/"]'); if(!a)return null;
        const url=new URL(a.href); const id=url.pathname.split('/').filter(Boolean).pop();
        return {id, xsecToken:url.searchParams.get('xsec_token'), noteCard:{noteId:id, displayTitle:el.querySelector('.title')?.textContent || '', user:{userId:expectedId}, cover:{urlDefault:el.querySelector('img')?.src}}};
      }).filter(Boolean);
      profile={userPageData:{basicInfo:{nickname:document.querySelector('#userPageContainer .user-name')?.textContent,desc:document.querySelector('#userPageContainer .user-desc')?.textContent,images:document.querySelector('#userPageContainer img.user-image')?.src},tags:[],posted:null},notes:[notes]};
    }
  }
  const map=unref(state.note?.noteDetailMap) || {};
  const details=Object.values(map).map(v=>unref(v)?.note).filter(n=>(n?.user?.userId || n?.user?.user_id)===expectedId).map(n=>clone(n));
  const endText=document.querySelector('#userPostedFeeds')?.innerText || '';
  return { profile, details, url:location.href, loginWall:location.pathname.startsWith('/login') || Boolean(document.querySelector('.login-container') && !profile),
    endShown:/没有更多了|没有更多笔记|还没有发布过笔记/.test(endText) };
}
export function scrollProfile(expectedId) {
  if (!location.pathname.startsWith(`/user/profile/${expectedId}`)) return false;
  const root = document.scrollingElement;
  const candidates = [document.querySelector('.main-container'),root].filter(Boolean);
  const el = candidates.find(e=>e.scrollHeight>e.clientHeight+30) || root;
  el.scrollTo({top:el.scrollHeight,behavior:'instant'}); return true;
}
async function snapshot(tabId, id) {
  const res=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:readPublicPage,args:[id]}); return res[0]?.result;
}
async function htmlAt(url, signal, timeout=3000) {
  const u=new URL(url);
  if (u.origin!=='https://www.xiaohongshu.com' || !/^\/(user\/profile|explore)\//.test(u.pathname)) throw new Error('不支持的页面地址。');
  const r=await fetch(u.href,{credentials:'include',signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)])});
  if (!r.ok || new URL(r.url).origin!==u.origin || new URL(r.url).pathname.startsWith('/login')) throw new Error('页面需要登录或暂时不可访问。');
  const html=await r.text(); if(html.length>6e6)throw new Error('页面数据过大。');
  return parseInitialState(html);
}
function mergeDetail(notes, detail) {
  const map=new Map(detail.map(n=>[n.id,n]));
  return notes.map(n=>map.has(n.id)?{...n,...map.get(n.id),url:n.url}:n);
}
function detailsOf(snap, target) {
  return (snap?.details || []).map(n=>noteOf(n,target.id)).filter(Boolean).map(n=>{
    if (snap.url?.includes(n.id)) n.url=snap.url; return n;
  });
}
async function pool(items, concurrency, fn) {
  let index=0;const settled=await Promise.allSettled(Array.from({length:Math.min(concurrency,items.length)},async(_,worker)=>{
    while(index<items.length){ const i=index++; await fn(items[i],i,worker); }
  }));
  const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;
}
export async function collect(target, settings, sourceTabId, signal, emit, force=false) {
  const started=Date.now(), deadline=started+settings.budgetSeconds*1000;
  const indexDeadline=started+settings.budgetSeconds*650;
  const ownedTabs=new Set(),profileSlot={id:null};
  const concurrency=Math.min(5,Math.max(1,Math.round(Number(settings.localConcurrency)||3)));
  let data=null, initialDetails=[],fromDataset=false;
  const remaining=()=>Math.max(0,deadline-Date.now());
  const ensureTab=async(url,slot)=>{
    signal.throwIfAborted();
    if(slot.id===null){slot.id=(await chrome.tabs.create({url,active:false})).id;ownedTabs.add(slot.id);}
    else await chrome.tabs.update(slot.id,{url});
    signal.throwIfAborted();return slot.id;
  };
  const waitSnapshot=async(url, want,slot=profileSlot)=>{
    const tabId=await ensureTab(url,slot); const until=Math.min(deadline,Date.now()+4500);
    while(Date.now()<until){
      signal.throwIfAborted();
      const s=await snapshot(tabId,target.id).catch(()=>null);
      if(s?.loginWall)throw new Error('小红书登录已失效，请在浏览器中重新登录后再试。');
      if(s && want(s))return s;
      await pause(250,signal);
    }
    throw new Error('页面未能及时加载；请打开对方主页确认可访问后重试。');
  };
  try {
    emit({type:'progress',message:'正在读取对方的公开资料…'});
    const cached=datasets.get(target.id);
    if(!force && cached && Date.now()-cached.fetchedAt<180000 && (settings.mode==='recent' || cached.complete)){data=structuredClone(cached);fromDataset=true;}
    initialDetails=data?.notes.filter(n=>n.full)||[];
    if(sourceTabId) {
      const s=await snapshot(sourceTabId,target.id).catch(()=>null);
      initialDetails=uniqueNotes([...initialDetails,...detailsOf(s,target)]);
      if(s?.profile) { data=profileOf(s.profile,target);fromDataset=false; if(s.endShown)data.complete=true; }
    }
    if(!data){
      try { const state=await htmlAt(target.url,signal,Math.min(2800,remaining())); data=profileOf(state.user,target); }
      catch(err) { signal.throwIfAborted(); if(remaining()<1000)throw err; const s=await waitSnapshot(target.url,s=>s.profile);data=profileOf(s.profile,target);if(s.endShown)data.complete=true; }
    }
    emit({type:'profile',profile:data.profile});
    let shouldScan=()=>!data.complete && (settings.mode!=='recent' || data.notes.length<settings.count);
    if(shouldScan() && Date.now()<indexDeadline){ try {
      const s=await waitSnapshot(target.url,s=>s.profile);
      const fresh=profileOf(s.profile,target);fromDataset=false;data.notes=uniqueNotes([...data.notes,...fresh.notes]);data.complete=fresh.complete||s.endShown;
      let idle=0;
      while(shouldScan() && Date.now()<indexDeadline && idle<3 && data.notes.length<1000){
        emit({type:'progress',message:`已取得 ${data.notes.length} 条，正在加载${settings.mode==='recent'?'更多近期':'更早的'}内容…`});
        await chrome.scripting.executeScript({target:{tabId:profileSlot.id},world:'MAIN',func:scrollProfile,args:[target.id]});
        await pause(650,signal);
        const next=await snapshot(profileSlot.id,target.id);
        if(next?.loginWall){data.warnings.push('加载过程中遇到登录限制，仅使用此前取得的内容。');break;}
        if(!next?.profile)break;
        const d=profileOf(next.profile,target), before=data.notes.length;
        data.notes=uniqueNotes([...data.notes,...d.notes]);data.total=d.total ?? data.total;
        data.complete=d.complete || next.endShown || (data.total!==null && data.notes.length>=data.total);
        idle=data.notes.length===before?idle+1:0;
      }
    } catch {signal.throwIfAborted();data.warnings.push('继续加载未成功，本次使用已经取得的公开内容。');} }
    signal.throwIfAborted();
    data.notes=mergeDetail(data.notes,initialDetails);
    let selected=sampleNotes(data.notes,settings.mode,settings.count,settings.mix);
    let resolved=selected.filter(n=>n.full).length;
    emit({type:'progress',message:`已选 ${selected.length} 条，正在补充正文…`});
    // Each worker tries a short HTML read, then immediately fills that note with its own inactive tab.
    // Other workers keep going; one slow page never blocks the whole batch from opening fallback tabs.
    const missing=selected.filter(n=>!n.full),slots=Array.from({length:concurrency},(_,i)=>i?{id:null}:profileSlot);
    let parallelNotice=false;
    await pool(missing,concurrency,async(note,_index,worker)=>{
      signal.throwIfAborted();if(remaining()<300)return;
      try {
        const state=await htmlAt(note.url,signal,Math.min(1200,remaining()));
        const raw=unwrap(state.note?.noteDetailMap)?.[note.id]?.note;
        const full=raw && noteOf(raw,target.id);
        if(full?.id===note.id){Object.assign(note,full,{url:note.url});resolved++;emit({type:'progress',message:`正文 ${resolved}/${selected.length}，正在准备分析…`});}
      } catch { signal.throwIfAborted(); }
      if(note.full || remaining()<1200)return;signal.throwIfAborted();
      if(!parallelNotice){parallelNotice=true;emit({type:'progress',message:`正在用最多 ${Math.min(concurrency,missing.length)} 个后台页面并行补齐正文…`});}
      try {
        const s=await waitSnapshot(note.url,s=>s.details?.some(n=>(n.noteId||n.note_id)===note.id),slots[worker]);
        const n=detailsOf(s,target).find(n=>n.id===note.id);
        if(n){Object.assign(note,n,{url:note.url});resolved++;emit({type:'progress',message:`正文 ${resolved}/${selected.length}，正在并行补齐…`});}
      }catch{signal.throwIfAborted();}
    });
    signal.throwIfAborted();
    data.notes=mergeDetail(data.notes,selected);if(!fromDataset)data.fetchedAt=Date.now();
    datasets.set(target.id,structuredClone(data));if(datasets.size>20)datasets.delete(datasets.keys().next().value);
    // Re-sort by detail timestamps, which may correct a list item's missing timestamp.
    selected=sampleNotes(data.notes,settings.mode,settings.count,settings.mix);
    return { data, notes:selected, collectionMs:Date.now()-started };
  } finally {await Promise.allSettled([...ownedTabs].map(id=>chrome.tabs.remove(id)));}
}
export async function collectImages(notes, settings, signal) {
  if(settings.contentMode!=='vision')return [];
  const candidates=notes.filter(n=>n.images.length).slice(0,settings.imageLimit);
  const images=[];
  await pool(candidates,2,async(note)=>{
    try {
      const url=new URL(note.images[0]);if(!url.hostname.endsWith('.xhscdn.com') || url.protocol!=='https:')return;
      const r=await fetch(url.href,{credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(3000)])});
      const mime=(r.headers.get('content-type') || '').split(';')[0];
      if(!r.ok || !['image/jpeg','image/png','image/webp'].includes(mime) || Number(r.headers.get('content-length'))>1500000)return;
      const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>1500000)return;
      let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));
      images.push({noteId:note.id,data:`data:${mime};base64,${btoa(str)}`});
    } catch {signal.throwIfAborted();}
  });return images;
}
