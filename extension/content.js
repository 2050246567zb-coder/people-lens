(() => {
  if (window.__peopleLensLoaded) return;
  window.__peopleLensLoaded = true;
  let port, host, shadow, editor, target, requestId='', route=location.href, selectedComment=false, closed=false;
  let positionFrame=0, epoch=0, hadReplyContext=false, running=false, heartbeat=null, reconnectTimer=null, reconnectAttempts=0,retryRequired=false;
  let anchorObserver=null;
  let replyTarget=null,dismissed=false,reconcileQueued=false,detachTimer=null,replyPointerPending=false,replyPointerTimer=null;
  let renderedSummary='',activeTerm=null,tooltipTimer=null;
  let analysisResult=null,selectedRow=null,selectedSpeech=null;
  let advicePort=null,adviceRequestId='',adviceRunning=false,adviceHeartbeat=null,adviceReconnectTimer=null,adviceAttempts=0;
  let adviceContext=null,adviceStamp='',adviceOptions=[],adviceAttempted=false,adviceExpanded=false;
  let cardEngaged=false,lastPlacement=null;
  const $=s=>shadow.querySelector(s);
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const send=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,r=>{
    const err=chrome.runtime.lastError;if(err)return reject(new Error('扩展已更新，请刷新小红书页面。'));
    if(!r?.ok)return reject(new Error(r?.error||'扩展暂时未响应，请重试。'));resolve(r.value);
  }));
  function ensure(){
    if(host?.isConnected)return;
    host=el('div');host.id='people-lens-card';shadow=host.attachShadow({mode:'open'});
    const style=el('style');style.textContent=`
      :host{--surface:#fff;--ink:#1f1f1f;--muted:#686868;--edge:#e4e4e4;--soft:#f5f5f5;--accent:#2b60a2;--accent-soft:#edf3fa;--danger:#aa332b;--shadow:0 10px 32px #00000017;all:initial;position:fixed;z-index:2147483500;width:440px;display:none;color:var(--ink);font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color-scheme:light}
      *{box-sizing:border-box}section{display:flex;flex-direction:column;max-height:calc(100dvh - 24px);background:var(--surface);border:1px solid var(--edge);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button{border:0;background:transparent;color:var(--muted);padding:3px 6px;border-radius:6px}button:hover{background:var(--soft);color:var(--ink)}
      header{display:flex;align-items:center;gap:10px;padding:16px 18px;flex-shrink:0}.avatar-wrap{width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none;background:var(--soft)}.avatar{display:block;width:100%;height:100%;object-fit:cover}.avatar-fallback{display:grid;place-items:center;width:100%;height:100%;font-size:18px;color:var(--muted)}.person{flex:1;min-width:0}.person a{display:block;font-size:18px;font-weight:650;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none}.collapse{font-size:14px;min-height:32px}.close{font-size:24px;width:34px;height:34px;line-height:1}.body{padding:0 18px 16px;min-height:0;overflow:auto;overscroll-behavior:contain}.summary{white-space:pre-wrap;overflow-wrap:anywhere;font-size:18px;line-height:1.8;margin:0;color:var(--ink)}.summary:empty{display:none}.status{font-size:15px;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:7px}.busy:before{content:'';height:9px;width:9px;border-radius:50%;background:var(--accent);flex:none;animation:pulse 1.2s infinite}.error{color:var(--danger)}.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin-top:12px}.actions button{font-size:15px;min-height:36px}.primary{background:var(--accent-soft)!important;color:var(--accent)!important;padding:7px 12px!important}details{margin:12px 0 0;font-size:14px;color:var(--muted)}summary{cursor:pointer;min-height:32px;padding:3px 0}.more{margin:0 0 0 auto;text-align:right}.more summary{font-size:15px;list-style:none;padding:6px 8px}.more summary::-webkit-details-marker{display:none}.menu{display:grid;gap:4px;background:var(--soft);border-radius:9px;padding:8px;text-align:left}.menu button{white-space:nowrap;text-align:left}button.term{display:inline;padding:0;border-radius:2px;border-bottom:1px dotted var(--accent);color:var(--accent);font:inherit;line-height:inherit;vertical-align:baseline;background:transparent;text-align:inherit}button.term:hover,button.term:focus-visible{background:var(--accent-soft);color:var(--accent);border-bottom-style:solid}.term-tooltip{position:fixed;z-index:2147483501;width:300px;padding:13px 15px;border:1px solid var(--edge);border-radius:10px;box-shadow:var(--shadow);background:var(--surface);color:var(--ink);font-size:16px;line-height:1.7;overflow:auto;overflow-wrap:anywhere}.term-title{display:block;font-size:16px;margin-bottom:5px}.term-meaning{margin:0}button:disabled{opacity:.5;cursor:default}.advice-panel{margin-top:18px;border-top:1px solid var(--edge);padding-top:14px}.advice-header,.advice-item-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.advice-header{font-size:17px}.advice-again,.advice-copy{font-size:15px;flex:none}.advice-context{font-size:15px;color:var(--muted);margin-top:10px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.advice-status{font-size:15px;color:var(--muted);margin:9px 0}.advice-status.error{color:var(--danger)}.advice-list{display:grid;gap:10px}.advice-item{padding:12px 13px;background:var(--soft);border-radius:9px}.advice-label{font-size:14px;color:var(--muted)}.advice-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:17px;line-height:1.7;margin:6px 0 0;color:var(--ink)}.collapsed .body{display:none}[hidden]{display:none!important}@keyframes pulse{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.busy:before{animation:none}}
    `;shadow.append(style);
    const card=el('section');card.setAttribute('aria-label','人物公开内容速览');
    const header=el('header'),avatarWrap=el('div','avatar-wrap'),avatar=el('img','avatar'),fallback=el('span','avatar-fallback');
    avatar.alt='对方头像';avatar.referrerPolicy='no-referrer';avatar.decoding='async';avatar.hidden=true;fallback.setAttribute('aria-hidden','true');
    avatar.onerror=()=>{avatar.hidden=true;fallback.hidden=false;};avatar.onload=()=>{if(avatar.getAttribute('src')){avatar.hidden=false;fallback.hidden=true;}};
    avatarWrap.append(avatar,fallback);header.append(avatarWrap);
    const person=el('div','person'),name=el('a','name');name.target='_blank';name.rel='noopener noreferrer';person.append(name);header.append(person);
    const collapse=el('button','collapse','收起');collapse.type='button';collapse.onclick=()=>{card.classList.toggle('collapsed');collapse.textContent=card.classList.contains('collapsed')?'展开':'收起';position();};
    const close=el('button','close','×');close.type='button';close.setAttribute('aria-label','关闭人物速览');close.onclick=()=>{dismissed=true;hide();};header.append(collapse,close);
    const body=el('div','body'),status=el('div','status busy','正在准备…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const text=el('p','summary'),actions=el('div','actions');
    const analyze=el('button','primary analyze','分析此人');analyze.type='button';analyze.onclick=()=>start(retryRequired,false);
    const refresh=el('button','refresh','刷新资料并分析');refresh.type='button';refresh.onclick=()=>start(true,true);
    const openSettings=()=>send({type:'OPEN_SETTINGS'}).catch(error);
    const settings=el('button','settings','插件设置');settings.type='button';settings.onclick=openSettings;
    const configure=el('button','primary configure','连接 AI');configure.type='button';configure.hidden=true;configure.onclick=openSettings;
    const advice=el('button','primary advice-toggle','回复建议');advice.type='button';advice.title='后台提前生成，点击查看建议或生成进度';advice.setAttribute('aria-expanded','false');advice.setAttribute('aria-controls','people-lens-advice-panel');advice.onclick=toggleAdvice;
    const more=el('details','more'),menu=el('div','menu');menu.append(refresh,settings);more.append(el('summary',null,'更多'),menu);actions.append(analyze,configure,advice,more);
    const panel=el('div','advice-panel');panel.id='people-lens-advice-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','回复建议');
    const panelHeader=el('div','advice-header'),again=el('button','advice-again','换一组');again.type='button';again.onclick=()=>generateAdvice(true);
    panelHeader.append(el('strong',null,'回复建议'),again);const adviceStatus=el('div','advice-status');adviceStatus.setAttribute('role','status');adviceStatus.setAttribute('aria-live','polite');
    panel.append(panelHeader,el('div','advice-context'),adviceStatus,el('div','advice-list'));
    body.append(status,text,actions,panel);card.append(header,body);shadow.append(card);document.documentElement.append(host);
    const tooltip=el('div','term-tooltip');tooltip.id='people-lens-term-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
    tooltip.append(el('strong','term-title'),el('p','term-meaning'));shadow.append(tooltip);
    tooltip.onpointerenter=()=>clearTimeout(tooltipTimer);tooltip.onpointerleave=()=>queueTooltipHide();
    host.addEventListener('click',e=>e.stopPropagation());host.addEventListener('keydown',e=>{if(e.key==='Escape')hideTooltip();e.stopPropagation();});
    host.addEventListener('pointerdown',e=>{cardEngaged=true;clearTimeout(detachTimer);detachTimer=null;e.stopPropagation();position();});
    host.addEventListener('mousedown',e=>{if(e.composedPath().some(node=>node instanceof Element&&node.matches('button,summary')))e.preventDefault();e.stopPropagation();});
    host.addEventListener('focusin',()=>{cardEngaged=true;});
    new ResizeObserver(position).observe(card);
  }
  function connect(){
    if(port)return;
    const channel=chrome.runtime.connect({name:'people-lens'});port=channel;
    channel.onMessage.addListener(message=>{
      if(channel!==port || message.requestId!==requestId || closed || !running)return;
      if(message.type==='profile'){setPerson(message.profile);}
      else if(message.type==='progress')status(message.message,true);
      else if(message.type==='text'){renderSummary(message.text,message.terms);status('正在生成…',true);}
      else if(message.type==='coverage')setPerson(message.profile);
      else if(message.type==='done'){
        const r=message.result;renderSummary(r.text,r.terms);setPerson(r.profile);analysisResult=r;
        const age=new Date(r.analyzedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
        status(r.cached?`已读取缓存 · ${age}`:`分析完成 · ${(r.totalMs/1000).toFixed(1)} 秒`,false);
        $('.refresh').hidden=false;$('.analyze').hidden=true;
        settle();
        autoAdvice();
      } else if(message.type==='error')error(new Error(message.message));
      position();
    });
    channel.onDisconnect.addListener(()=>{
      // Read lastError even for intentional closes, so Chrome does not report an unchecked error.
      let reason='';try{reason=chrome.runtime.lastError?.message||'';}catch{reason='Extension context invalidated';}
      if(channel!==port)return;port=null;stopHeartbeat();
      if(!running || closed)return;
      if(/context invalidated|extension.*(?:unloaded|updated)/i.test(reason||'')){error(new Error('扩展已更新，请刷新当前小红书页面后重试。'));return;}
      if(reconnectAttempts>=2){error(new Error('连接暂时无法恢复，已显示的内容会保留。请点击重试。'));return;}
      const rid=requestId;reconnectAttempts++;status('正在恢复连接…',true);
      reconnectTimer=setTimeout(()=>{
        reconnectTimer=null;if(!running || closed || requestId!==rid)return;
        try{connect();keepalive();port.postMessage({type:'resume',requestId:rid,target});}
        catch{error(new Error('扩展连接不可用，请刷新当前小红书页面后重试。'));}
      },reconnectAttempts*250);
    });
  }
  function stopHeartbeat(){if(heartbeat!==null)clearInterval(heartbeat);heartbeat=null;}
  function keepalive(){stopHeartbeat();heartbeat=setInterval(()=>{if(running && port)try{port.postMessage({type:'ping',requestId});}catch{}},15000);}
  function settle(){running=false;stopHeartbeat();clearTimeout(reconnectTimer);reconnectTimer=null;const channel=port;port=null;try{channel?.disconnect?.();}catch{}}
  function status(message,busy){$('.status').textContent=message;$('.status').className=`status${busy?' busy':''}`;}
  function error(err){settle();retryRequired=true;ensure();$('.status').className='status error';$('.status').textContent=err.message;$('.analyze').hidden=false;$('.analyze').textContent='重试';$('.refresh').hidden=true;position();}
  function safeLink(url){try{const u=new URL(url);return u.origin==='https://www.xiaohongshu.com'?u.href:'#';}catch{return '#';}}
  function safeAvatar(input){
    if(typeof input!=='string' || input.length>4096)return '';
    try{const u=new URL(input,'https://www.xiaohongshu.com');return u.protocol==='https:' && u.hostname.endsWith('.xhscdn.com') && !u.username && !u.password?u.href:'';}catch{return '';}
  }
  function setPerson(profile){
    if(!profile)return;
    const name=profile.name||target.name;$('.name').textContent=name;$('.name').href=safeLink(profile.url||target.url);
    const image=$('.avatar'),fallback=$('.avatar-fallback'),url=safeAvatar(profile.avatar)||safeAvatar(target.avatar);
    fallback.textContent=Array.from(name.trim())[0]||'·';
    if(!url){image.removeAttribute('src');image.hidden=true;fallback.hidden=false;}
    else if(image.getAttribute('src')!==url){image.src=url;image.hidden=false;fallback.hidden=true;}
  }
  function description(text){
    return String(text||'').replace(/\[(?:P|\d{1,2})(?:\s*[,，、;；\-–]\s*(?:P|\d{1,2}))*\]|【(?:P|\d{1,2})(?:\s*[,，、;；\-–]\s*(?:P|\d{1,2}))*】/gi,'')
      .replace(/[\[【](?:(?:P|\d{1,2})(?:\s*[,，、;；\-–]\s*(?:P|\d{1,2}))*)?$/gi,'');
  }
  function renderSummary(raw,terms=[]){
    const text=description(raw),list=[],seen=new Set();
    for(const entry of Array.isArray(terms)?terms:[]){
      if(typeof entry?.term!=='string'||typeof entry?.meaning!=='string')continue;
      const term=entry.term.trim(),meaning=entry.meaning.trim(),key=term.toLowerCase();
      if(term.length<2||term.length>32||meaning.length<4||meaning.length>240||seen.has(key)||/[\r\n]/.test(term))continue;
      seen.add(key);list.push({term,meaning});if(list.length===6)break;
    }
    const key=JSON.stringify([text,list]);if(key===renderedSummary)return;renderedSummary=key;hideTooltip();
    const summary=$('.summary');summary.replaceChildren();
    if(!list.length){summary.textContent=text;return;}
    const byName=new Map(list.map(t=>[t.term.toLowerCase(),t])),used=new Set();
    const pattern=list.map(t=>t.term).sort((a,b)=>b.length-a.length).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const regex=new RegExp(pattern,'gi');let last=0,match;
    while((match=regex.exec(text))){
      const term=byName.get(match[0].toLowerCase()),name=term.term.toLowerCase(),end=match.index+match[0].length;
      if(used.has(name)||(/^[a-z0-9_]+$/i.test(term.term)&&(/[a-z0-9_]/i.test(text[match.index-1]||'')||/[a-z0-9_]/i.test(text[end]||''))))continue;
      summary.append(document.createTextNode(text.slice(last,match.index)));const button=el('button','term',match[0]);button.type='button';
      button.onpointerenter=()=>showTerm(button,term);button.onpointerleave=()=>queueTooltipHide();button.onfocus=()=>showTerm(button,term);button.onblur=()=>hideTooltip();button.onclick=()=>showTerm(button,term);
      summary.append(button);used.add(name);last=end;
    }
    summary.append(document.createTextNode(text.slice(last)));
  }
  function hideTooltip(){clearTimeout(tooltipTimer);tooltipTimer=null;activeTerm?.removeAttribute('aria-describedby');activeTerm=null;if(shadow)$('.term-tooltip').hidden=true;}
  function queueTooltipHide(){clearTimeout(tooltipTimer);tooltipTimer=setTimeout(hideTooltip,180);}
  function showTerm(button,term){
    if(closed||!button.isConnected)return;clearTimeout(tooltipTimer);activeTerm?.removeAttribute('aria-describedby');activeTerm=button;
    const tooltip=$('.term-tooltip');$('.term-title').textContent=button.textContent;$('.term-meaning').textContent=description(term.meaning);tooltip.hidden=false;button.setAttribute('aria-describedby',tooltip.id);
    placeTooltip();
  }
  function placeTooltip(){
    if(!activeTerm)return;const tooltip=$('.term-tooltip'),v=window.visualViewport,x=v?.offsetLeft||0,y=v?.offsetTop||0,w=v?.width||innerWidth,h=v?.height||innerHeight;
    tooltip.style.width=Math.min(300,w-24)+'px';tooltip.style.maxHeight=Math.max(80,h-24)+'px';
    const r=activeTerm.getBoundingClientRect(),height=tooltip.getBoundingClientRect().height,width=tooltip.getBoundingClientRect().width;
    tooltip.style.left=Math.max(x+12,Math.min(r.left,x+w-width-12))+'px';
    const top=r.top-y>=height+20?r.top-height-8:r.bottom+8;tooltip.style.top=Math.max(y+12,Math.min(top,y+h-height-12))+'px';
  }
  function rgba(value){
    const m=String(value||'').match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null;
  }
  const blend=(a,b,ratio)=>a.map((v,i)=>Math.round(v*ratio+b[i]*(1-ratio)));
  const rgb=v=>`rgb(${v.slice(0,3).join(', ')})`;
  function luminance(color){const c=color.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;}
  function syncTheme(){
    if(!host||!editor||typeof getComputedStyle!=='function')return;
    const anchor=editor.closest('.engage-bar')||editor.parentElement,colors=[];
    for(let node=anchor;node;node=node.parentElement){const c=rgba(getComputedStyle(node).backgroundColor);if(c&&c[3]>0){colors.push(c);if(c[3]>=0.999)break;}}
    const prefersDark=window.matchMedia?.('(prefers-color-scheme: dark)').matches;let bg=prefersDark?[24,24,24]:[255,255,255];
    for(const c of colors.reverse())bg=blend(c.slice(0,3),bg,Math.min(1,c[3]));
    const dark=luminance(bg)<0.25,raw=rgba(getComputedStyle(anchor).color);let ink=raw?blend(raw.slice(0,3),bg,raw[3]):dark?[242,242,242]:[31,31,31];
    const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+0.05)/(Math.min(luminance(a),luminance(b))+0.05);
    if(contrast(ink,bg)<4.5)ink=dark?[245,245,245]:[24,24,24];
    let accent=dark?[152,192,255]:[43,96,162];if(contrast(accent,bg)<4.5)accent=ink;
    const vars={'--surface':rgb(bg),'--ink':rgb(ink),'--muted':rgb(blend(ink,bg,0.68)),'--edge':rgb(blend(ink,bg,0.16)),'--soft':rgb(blend(ink,bg,0.065)),
      '--accent':rgb(accent),'--accent-soft':rgb(blend(accent,bg,0.09)),'--danger':dark?'#ffa3a3':'#aa332b','--shadow':dark?'0 12px 40px #0007':'0 10px 32px #00000017'};
    for(const [key,value] of Object.entries(vars))if(host.style.getPropertyValue(key)!==value)host.style.setProperty(key,value);
    host.style.colorScheme=dark?'dark':'light';
  }
  const publicText=(node,max)=>String(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim().slice(0,max);
  function rowSpeech(row,person){
    const link=[...row.querySelectorAll('.author .name[href*="/user/profile/"]')].find(a=>a.closest('.comment-item')===row),author=personFromLink(link);
    if(!author||author.id!==person.id)throw new Error('发言对象已变化，请重新点击那条评论的回复。');
    const ownText=r=>{
      for(const selector of ['.note-text','.content','p']){const node=[...r.querySelectorAll(selector)].find(n=>n.closest('.comment-item')===r);if(node)return publicText(node,2000);}return '';
    };
    const parent=row.parentElement?.closest('.comment-item'),parentLink=parent&&[...parent.querySelectorAll('.author .name')].find(a=>a.closest('.comment-item')===parent);
    return {comment:{id:row.id?.match(/^comment-([a-f0-9]{24})$/i)?.[1]||'',authorId:author.id,name:author.name,text:ownText(row)},
      parent:parent?{name:publicText(parentLink,80),text:ownText(parent).slice(0,1500)}:null};
  }
  function findContextRow(person){
    const rows=[...document.querySelectorAll('#noteContainer .comment-item')].filter(row=>{
      const link=[...row.querySelectorAll('.author .name[href*="/user/profile/"]')].find(a=>a.closest('.comment-item')===row);return personFromLink(link)?.id===person.id;
    });
    if(rows.length===1)return rows[0];
    const excerpt=publicText(replyContext(inputNow()),500).replace(/^回复\s*[:：]?\s*/,'').replace(person.name,'').trim();
    if(!excerpt)return null;const matches=rows.filter(row=>{const text=rowSpeech(row,person).comment.text;return text&&(excerpt.startsWith(text)||text.startsWith(excerpt));});return matches.length===1?matches[0]:null;
  }
  function readAdviceContext(){
    const root=document.querySelector('#noteContainer');if(!root)throw new Error('当前笔记已关闭，请重新打开后再试。');
    const path=new URL(location.href).pathname,id=path.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i)?.[1]||path.match(/^\/user\/profile\/[a-f0-9]{24}\/([a-f0-9]{24})(?:\/|$)/i)?.[1];
    const post={id,authorId:noteAuthor()?.id||'',title:publicText(root.querySelector('#detail-title')||root.querySelector('h1'),500),text:publicText(root.querySelector('#detail-desc'),6000)};
    if(!id||(!post.title&&!post.text))throw new Error('没有读到当前笔记的内容，请打开完整笔记后再试。');
    if(!selectedComment)return {mode:'post',post,comment:null,parent:null};
    const row=selectedRow?.isConnected?selectedRow:findContextRow(target),speech=row?rowSpeech(row,target):selectedSpeech;
    if(!speech||speech.comment.authorId!==target.id)throw new Error('请重新点击要回复的那条评论，以确认具体发言。');
    if(!speech.comment.text)throw new Error('这条发言没有可读取的文字，暂时无法生成准确的回复建议。');
    return {mode:'comment',post,...speech};
  }
  function adviceStatus(message,error=false){$('.advice-status').textContent=message;$('.advice-status').classList.toggle('error',error);}
  function stopAdviceTransport(){
    adviceRunning=false;clearInterval(adviceHeartbeat);adviceHeartbeat=null;clearTimeout(adviceReconnectTimer);adviceReconnectTimer=null;const channel=advicePort;advicePort=null;try{channel?.disconnect?.();}catch{}
  }
  function cancelAdvice(clear=false){
    if(adviceRunning&&advicePort)try{advicePort.postMessage({type:'cancel',requestId:adviceRequestId});}catch{}stopAdviceTransport();
    if(clear){adviceRequestId='';adviceContext=null;adviceStamp='';adviceOptions=[];adviceAttempted=false;adviceExpanded=false;
      if(shadow){$('.advice-panel').hidden=true;$('.advice-list').replaceChildren();$('.advice-again').disabled=false;$('.advice-toggle').textContent='回复建议';$('.advice-toggle').setAttribute('aria-expanded','false');}}
  }
  function renderAdvice(list){
    adviceOptions=(Array.isArray(list)?list:[]).filter(s=>typeof s?.text==='string'&&s.text.trim()&&s.text.length<=280).slice(0,3);
    const holder=$('.advice-list');holder.replaceChildren();
    for(const suggestion of adviceOptions){
      const item=el('div','advice-item'),top=el('div','advice-item-top'),copy=el('button','advice-copy','复制');copy.type='button';
      top.append(el('span','advice-label',String(suggestion.label||'建议').slice(0,12)),copy);item.append(top,el('p','advice-text',suggestion.text));holder.append(item);
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(suggestion.text);if(copy.isConnected)copy.textContent='已复制';}catch{adviceStatus('复制失败，可以选中文字手动复制。',true);}};
    }position();
  }
  function adviceFailed(error){stopAdviceTransport();adviceStatus(error.message||'回复建议生成失败，请重试。',true);$('.advice-again').disabled=false;$('.advice-again').textContent='重试';position();}
  function adviceStillCurrent(){
    try{return adviceStamp===JSON.stringify(readAdviceContext());}catch{return false;}
  }
  function keepAdviceAlive(){clearInterval(adviceHeartbeat);adviceHeartbeat=setInterval(()=>{if(adviceRunning&&advicePort)try{advicePort.postMessage({type:'ping',requestId:adviceRequestId});}catch{}},15000);}
  function connectAdvice(){
    const channel=chrome.runtime.connect({name:'people-lens-replies'});advicePort=channel;
    channel.onMessage.addListener(message=>{
      if(channel!==advicePort||message.requestId!==adviceRequestId||closed||!adviceRunning)return;
      if(!adviceStillCurrent()){cancelAdvice(true);adviceStatus('对话内容已变化，请重新生成建议。',true);return;}
      if(message.type==='progress')adviceStatus(message.message);
      else if(message.type==='options')renderAdvice(message.suggestions);
      else if(message.type==='done'){
        renderAdvice(message.result.suggestions);stopAdviceTransport();adviceStatus(message.result.cached?'已读取这条对话的建议，可复制后修改。':'可复制后修改，再由你发送。');$('.advice-again').disabled=false;$('.advice-again').textContent='换一组';
      }else if(message.type==='error')adviceFailed(new Error(message.message));position();
    });
    channel.onDisconnect.addListener(()=>{
      let reason='';try{reason=chrome.runtime.lastError?.message||'';}catch{reason='context invalidated';}
      if(channel!==advicePort)return;advicePort=null;clearInterval(adviceHeartbeat);adviceHeartbeat=null;
      if(!adviceRunning||closed)return;
      if(/context invalidated|extension.*(?:unloaded|updated)/i.test(reason)||adviceAttempts>=2){adviceFailed(new Error('回复连接已中断，已显示的建议会保留，请重试。'));return;}
      const rid=adviceRequestId;adviceAttempts++;adviceStatus('正在恢复回复连接…');
      adviceReconnectTimer=setTimeout(()=>{adviceReconnectTimer=null;if(!adviceRunning||closed||adviceRequestId!==rid)return;try{connectAdvice();keepAdviceAlive();advicePort.postMessage({type:'resume',requestId:rid,target,context:adviceContext});}catch{adviceFailed(new Error('连接暂时不可用，请刷新页面后再试。'));}},adviceAttempts*250);
    });
  }
  function generateAdvice(refresh=false){
    if(adviceRunning)return;
    try{
      if(!analysisResult)throw new Error('请先完成人物介绍，再生成回复建议。');
      const context=readAdviceContext(),avoid=refresh?adviceOptions.map(s=>s.text):[];cancelAdvice();adviceContext=context;adviceStamp=JSON.stringify(context);adviceRequestId=crypto.randomUUID();adviceAttempts=0;adviceAttempted=true;
      $('.advice-panel').hidden=!adviceExpanded;$('.advice-context').textContent=context.comment?`对方说：${context.comment.text.slice(0,100)}`:`针对笔记：${context.post.title}`;$('.advice-again').disabled=true;renderAdvice([]);adviceStatus('正在想几种合适的回复…');
      connectAdvice();adviceRunning=true;keepAdviceAlive();advicePort.postMessage({type:'suggest',requestId:adviceRequestId,target,context,refresh,avoid});
    }catch(error){adviceAttempted=true;$('.advice-panel').hidden=!adviceExpanded;adviceFailed(error);}position();
  }
  function toggleAdvice(){
    adviceExpanded=!adviceExpanded;$('.advice-panel').hidden=!adviceExpanded;$('.advice-toggle').textContent=adviceExpanded?'收起建议':'回复建议';$('.advice-toggle').setAttribute('aria-expanded',String(adviceExpanded));
    if(adviceExpanded&&!adviceAttempted)adviceStatus('人物介绍完成后，会自动在后台准备回复建议。');
    position();
  }
  function autoAdvice(){if(analysisResult&&!adviceAttempted&&!adviceRunning&&!closed&&!dismissed&&!replyPointerPending)generateAdvice(false);}
  function cancel(){const wasRunning=running;running=false;stopHeartbeat();clearTimeout(reconnectTimer);reconnectTimer=null;if(wasRunning && port)try{port.postMessage({type:'cancel',requestId});}catch{}}
  function hide(){closed=true;epoch++;cancel();cancelAdvice(true);hideTooltip();anchorObserver?.disconnect();anchorObserver=null;cardEngaged=false;lastPlacement=null;if(host)host.style.display='none';}
  function position(){
    if(positionFrame)return;positionFrame=requestAnimationFrame(()=>{
      positionFrame=0;if(!host || closed)return;
      syncTheme();
      let r,input;
      if(editor?.isConnected){const anchor=editor.closest('.engage-bar')||editor;r=anchor.getBoundingClientRect();input=editor.getBoundingClientRect();if(input.width>=20&&r.width>=20)lastPlacement={r,input};}
      if(!input||input.width<20){
        if(cardEngaged&&lastPlacement&&document.querySelector('#noteContainer'))({r,input}=lastPlacement);
        else {host.style.visibility='hidden';if(!editor?.isConnected)scheduleReconcile();return;}
      }
      const v=window.visualViewport;
      const vx=v?.offsetLeft||0,vy=v?.offsetTop||0,vw=v?.width||innerWidth,vh=v?.height||innerHeight,margin=12,gap=10;
      if(input.width<20 || input.bottom<vy || input.top>vy+vh || r.bottom<vy || r.top>vy+vh){host.style.visibility='hidden';return;}
      const left=Math.max(vx+margin,r.left),right=Math.min(vx+vw-margin,r.right),width=right-left;
      const above=r.top-vy-margin-gap,below=vy+vh-margin-r.bottom-gap,placeAbove=above>=160 || above>=below;
      const maxHeight=Math.floor(placeAbove?above:below);
      if(width<160 || maxHeight<68){host.style.visibility='hidden';return;}
      host.style.visibility='visible';host.style.width=width+'px';host.style.left=left+'px';
      const card=shadow.querySelector('section');card.style.maxHeight=maxHeight+'px';
      const height=card.getBoundingClientRect().height;
      host.style.top=(placeAbove?r.top-gap-height:r.bottom+gap)+'px';
      if(activeTerm)placeTooltip();
    });
  }
  async function show(t,input,manual=false){
    cancel();target=t;closed=false;retryRequired=false;hadReplyContext=Boolean(selectedComment && replyContext(input));const g=++epoch;ensure();
    host.style.display='block';shadow.querySelector('section').classList.remove('collapsed');$('.collapse').textContent='收起';setPerson(t);
    analysisResult=null;cancelAdvice(true);cardEngaged=false;lastPlacement=null;
    bindEditor(input);
    renderSummary('');syncTheme();$('.analyze').hidden=true;$('.refresh').hidden=true;$('.configure').hidden=true;$('.more').open=false;status('正在准备…',true);position();
    try{
      const config=await send({type:'PUBLIC_SETTINGS'});if(g!==epoch)return;
      if(!config.enabled){hide();return;}
      if(!config.configured){status('连接你的 AI 后，即可查看介绍。',false);$('.analyze').hidden=true;$('.configure').hidden=false;return;}
      if(config.autoAnalyze || manual)start(false);else{status('已识别回复对象，点击开始分析。',false);$('.analyze').textContent='分析此人';$('.analyze').hidden=false;}
    }catch(err){if(g===epoch)error(err);}
  }
  function start(refresh=false,refreshData=false){
    try{cancel();cancelAdvice(true);analysisResult=null;connect();requestId=crypto.randomUUID();running=true;reconnectAttempts=0;retryRequired=false;keepalive();renderSummary('');$('.analyze').hidden=true;$('.refresh').hidden=true;$('.configure').hidden=true;$('.more').open=false;status('正在读取公开内容…',true);port.postMessage({type:'analyze',requestId,target,refresh,refreshData});}
    catch{error(new Error('扩展已更新，请刷新小红书页面。'));}
  }
  function personFromLink(a,name){
    if(!a)return null;try{const url=new URL(a.href),id=url.pathname.match(/^\/user\/profile\/([a-f0-9]{24})\/?$/i)?.[1];
      if(!id || url.origin!=='https://www.xiaohongshu.com')return null;
      const row=a.closest('.comment-item'),scope=row||a.closest('.author')||a;let avatar='';
      for(const link of [a,...scope.querySelectorAll('a[href*="/user/profile/"]')]){
        if(row && link.closest('.comment-item')!==row)continue;
        try{const u=new URL(link.href);if(u.origin!==url.origin || u.pathname.replace(/\/$/,'')!==`/user/profile/${id}`)continue;}catch{continue;}
        const image=link.querySelector('img');avatar=safeAvatar(image?.currentSrc||image?.getAttribute('src')||image?.getAttribute('data-src'));if(avatar)break;
      }
      return {id,name:name||a.textContent.trim()||'这位用户',url:url.href,avatar};}catch{return null;}
  }
  function noteAuthor(){const links=[...document.querySelectorAll('#noteContainer > .author a[href*="/user/profile/"]')];return personFromLink(links.find(a=>a.textContent.trim()) || links[0]);}
  function inputNow(){
    const inputs=[...document.querySelectorAll('#noteContainer #content-textarea[contenteditable="true"]')];
    const visible=input=>{const r=input.getBoundingClientRect();return r.width>0 && r.height>0 && !input.closest('[hidden]');};
    return inputs.find(input=>input===document.activeElement&&visible(input))||inputs.find(visible)||inputs.at(-1)||null;
  }
  function replyContext(input){return input?.closest('.engage-bar')?.querySelector('.reply-content:not([hidden])');}
  function bindEditor(input){
    if(editor!==input || !anchorObserver){editor=input;anchorObserver?.disconnect();anchorObserver=new ResizeObserver(position);anchorObserver.observe(input);anchorObserver.observe(input.closest('.engage-bar')||input);}
    syncTheme();position();
  }
  function clearReply(){
    clearTimeout(detachTimer);detachTimer=null;clearTimeout(replyPointerTimer);replyPointerTimer=null;replyPointerPending=false;selectedComment=false;replyTarget=null;selectedRow=null;selectedSpeech=null;target=null;analysisResult=null;hadReplyContext=false;hide();dismissed=false;
  }
  function contextPerson(input){
    const context=replyContext(input);if(!context)return null;
    const direct=personFromLink(context.querySelector('a[href*="/user/profile/"]'));if(direct)return direct;
    const label=context.textContent.trim().replace(/^回复\s*[:：]?\s*/,'');
    const matches=[...document.querySelectorAll('#noteContainer .comment-item .author .name[href*="/user/profile/"]')]
      .filter(a=>a.textContent.trim() && label.startsWith(a.textContent.trim())).sort((a,b)=>b.textContent.trim().length-a.textContent.trim().length);
    if(!matches.length)return null;
    const longest=matches[0].textContent.trim(),people=matches.filter(a=>a.textContent.trim()===longest).map(a=>personFromLink(a)).filter(Boolean);
    return new Set(people.map(p=>p.id)).size===1?people[0]:null;
  }
  function checkDetached(){
    if(detachTimer!==null)return;
    detachTimer=setTimeout(()=>{
      detachTimer=null;const input=inputNow();
      if(!document.querySelector('#noteContainer')||(!input&&!cardEngaged))clearReply();
      else if(input&&!closed)bindEditor(input);
      else if(!closed)position();
    },!inputNow() && selectedComment?2500:180);
  }
  function reconcileInput(){
    if(replyPointerPending)return;
    if(host&&!closed&&!document.querySelector('#noteContainer')){clearReply();return;}
    const input=inputNow();if(!input){if(host&&!closed){if(cardEngaged&&lastPlacement)position();else host.style.visibility='hidden';}if(editor||selectedComment)checkDetached();return;}
    clearTimeout(detachTimer);detachTimer=null;
    if(selectedComment && replyTarget && !dismissed){
      if(target?.id===replyTarget.id && !closed && host?.isConnected){bindEditor(input);hadReplyContext ||= Boolean(replyContext(input));}
      else show(replyTarget,input);
    }else if(!closed && target && !dismissed)bindEditor(input);
    autoAdvice();
  }
  function scheduleReconcile(){if(reconcileQueued)return;reconcileQueued=true;queueMicrotask(()=>{reconcileQueued=false;reconcileInput();});}
  function chooseReply(event){
    if(event.composedPath().includes(host)){cardEngaged=true;return false;}
    cardEngaged=false;
    const button=event.target instanceof Element && event.target.closest('.reply'),row=button?.closest('.comment-item');if(!row)return false;
    clearTimeout(replyPointerTimer);replyPointerTimer=null;
    selectedComment=true;dismissed=false;hadReplyContext=false;clearTimeout(detachTimer);detachTimer=null;
    const a=[...row.querySelectorAll('.author .name[href*="/user/profile/"]')].find(a=>a.closest('.comment-item')===row);
    replyTarget=personFromLink(a);
    if(!replyTarget){replyPointerPending=false;target=null;hide();return true;}
    if(selectedRow!==row)cancelAdvice(true);selectedRow=row;selectedSpeech=rowSpeech(row,replyTarget);
    if(event.type==='pointerdown'){replyPointerPending=true;return true;}
    replyPointerPending=false;
    scheduleReconcile();return true;
  }
  // Lock the comment identity before a native or framework-driven focus event can select the post author.
  document.addEventListener('pointerdown',chooseReply,true);
  document.addEventListener('pointerup',()=>{if(replyPointerPending)replyPointerTimer=setTimeout(()=>{if(replyPointerPending)clearReply();},200);},true);
  document.addEventListener('pointercancel',()=>{if(replyPointerPending)clearReply();},true);
  document.addEventListener('click',event=>{
    if(event.composedPath().includes(host))return;
    if(event.target instanceof Element && event.target.closest('#noteContainer .btn.cancel')){clearReply();return;}
    chooseReply(event);
  },true);
  document.addEventListener('focusin',event=>{
    if(event.target?.id!=='content-textarea')return;
    dismissed=false;
    if(selectedComment){scheduleReconcile();return;}
    if(replyContext(event.target)){selectedComment=true;replyTarget=contextPerson(event.target);if(!replyTarget){target=null;hide();}else{selectedRow=findContextRow(replyTarget);selectedSpeech=selectedRow?rowSpeech(selectedRow,replyTarget):null;}scheduleReconcile();return;}
    const t=noteAuthor();if(t){if(target?.id===t.id && !closed)bindEditor(event.target);else show(t,event.target);}
  });
  // Route and modal removal invalidate identity; a rerender must not keep a stale person's card.
  new MutationObserver(records=>{
    if(route!==location.href){route=location.href;clearReply();return;}
    if(records.some(r=>r.target!==host && !host?.contains(r.target)))scheduleReconcile();
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','contenteditable','data-theme','theme','data-color-mode']});
  addEventListener('scroll',()=>{hideTooltip();position();},true);addEventListener('resize',()=>{hideTooltip();position();});
  window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{syncTheme();position();});
  chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{
    if(msg.type==='OPTIONS_CHANGED'){clearReply();respond({ok:true});return;}
    if(msg.type!=='SHOW_ACTIVE')return;
    const input=inputNow();const t=selectedComment?replyTarget:replyContext(input)?contextPerson(input):noteAuthor();
    if(input && t){
      if(!selectedComment&&replyContext(input)){selectedComment=true;replyTarget=t;selectedRow=findContextRow(t);selectedSpeech=selectedRow?rowSpeech(selectedRow,t):null;}
      dismissed=false;show(t,input,true);respond({ok:true});
    }
    else respond({ok:false,error:'请打开一篇笔记，然后点击评论区的回复按钮。'});
  });
})();
