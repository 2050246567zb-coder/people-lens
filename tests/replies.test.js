import test from 'node:test';import assert from 'node:assert/strict';
import {replyContextOf,replyHash,replyMessages,parseReplySuggestions} from '../extension/lib/replies.js';
const id=n=>n.toString(16).padStart(24,'0'),target={id:id(2)};
const context={mode:'comment',post:{id:id(9),authorId:id(1),title:'制作书架',text:'正文内容'},comment:{id:id(10),authorId:id(2),name:'甲',text:'连接处怎么做的？'},parent:{name:'乙',text:'想看教程'}};
test('reply context binds the current post and actual commenter and bounds public text',()=>{
  const c=replyContextOf({...context,post:{...context.post,text:'长'.repeat(8000)}},target);assert.equal(c.post.text.length,6000);assert.equal(c.comment.text,'连接处怎么做的？');assert.equal(c.parent.text,'想看教程');
  assert.throws(()=>replyContextOf({...context,comment:{...context.comment,authorId:id(1)}},target),/不一致/);
  assert.throws(()=>replyContextOf({...context,post:{...context.post,id:''}},target),/笔记/);
  assert.throws(()=>replyContextOf({...context,comment:{...context.comment,text:''}},target),/文字/);
});
test('replying to a post is explicit and cannot claim a different target as its author',()=>{
  assert.throws(()=>replyContextOf({...context,mode:'post'},target),/不一致/);
  const c=replyContextOf({...context,mode:'post',post:{...context.post,authorId:target.id}},target);assert.equal(c.comment,null);assert.equal(c.parent,null);
});
test('reply prompt includes all three inputs, separates parent from target, and excludes unrelated data',()=>{
  const messages=replyMessages(context,{profile:{name:'甲',avatar:'SECRET_AVATAR'},text:'喜欢木工，乐于分享项目。',apiKey:'SECRET_KEY'},['之前的建议']);
  const value=JSON.parse(messages[1].content);assert.equal(value.context.comment.text,'连接处怎么做的？');assert.equal(value.context.parent.text,'想看教程');assert.equal(value.person.introduction,'喜欢木工，乐于分享项目。');assert.deepEqual(value.avoid,['之前的建议']);assert(!JSON.stringify(messages).includes('SECRET_'));assert(messages[0].content.includes('不要编造用户自己的经历'));
});
test('reply cache hashes isolate post, comment, model scope, and introduction',async()=>{
  const first=await replyHash({scope:'modelA',context});assert.notEqual(first,await replyHash({scope:'modelB',context}));assert.notEqual(first,await replyHash({scope:'modelA',context:{...context,comment:{...context.comment,text:'换一条评论'}}}));
});
test('reply parser streams only completed candidates, handles braces in strings and de-duplicates',()=>{
  const part='[{"label":"自然接话","text":"这处 {接口} 想得很细。"},{"label":"追问细节","text":"还没结束';
  assert.equal(parseReplySuggestions(part,{partial:true}).length,1);assert.throws(()=>parseReplySuggestions(part),/建议/);
  const all=parseReplySuggestions('```json\n'+JSON.stringify([{label:'自然接话',text:'第一条。'},{label:'重复',text:'第一条。'},{text:'第二条。'},{text:'第三条。'},{text:'第四条。'},{text:'太长'.repeat(200)}])+'\n```');assert.equal(all.length,3);assert.equal(all[1].label,'建议 2');
});
