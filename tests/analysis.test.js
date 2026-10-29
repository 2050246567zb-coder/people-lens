import test from 'node:test';import assert from 'node:assert/strict';
import {analysisView,GLOSSARY_MARKER} from '../extension/lib/analysis.js';
test('description streams immediately and all partial glossary marker prefixes stay hidden',()=>{
  const text='喜欢讨论 SDK。';for(let n=0;n<GLOSSARY_MARKER.length;n++)assert.equal(analysisView(text+'\n'+GLOSSARY_MARKER.slice(0,n)).text,text);
  assert.equal(analysisView(text+GLOSSARY_MARKER+'[{"term":').text,text);assert.deepEqual(analysisView(text).terms,[]);
});
test('complete terms require literal occurrence, bounded definitions, and no duplicates',()=>{
  const r=analysisView('分享 SDK，也谈 API。'+GLOSSARY_MARKER+JSON.stringify([{term:'SDK',meaning:'某个平台提供给开发者使用的一套工具和代码库。'},
    {term:'sdk',meaning:'重复的术语不会重复添加。'},{term:'不存在',meaning:'不在正文中的词不会凭空出现。'},{term:'API',meaning:'A'.repeat(241)}]));
  assert.equal(r.text,'分享 SDK，也谈 API。');assert.equal(r.terms.length,1);assert.equal(r.terms[0].term,'SDK');
});
test('malformed or absent term data never destroys the description or exposes JSON',()=>{
  for(const raw of ['[','{"term":"SDK"}',JSON.stringify([{term:'SDK',meaning:{html:'bad'}}])]){
    const r=analysisView('SDK 正文。'+GLOSSARY_MARKER+raw);assert.equal(r.text,'SDK 正文。');assert.deepEqual(r.terms,[]);
  }
  assert.equal(analysisView('兼容旧模型的普通回答。').text,'兼容旧模型的普通回答。');
});
test('term lists are capped at six and optional JSON fences are tolerated',()=>{
  const entries=Array.from({length:10},(_,i)=>({term:'术语'+i,meaning:'这是一段给圈外人看的简短说明。'})),body=entries.map(t=>t.term).join('、');
  assert.equal(analysisView(body+GLOSSARY_MARKER+'```json\n'+JSON.stringify(entries)+'\n```').terms.length,6);
});
