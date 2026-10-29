import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {parseHTML} from 'linkedom';
const code=await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
const id=n=>n.toString(16).padStart(24,'0'),href=n=>`https://www.xiaohongshu.com/user/profile/${id(n)}`;
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(config={},layout={}){
  const {window,document}=parseHTML(`<html><body><div id="noteContainer"><h1 id="detail-title">周末做的小书架</h1><div id="detail-desc">分享木板接合与打磨的过程。</div><div class="author"><a href="${href(1)}">作者</a></div><div class="comment-item" id="parent"><div class="author"><a class="name" href="${href(2)}">甲</a></div><div class="content"><span class="note-text">父评论讨论书架的设计。</span></div><div class="reply">回复</div><div class="comment-item comment-item-sub" id="child"><div class="author"><a class="name" href="${href(3)}">乙</a></div><div class="content"><span class="note-text">想知道连接处是怎么做的？</span></div><div class="reply">回复</div></div></div><div class="engage-bar"><div class="reply-content">回复乙</div><p id="content-textarea" contenteditable="true"></p><button class="btn cancel">取消</button></div></div></body></html>`);
  const sent=[],listeners=[],messages=[],ports=[],intervals=new Map(),timeouts=new Map(),frames=[],observers=[],copyWrites=[];let timerId=0;
  const createPort=()=>{
    const incoming=[],disconnects=[];let closed=false;
    const port={postMessage:m=>{if(closed)throw new Error('port closed');sent.push(m);},onMessage:{addListener:f=>{incoming.push(f);listeners.push(f);}},onDisconnect:{addListener:f=>disconnects.push(f)},disconnect:()=>{if(closed)return;closed=true;for(const fn of disconnects)fn();},receive:e=>incoming.forEach(fn=>fn(e))};
    ports.push(port);return port;
  };
  const chrome={runtime:{lastError:null,connect:createPort,sendMessage:(msg,cb)=>queueMicrotask(()=>cb({ok:true,value:{enabled:true,autoAnalyze:true,configured:true,...config}})),onMessage:{addListener:f=>messages.push(f)}}};
  const context={window:{},navigator:{clipboard:{writeText:async text=>copyWrites.push(text)}},document,Element:window.Element,MutationObserver:window.MutationObserver,ResizeObserver:class{constructor(fn){this.fn=fn;this.nodes=new Set();observers.push(this);}observe(node){this.nodes.add(node);}disconnect(){this.nodes.clear();}},chrome,crypto,URL,queueMicrotask,getComputedStyle:node=>({backgroundColor:node.style?.backgroundColor||(node===document.body?(layout.background||'rgb(255, 255, 255)'):'rgba(0, 0, 0, 0)'),color:node.style?.color||layout.foreground||'rgb(31, 31, 31)'}),requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},setInterval:fn=>{const id=++timerId;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),setTimeout:fn=>{const id=++timerId;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),addEventListener:window.addEventListener.bind(window),innerWidth:layout.width||1200,innerHeight:layout.height||800,location:{href:'https://www.xiaohongshu.com/explore/'+id(9)}};
  const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
  document.querySelector('#content-textarea').getBoundingClientRect=()=>layout.input||rect(100,650,300,40);
  document.querySelector('.engage-bar').getBoundingClientRect=()=>layout.anchor||rect(90,620,340,100);
  vm.runInNewContext(code,context);const click=sel=>document.querySelector(sel).dispatchEvent(new window.Event('click',{bubbles:true,composed:true}));
  return {document,sent,listeners,messages,click,window,ports,intervals,timeouts,context,layout,rect,observers,copyWrites,flushLayout:()=>{const host=document.querySelector('#people-lens-card'),card=host?.shadowRoot?.querySelector('section');if(card)card.getBoundingClientRect=()=>rect(0,0,parseFloat(host.style.width)||340,Math.min(layout.cardHeight||350,parseFloat(card.style.maxHeight)||Infinity));let count=0;while(frames.length && count++<20)frames.shift()();},notifyResize:()=>observers.filter(o=>o.nodes.size).forEach(o=>o.fn()),pulse:()=>[...intervals.values()].forEach(fn=>fn()),reconnect:()=>{const all=[...timeouts.values()];timeouts.clear();all.forEach(fn=>fn());}};
}
const finished=()=>({text:'公开作品介绍。[1]',profile:{name:'乙'},analyzedAt:Date.now(),totalMs:100,model:'fixture',imageCount:0,coverage:{mode:'recent',sampled:1,requested:1,full:1,scanned:1,total:1,complete:true,warnings:[]},sources:[]});
async function openAdvice(a){a.click('#child .reply');await tick();const intro=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'done',requestId:intro.requestId,result:finished()});const root=a.document.querySelector('#people-lens-card').shadowRoot;root.querySelector('.advice-toggle').click();return {root,request:a.sent.find(m=>m.type==='suggest'),port:a.ports.at(-1)};}

test('reply suggestions are opt-in and capture the post, exact nested speech and parent without reading the draft',async()=>{
  const a=setup();a.document.querySelector('#content-textarea').textContent='PRIVATE_DRAFT';a.click('#child .reply');await tick();const intro=a.sent.find(m=>m.type==='analyze'),root=a.document.querySelector('#people-lens-card').shadowRoot;assert.equal(root.querySelector('.advice-toggle').disabled,true);
  a.ports[0].receive({type:'done',requestId:intro.requestId,result:finished()});assert.equal(a.sent.filter(m=>m.type==='suggest').length,0);root.querySelector('.advice-toggle').click();const request=a.sent.find(m=>m.type==='suggest');
  assert.equal(request.context.comment.authorId,id(3));assert.equal(request.context.comment.text,'想知道连接处是怎么做的？');assert.equal(request.context.parent.text,'父评论讨论书架的设计。');assert.equal(request.context.post.title,'周末做的小书架');assert(!JSON.stringify(request).includes('PRIVATE_DRAFT'));assert.equal(a.document.querySelector('#content-textarea').textContent,'PRIVATE_DRAFT');
});
test('manual popup keeps an existing reply target while plain post replies carry no invented comment',async()=>{
  const a=setup();a.messages[0]({type:'SHOW_ACTIVE'},null,()=>{});await tick();const intro=a.sent.find(m=>m.type==='analyze');assert.equal(intro.target.id,id(3));a.ports[0].receive({type:'done',requestId:intro.requestId,result:finished()});a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.advice-toggle').click();assert.equal(a.sent.find(m=>m.type==='suggest').context.mode,'comment');
  const b=setup();b.document.querySelector('.reply-content').hidden=true;b.document.querySelector('#content-textarea').dispatchEvent(new b.window.Event('focusin',{bubbles:true}));await tick();const postIntro=b.sent.find(m=>m.type==='analyze');b.ports[0].receive({type:'done',requestId:postIntro.requestId,result:{...finished(),profile:{name:'作者'}}});b.document.querySelector('#people-lens-card').shadowRoot.querySelector('.advice-toggle').click();const context=b.sent.find(m=>m.type==='suggest').context;assert.equal(context.mode,'post');assert.equal(context.comment,null);assert.equal(context.post.authorId,id(1));
});
test('candidate copy preserves the draft, renders model text safely, and never sends a comment',async()=>{
  const a=setup();a.document.querySelector('#content-textarea').textContent='我的草稿';const {root,request,port}=await openAdvice(a);const text='<img src=x onerror=bad()> 连接处能展开讲讲吗？';
  port.receive({type:'done',requestId:request.requestId,result:{suggestions:[{label:'追问细节',text}]}});assert.equal(root.querySelector('.advice-item img'),null);assert.equal(root.querySelector('.advice-text').textContent,text);
  const before=a.sent.length;await root.querySelector('.advice-copy').onclick();assert.deepEqual(a.copyWrites,[text]);assert.equal(a.document.querySelector('#content-textarea').textContent,'我的草稿');assert.equal(a.sent.length,before);
});
test('another comment by the same user cancels old advice without repeating the profile analysis',async()=>{
  const a=setup(),{root,request,port}=await openAdvice(a),clone=a.document.querySelector('#child').cloneNode(true);clone.id='other';clone.querySelector('.note-text').textContent='再问一个不同的问题。';a.document.querySelector('#parent').append(clone);a.click('#other .reply');await tick();
  assert(a.sent.some(m=>m.type==='cancel'&&m.requestId===request.requestId));assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);assert.equal(root.querySelector('.advice-panel').hidden,true);
  port.receive({type:'done',requestId:request.requestId,result:{suggestions:[{label:'旧建议',text:'旧内容不能出现。'}]}});assert.equal(root.querySelector('.advice-item'),null);
  root.querySelector('.advice-toggle').click();assert.equal(a.sent.filter(m=>m.type==='suggest').at(-1).context.comment.text,'再问一个不同的问题。');
});
test('closing the card aborts suggestions and changing conversation content rejects late results',async()=>{
  const a=setup(),{root,request,port}=await openAdvice(a);a.document.querySelector('#child .note-text').textContent='发言发生了变化。';port.receive({type:'done',requestId:request.requestId,result:{suggestions:[{label:'过期',text:'不应显示。'}]}});assert.equal(root.querySelector('.advice-item'),null);
  root.querySelector('.advice-toggle').click();const current=a.sent.filter(m=>m.type==='suggest').at(-1);root.querySelector('.close').click();assert(a.sent.some(m=>m.type==='cancel'&&m.requestId===current.requestId));assert.equal(a.intervals.size,0);
});
test('advice reconnects with resume, retains partial candidates, and manual retry does not regenerate the profile',async()=>{
  const a=setup(),{root,request,port}=await openAdvice(a);port.receive({type:'options',requestId:request.requestId,suggestions:[{label:'自然接话',text:'已经收到的一条建议。'}]});port.disconnect();a.reconnect();assert.equal(a.sent.at(-1).type,'resume');assert.equal(a.sent.at(-1).requestId,request.requestId);assert.equal(a.sent.filter(m=>m.type==='suggest').length,1);assert.match(root.querySelector('.advice-text').textContent,/收到/);
  a.ports.at(-1).receive({type:'error',requestId:request.requestId,message:'网络中断'});assert.match(root.querySelector('.status').textContent,/分析完成/);root.querySelector('.advice-again').click();assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);assert.equal(a.sent.filter(m=>m.type==='suggest').at(-1).refresh,true);
});

test('first reply waits for an asynchronously mounted editor and selects that commenter',async()=>{
  const a=setup(),input=a.document.querySelector('#content-textarea');input.remove();a.click('#child .reply');await tick();assert.equal(a.sent.filter(m=>m.type==='analyze').length,0);
  a.document.querySelector('.engage-bar').append(input);input.dispatchEvent(new a.window.Event('focusin',{bubbles:true}));await tick();
  assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);assert.equal(a.sent.find(m=>m.type==='analyze').target.id,id(3));
});
test('editor reconstruction preserves the selected commenter, partial text, and running request',async()=>{
  const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'text',requestId:request.requestId,text:'已经显示的介绍'});
  const old=a.document.querySelector('#content-textarea'),next=old.cloneNode(true);old.remove();await tick();a.document.querySelector('.engage-bar').append(next);next.dispatchEvent(new a.window.Event('focusin',{bubbles:true}));await tick();
  assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);assert.equal(a.sent.filter(m=>m.type==='cancel').length,0);assert.equal(a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.summary').textContent,'已经显示的介绍');
});
test('a hidden stale composer cannot win over the newly mounted visible editor',async()=>{
  const a=setup(),old=a.document.querySelector('#content-textarea'),fresh=old.cloneNode(true);old.getBoundingClientRect=()=>a.rect(0,0,0,0);fresh.getBoundingClientRect=()=>a.rect(100,650,300,40);a.document.querySelector('.engage-bar').append(fresh);
  a.click('#child .reply');await tick();a.flushLayout();assert.equal(a.sent.find(m=>m.type==='analyze').target.id,id(3));assert.equal(a.document.querySelector('#people-lens-card').style.visibility,'visible');assert(a.observers.some(o=>o.nodes.has(fresh)));
});
test('pointerdown locks reply identity before focus; repeated reply clicks do not duplicate work',async()=>{
  const a=setup();a.document.querySelector('.reply-content').hidden=true;
  a.document.querySelector('#child .reply').dispatchEvent(new a.window.Event('pointerdown',{bubbles:true,composed:true}));
  a.document.querySelector('#content-textarea').dispatchEvent(new a.window.Event('focusin',{bubbles:true}));a.click('#child .reply');await tick();a.click('#child .reply');await tick();
  assert.deepEqual(a.sent.filter(m=>m.type==='analyze').map(m=>m.target.id),[id(3)]);
  a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.close').click();a.click('#child .reply');await tick();assert.equal(a.document.querySelector('#people-lens-card').style.display,'block');
});
test('pointerdown does not open an overlay before the original reply click reaches the website',async()=>{
  const a=setup();a.document.querySelector('.reply-content').hidden=true;
  a.document.querySelector('#child .reply').dispatchEvent(new a.window.Event('pointerdown',{bubbles:true,composed:true}));await tick();
  a.document.querySelector('#content-textarea').dispatchEvent(new a.window.Event('focusin',{bubbles:true}));await tick();assert.equal(a.sent.filter(m=>m.type==='analyze').length,0);assert.equal(a.document.querySelector('#people-lens-card'),null);
  let websiteReceived=false;a.document.addEventListener('click',()=>websiteReceived=true);a.click('#child .reply');await tick();assert.equal(websiteReceived,true);assert.equal(a.sent.find(m=>m.type==='analyze').target.id,id(3));
});
test('existing reply context selects its commenter, and unknown context never falls back to post author',async()=>{
  const a=setup();a.document.querySelector('#content-textarea').dispatchEvent(new a.window.Event('focusin',{bubbles:true}));await tick();assert.equal(a.sent.find(m=>m.type==='analyze').target.id,id(3));
  const b=setup();b.document.querySelector('.reply-content').textContent='回复未加载的名字';b.document.querySelector('#content-textarea').dispatchEvent(new b.window.Event('focusin',{bubbles:true}));await tick();assert.equal(b.sent.filter(m=>m.type==='analyze').length,0);
});
test('temporary reply-context replacement does not hide or reset the commenter',async()=>{
  const a=setup();a.click('#child .reply');await tick();const old=a.document.querySelector('.reply-content'),fresh=old.cloneNode(true);old.remove();await tick();a.document.querySelector('.engage-bar').prepend(fresh);await tick();a.reconnect();
  assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);assert.equal(a.document.querySelector('#people-lens-card').style.display,'block');
});
test('term highlights support hover and focus with plain-text definitions and no extra requests',async()=>{
  const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');
  a.ports[0].receive({type:'done',requestId:request.requestId,result:{...finished(),text:'嗑CP，也看 CPU；CP 和 SDK 都提到过。',terms:[{term:'CP',meaning:'按这里的语境，指被搭配在一起的两个人。'},{term:'SDK',meaning:'<img src=x onerror=bad()> 一套开发工具。'}]}});
  const root=a.document.querySelector('#people-lens-card').shadowRoot,buttons=[...root.querySelectorAll('.term')];assert.deepEqual(buttons.map(b=>b.textContent),['CP','SDK']);
  const before=a.sent.length;buttons[0].onpointerenter();assert.equal(root.querySelector('.term-tooltip').hidden,false);assert.match(root.querySelector('.term-meaning').textContent,/语境/);
  buttons[1].onfocus();assert.equal(root.querySelector('.term-tooltip img'),null);assert.match(root.querySelector('.term-meaning').textContent,/<img/);assert.equal(a.sent.length,before);
  const escape=new a.window.Event('keydown',{bubbles:true});escape.key='Escape';a.document.querySelector('#people-lens-card').dispatchEvent(escape);assert.equal(root.querySelector('.term-tooltip').hidden,true);
});
test('longest terms win overlaps and switching targets closes their tooltip',async()=>{
  const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'done',requestId:request.requestId,result:{...finished(),text:'旅行搭子，也找搭子。',terms:[{term:'搭子',meaning:'一起参与某一类活动的伙伴。'},{term:'旅行搭子',meaning:'一起出游的活动伙伴。'}]}});
  const root=a.document.querySelector('#people-lens-card').shadowRoot,buttons=[...root.querySelectorAll('.term')];assert.deepEqual(buttons.map(b=>b.textContent),['旅行搭子','搭子']);buttons[0].onpointerenter();a.click('#parent > .reply');await tick();assert.equal(root.querySelector('.term-tooltip').hidden,true);assert.equal(root.querySelectorAll('.term').length,0);
});
test('card follows the nearest page surface and updates text contrast after a theme change',async()=>{
  const a=setup({}, {background:'rgb(255, 255, 255)',foreground:'rgb(34, 34, 34)'});a.click('#child .reply');await tick();const host=a.document.querySelector('#people-lens-card');assert.equal(host.style.getPropertyValue('--surface'),'rgb(255, 255, 255)');
  a.layout.background='rgb(18, 18, 18)';a.layout.foreground='rgb(235, 235, 235)';a.document.documentElement.className='dark';await tick();assert.equal(host.style.getPropertyValue('--surface'),'rgb(18, 18, 18)');assert.equal(host.style.colorScheme,'dark');assert.equal(host.style.getPropertyValue('--ink'),'rgb(235, 235, 235)');
  a.document.querySelector('.engage-bar').style.backgroundColor='rgb(245, 246, 250)';await tick();assert.equal(host.style.getPropertyValue('--surface'),'rgb(245, 246, 250)');assert.equal(host.style.colorScheme,'light');assert.equal(host.style.getPropertyValue('--ink'),'rgb(24, 24, 24)');
});

test('card removes branding, collection statistics, source drawer, and citations in streaming and cached results',async()=>{
  const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze'),root=a.document.querySelector('#people-lens-card').shadowRoot;
  assert.equal(root.querySelector('.brand,.mark,.meta,.evidence,.sources'),null);assert(root.querySelector('.more'));
  a.ports[0].receive({type:'text',requestId:request.requestId,text:'主页提到阅读[P]，也分享写作[1][3, 5]和散步【2】。保留[2026]和[手写]。半个引用[1'});
  assert.equal(root.querySelector('.summary').textContent,'主页提到阅读，也分享写作和散步。保留[2026]和[手写]。半个引用');
  a.ports[0].receive({type:'done',requestId:request.requestId,result:{...finished(),cached:true}});
  assert.equal(root.querySelector('.summary').textContent,'公开作品介绍。');assert.match(root.querySelector('.status').textContent,/缓存/);
});
test('nested replies use the matching author avatar and clear it when switching targets',async()=>{
  const a=setup(),avatar='https://sns-avatar-qc.xhscdn.com/avatar/child';
  for(const [row,n,url] of [['parent',2,'https://sns-avatar-qc.xhscdn.com/avatar/parent'],['child',3,avatar]]){
    const link=a.document.createElement('a'),img=a.document.createElement('img');link.href=href(n);img.src=url;link.append(img);a.document.querySelector('#'+row+' .author').prepend(link);
  }
  a.click('#child .reply');await tick();const root=a.document.querySelector('#people-lens-card').shadowRoot;
  assert.equal(a.sent.find(m=>m.type==='analyze').target.avatar,avatar);assert.equal(root.querySelector('.avatar').src,avatar);
  a.ports[0].receive({type:'profile',requestId:a.sent.find(m=>m.type==='analyze').requestId,profile:{name:'乙',avatar:'https://evil.test/avatar'}});
  assert.equal(root.querySelector('.avatar').src,avatar);
  a.document.querySelector('#parent > .author img').remove();a.click('#parent > .reply');await tick();
  assert.equal(root.querySelector('.avatar').getAttribute('src'),null);assert.equal(root.querySelector('.avatar-fallback').textContent,'甲');
});
test('public profile updates fill a missing avatar and image failure falls back without a broken icon',async()=>{
  const a=setup();a.click('#child .reply');await tick();const root=a.document.querySelector('#people-lens-card').shadowRoot;
  a.ports[0].receive({type:'profile',requestId:a.sent.find(m=>m.type==='analyze').requestId,profile:{name:'乙',avatar:'https://sns-avatar-qc.xhscdn.com/avatar/profile'}});
  const image=root.querySelector('.avatar');assert.equal(image.hidden,false);image.onerror();assert.equal(image.hidden,true);assert.equal(root.querySelector('.avatar-fallback').hidden,false);
});
test('card width matches the entire reply area and its bottom clears the reply context',async()=>{
  const a=setup();a.click('#child .reply');await tick();a.flushLayout();const host=a.document.querySelector('#people-lens-card');
  assert.equal(host.style.width,'340px');assert.equal(host.style.left,'90px');assert.equal(host.style.top,'260px');
  assert.equal(parseFloat(host.style.top)+350,620-10);
});
test('card reflows after reply-area resize, shrinks long content, and stays within a narrow viewport',async()=>{
  const a=setup({}, {width:360,height:640,cardHeight:900});a.layout.input=a.rect(20,560,320,40);a.layout.anchor=a.rect(15,520,330,100);
  a.click('#child .reply');await tick();a.flushLayout();const host=a.document.querySelector('#people-lens-card'),card=host.shadowRoot.querySelector('section');
  assert.equal(host.style.width,'330px');assert.equal(host.style.left,'15px');assert.equal(card.style.maxHeight,'498px');assert.equal(host.style.top,'12px');
  a.layout.anchor=a.rect(30,450,285,100);a.notifyResize();a.flushLayout();assert.equal(host.style.width,'285px');assert.equal(host.style.left,'30px');assert.equal(card.style.maxHeight,'428px');
});
test('card can move below a top-of-screen composer and hide when the composer leaves the viewport',async()=>{
  const a=setup({}, {width:500,height:800});a.layout.input=a.rect(40,90,400,40);a.layout.anchor=a.rect(30,70,420,100);
  a.click('#child .reply');await tick();a.flushLayout();const host=a.document.querySelector('#people-lens-card');assert.equal(host.style.top,'180px');
  a.layout.input=a.rect(40,900,400,40);a.layout.anchor=a.rect(30,880,420,100);a.notifyResize();a.flushLayout();assert.equal(host.style.visibility,'hidden');
});
test('nested reply chooses the child author, not parent or original poster',async()=>{const a=setup();a.click('#child .reply');await tick();const msg=a.sent.find(m=>m.type==='analyze');assert.equal(msg.target.id,id(3));assert.equal(msg.target.name,'乙');});
test('switching targets sends cancellation and ignores late earlier results',async()=>{const a=setup();a.click('#child .reply');await tick();const old=a.sent.find(m=>m.type==='analyze');a.click('#parent > .reply');await tick();const last=a.sent.filter(m=>m.type==='analyze').at(-1);assert.equal(last.target.id,id(2));assert.notEqual(last.requestId,old.requestId);a.listeners[0]({type:'text',requestId:old.requestId,text:'wrong person'});const root=a.document.querySelector('#people-lens-card').shadowRoot;assert.equal(root.querySelector('.summary').textContent,'');assert(a.sent.some(m=>m.type==='cancel'));});
test('API output renders as text, never as HTML',async()=>{const a=setup();a.click('#child .reply');await tick();const msg=a.sent.find(m=>m.type==='analyze');a.listeners[0]({type:'text',requestId:msg.requestId,text:'<img src=x onerror=alert(1)>'});const root=a.document.querySelector('#people-lens-card').shadowRoot;assert.equal(root.querySelector('.summary img'),null);assert.match(root.querySelector('.summary').textContent,/<img/);});
test('manual trigger mode waits for a user click',async()=>{const a=setup({autoAnalyze:false});a.click('#child .reply');await tick();assert.equal(a.sent.some(m=>m.type==='analyze'),false);a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.analyze').click();assert.equal(a.sent.at(-1).type,'analyze');});
test('cancel reply hides and cancels analysis',async()=>{const a=setup();a.click('#child .reply');await tick();a.click('.btn.cancel');assert.equal(a.document.querySelector('#people-lens-card').style.display,'none');assert.equal(a.sent.at(-1).type,'cancel');});
test('disabled mode does not call the model',async()=>{const a=setup({enabled:false});a.click('#child .reply');await tick();assert.equal(a.sent.some(m=>m.type==='analyze'),false);assert.equal(a.document.querySelector('#people-lens-card').style.display,'none');});
test('reply context disappearing after submission invalidates the previous target',async()=>{const a=setup();a.click('#child .reply');await tick();a.document.querySelector('.reply-content').remove();await tick();a.reconnect();await tick();assert.equal(a.document.querySelector('#people-lens-card').style.display,'none');});
test('an unrecognized comment author never falls back to the post author',async()=>{const a=setup();a.document.querySelector('#child .name').remove();a.click('#child .reply');a.document.querySelector('#content-textarea').dispatchEvent(new a.window.Event('focusin',{bubbles:true}));await tick();assert.equal(a.sent.some(m=>m.type==='analyze'),false);});
test('plain composer focus uses only the primary author region',async()=>{const a=setup();a.document.querySelector('.reply-content').hidden=true;a.document.querySelector('#content-textarea').dispatchEvent(new a.window.Event('focusin',{bubbles:true}));await tick();assert.equal(a.sent.find(m=>m.type==='analyze').target.id,id(1));});
test('normal idle disconnect never replaces a completed result with an error',async()=>{const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'done',requestId:request.requestId,result:finished()});a.ports[0].disconnect();const root=a.document.querySelector('#people-lens-card').shadowRoot;assert.match(root.querySelector('.status').textContent,/分析完成/);assert.equal(root.querySelector('.summary').textContent,'公开作品介绍。');assert.equal(a.intervals.size,0);assert.equal(a.timeouts.size,0);});
test('active keepalive sends ping without starting another model request',async()=>{const a=setup();a.click('#child .reply');await tick();a.pulse();assert.equal(a.sent.at(-1).type,'ping');assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);a.click('.btn.cancel');assert.equal(a.intervals.size,0);});
test('transient disconnect resumes the same request and preserves partial output',async()=>{const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'text',requestId:request.requestId,text:'已生成半句'});a.ports[0].disconnect();assert.equal(a.timeouts.size,1);a.reconnect();assert.equal(a.sent.at(-1).type,'resume');assert.equal(a.sent.at(-1).requestId,request.requestId);assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);const root=a.document.querySelector('#people-lens-card').shadowRoot;assert.equal(root.querySelector('.summary').textContent,'已生成半句');a.ports[1].receive({type:'done',requestId:request.requestId,result:finished()});assert.match(root.querySelector('.status').textContent,/分析完成/);});
test('closing the card while reconnecting cancels scheduled recovery',async()=>{const a=setup();a.click('#child .reply');await tick();a.ports[0].disconnect();a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.close').click();a.reconnect();assert.equal(a.ports.length,1);assert.equal(a.sent.filter(m=>m.type==='resume').length,0);});
test('old port disconnect cannot disturb a replacement connection',async()=>{const a=setup();a.click('#child .reply');await tick();a.ports[0].disconnect();a.reconnect();const count=a.ports.length;a.ports[0].disconnect();assert.equal(a.ports.length,count);assert.equal(a.timeouts.size,0);a.click('.btn.cancel');});
test('recovery stops after two attempts instead of looping or repeating paid work',async()=>{const a=setup();a.click('#child .reply');await tick();a.ports[0].disconnect();a.reconnect();a.ports[1].disconnect();a.reconnect();a.ports[2].disconnect();const root=a.document.querySelector('#people-lens-card').shadowRoot;assert.match(root.querySelector('.status').textContent,/无法恢复/);assert.equal(a.timeouts.size,0);assert.equal(a.sent.filter(m=>m.type==='analyze').length,1);});
test('non-core settings and utility buttons are inside the closed advanced section',async()=>{const {document}=parseHTML(await readFile(new URL('../extension/options.html',import.meta.url),'utf8'));const advanced=document.querySelector('#advanced-settings');assert.equal(advanced.hasAttribute('open'),false);for(const id of ['test-api','clear-cache','summaryLength','prompt','budgetSeconds','cacheHours','enabled','autoAnalyze','mix-fields','maxOutputTokens','generationMode','localConcurrency'])assert(document.getElementById(id).closest('#advanced-settings'));for(const id of ['endpoint','apiKey','model','count','save'])assert.equal(document.getElementById(id).closest('#advanced-settings'),null);assert.equal(document.querySelector('.preview'),null);assert.equal(document.querySelector('#test-cloud'),null);});
test('retry after a model error skips old results but reuses collected data',async()=>{const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'error',requestId:request.requestId,message:'输出被截断'});a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.analyze').click();const retry=a.sent.filter(m=>m.type==='analyze').at(-1);assert.equal(retry.refresh,true);assert.equal(retry.refreshData,false);});
test('explicit refresh requests fresh profile data and a new analysis',async()=>{const a=setup();a.click('#child .reply');await tick();const request=a.sent.find(m=>m.type==='analyze');a.ports[0].receive({type:'done',requestId:request.requestId,result:finished()});a.document.querySelector('#people-lens-card').shadowRoot.querySelector('.refresh').click();const next=a.sent.filter(m=>m.type==='analyze').at(-1);assert.equal(next.refresh,true);assert.equal(next.refreshData,true);});
test('settings and card primary text use readable 17 to 18px fonts',async()=>{const css=await readFile(new URL('../extension/options.css',import.meta.url),'utf8');assert.match(css,/:root\{font:17px/);assert.match(css,/font-size:18px/);assert.match(code,/\.summary\{[^}]*font-size:18px/);});
test('settings expose exactly one group of three analysis modes',async()=>{const {document}=parseHTML(await readFile(new URL('../extension/options.html',import.meta.url),'utf8'));assert.deepEqual([...document.querySelectorAll('input[name=mode]')].map(e=>e.value),['recent','earliest','mixed']);assert.equal(document.querySelectorAll('input[name=contentMode]').length,2);});
