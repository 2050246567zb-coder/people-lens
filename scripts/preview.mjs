import http from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {settingsOf,sampleNotes,coverageOf} from '../extension/lib/core.js';import {analysisView,GLOSSARY_MARKER} from '../extension/lib/analysis.js';import {completion,modelMessages} from '../extension/lib/api.js';import {replyContextOf,replyMessages,parseReplySuggestions} from '../extension/lib/replies.js';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),port=Number(process.env.PEOPLE_LENS_PREVIEW_PORT)||8769;
const id=n=>n.toString(16).padStart(24,'0');
const json=async req=>{let s='';for await(const b of req){s+=b;if(s.length>50000)throw new Error('too large');}return s?JSON.parse(s):{};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  try{
    if(u.pathname==='/v1/chat/completions'){
      const body=await json(req);const isTest=JSON.stringify(body.messages).includes('连接成功');const isWriter=JSON.stringify(body.messages).includes('阿青');
      const intro=isWriter?'这位看起来是个喜欢读书、也愿意把想法慢慢写下来的人。主页提到自己是自由撰稿人，分享过卡片笔记的整理过程；也会约写作搭子一起赶稿，闲下来就在城市里散步。': '这位看起来喜欢自己动手做东西，主页提到自己做产品设计，分享过接入 SDK、调试 API 的小项目。除了开发，也会聊机械键盘和桌面布置，介绍东西时偏爱讲清楚制作过程和实际体验。';
      const terms=isWriter?[{term:'卡片笔记',meaning:'把想法拆成简短条目，再用链接串起关联的一种记录方法。'},{term:'写作搭子',meaning:'一起写作、互相提醒进度的活动伙伴。'}]:[{term:'SDK',meaning:'软件开发工具包。通常包含代码库、说明和示例，让开发者接入某个平台的功能。'},{term:'API',meaning:'应用程序接口。可以理解为软件之间约定好的调用方式，用来获取数据或使用功能。'}];
      const isReply=String(body.messages?.[0]?.content).includes('拟一条小红书回复');
      const candidates=isWriter?[{label:'自然接话',text:'写作桌的光线确实很影响氛围，你更想先调整照明还是收纳？'},{label:'追问细节',text:'你写作时更习惯自然光还是台灯？按自己的习惯布置应该更顺手。'},{label:'轻松一点',text:'这个桌面看着就很适合安静写点东西，感觉容易进入状态。'}]:[{label:'自然接话',text:'支架这个点也挺想了解的，等作者分享一下搭建过程。'},{label:'追问细节',text:'如果想照着布置，你更想先换支架还是调整桌面布局？'},{label:'轻松一点',text:'这张桌面确实让人想立刻收拾一下自己的工位。'}];
      const avoided=isReply&&JSON.parse(body.messages[1].content).avoid?.length;
      const alternatives=isWriter?[{label:'自然接话',text:'你提到的光线也很吸引人，这个布置里最想参考哪一处？'},{label:'追问细节',text:'如果先调整一项，你会先换灯的位置还是腾出桌面空间？'},{label:'轻松一点',text:'看着这种桌面就有了想写点东西的心情。'}]:[{label:'自然接话',text:'这个支架看起来很省桌面空间，确实想听作者讲讲。'},{label:'追问细节',text:'你最想参考支架还是桌面的整体搭法？'},{label:'轻松一点',text:'一张整洁桌面的吸引力确实很难抵挡。'}];
      const text=isTest?'连接成功':isReply?JSON.stringify(avoided?alternatives:candidates):intro+'\n'+GLOSSARY_MARKER+'\n'+JSON.stringify(terms);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      for(let i=0;i<text.length && !res.destroyed;i+=4){res.write(`data: ${JSON.stringify({choices:[{delta:{content:text.slice(i,i+4)}}]})}\n\n`);await sleep(14);}
      if(!res.destroyed)res.end('data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');return;
    }
    if(u.pathname==='/demo/test'){
      const start=Date.now();const r=await completion(settingsOf({endpoint:`http://127.0.0.1:${port}/v1`,model:'demo-fast'}),[{role:'user',content:'连接成功'}]);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({text:r.text,ms:Date.now()-start}));return;
    }
    if(u.pathname==='/demo/replies'){
      const body=await json(req),s=settingsOf({...body.settings,apiKey:'',endpoint:`http://127.0.0.1:${port}/v1`,model:'demo-fast'});
      if(![id(1),id(2),id(3)].includes(body.target?.id)||!body.analysis?.text)throw new Error('请先完成虚构账号的介绍。');
      const context=replyContextOf(body.context,body.target),controller=new AbortController();res.on('close',()=>controller.abort());res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      const emit=e=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(e)}\n\n`);};emit({type:'progress',message:'正在结合演示笔记和这条发言…'});
      try{const result=await completion(s,replyMessages(context,body.analysis,body.avoid||[]),{signal:controller.signal,onText:raw=>{const suggestions=parseReplySuggestions(raw,{partial:true});if(suggestions.length)emit({type:'options',suggestions});}});emit({type:'done',result:{suggestions:parseReplySuggestions(result.text),createdAt:Date.now()}});}catch(err){if(!controller.signal.aborted)emit({type:'error',message:err.message});}res.end();return;
    }
    if(u.pathname==='/demo/analyze'){
      const body=await json(req),s=settingsOf({...body.settings,apiKey:'',endpoint:`http://127.0.0.1:${port}/v1`,model:'demo-fast'}),target=body.target;
      if(![id(1),id(2),id(3)].includes(target.id))throw new Error('仅支持虚构演示账号。');
      const controller=new AbortController();res.on('close',()=>controller.abort());
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      const emit=e=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(e)}\n\n`);};
      const start=Date.now();emit({type:'progress',message:'正在读取演示资料…'});await sleep(100);
      const writer=target.id===id(3),name=writer?'阿青':'林一';const titles=writer?['阅读是写作的另一半','给写作桌换了个位置','城市散步的五个片段']:['一个周末做完的小工具','机械键盘的新配列','把工作台留给常用的东西'];
      const notes=Array.from({length:24},(_,i)=>({id:id(100+i),title:titles[i%3],text:titles[i%3]+'。记录我的尝试和观察。',time:Date.UTC(2026,9,i+1),full:true,images:[],url:'https://www.xiaohongshu.com/explore/'+id(100+i)}));
      const data={profile:{id:target.id,name,bio:writer?'自由撰稿人。读书，写字，散步。':'产品设计师。做一点自己的小工具。',tags:[],url:target.url},notes,total:24,complete:true,warnings:['本地演示：人物、笔记和模型输出均为虚构。']},selected=sampleNotes(notes,s.mode,s.count,s.mix),coverage=coverageOf(data,selected,s),sources=selected.map((n,i)=>({...n,index:i+1}));
      emit({type:'profile',profile:data.profile});emit({type:'coverage',profile:data.profile,coverage,sources});
      try{const result=await completion(s,modelMessages(data,selected,s),{signal:controller.signal,onText:raw=>{const view=analysisView(raw);emit({type:'text',text:view.text,terms:view.terms});}});emit({type:'done',result:{text:analysisView(result.text).text,terms:analysisView(result.text).terms,profile:data.profile,coverage,sources,analyzedAt:Date.now(),imageCount:0,model:'模拟模型',totalMs:Date.now()-start,collectionMs:100}});}catch(err){if(!controller.signal.aborted)emit({type:'error',message:err.message});}res.end();return;
    }
    if(u.pathname==='/'){res.writeHead(302,{Location:'/explore/'+id(9)});res.end();return;}
    let relative=u.pathname==='/explore/'+id(9)?'/preview/fixture.html':u.pathname;
    if(relative==='/settings'){
      let html=await readFile(path.join(root,'extension/options.html'),'utf8');html=html.replace('href="options.css"','href="/extension/options.css"').replace('src="options.js"','src="/preview/options-entry.js"').replace('<body>','<body><div style="background:#e9e5d9;padding:10px;text-align:center;font-size:11px;color:#8d7655">本地演示 · 请勿填写真实密钥 · <a href="/">返回回复交互演示</a></div>');
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(relative));if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
    const ext=path.extname(file),types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png'};
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch(err){res.writeHead(400,{'Content-Type':'text/plain;charset=utf-8'});res.end(err.message);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local fixture only: http://127.0.0.1:${port}\nSettings: http://127.0.0.1:${port}/settings`));
