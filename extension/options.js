import { DEFAULTS, settingsOf, endpointOf } from './lib/core.js';
const $=s=>document.querySelector(s),form=$('#settings-form'),status=$('#status');
const message=async(msg)=>{const r=await chrome.runtime.sendMessage(msg);if(!r?.ok)throw new Error(r?.error||'操作失败。');return r.value;};
function tell(text,type=''){status.textContent=text;status.className=type;}
function read(){
  const raw={};for(const k of Object.keys(DEFAULTS)){
    const input=document.getElementById(k);if(input)raw[k]=input.type==='checkbox'?input.checked:input.value;
  }
  raw.mode=form.elements.mode.value;raw.contentMode=form.elements.contentMode.value;raw.mix=[$('#mix-old').value,$('#mix-mid').value,$('#mix-new').value];
  if(!raw.mix.some(v=>Number(v)>0))throw new Error('混合权重至少有一项大于 0。');
  return settingsOf(raw);
}
function fill(s){
  for(const [k,v] of Object.entries(s)){const input=document.getElementById(k);if(input){if(input.type==='checkbox')input.checked=v;else input.value=v;}}
  form.elements.mode.value=s.mode;form.elements.contentMode.value=s.contentMode;
  ['#mix-old','#mix-mid','#mix-new'].forEach((id,i)=>$(id).value=s.mix[i]);hint();
}
function hint(){
  const mode=form.elements.mode.value,count=Number($('#count').value)||10;$('#mix-fields').hidden=mode!=='mixed';
  $('#mode-hint').textContent=mode==='recent'?`最近 ${count} 条，按发布时间抽样。`:mode==='earliest'?'需要加载更早内容，等待可能稍长。':`最早、中间、最近合计 ${count} 条，默认平均分配。`;
}
form.addEventListener('change',hint);$('#count').addEventListener('input',hint);
$('#reveal-key').onclick=()=>{const input=$('#apiKey'),hidden=input.type==='password';input.type=hidden?'text':'password';$('#reveal-key').textContent=hidden?'隐藏':'显示';};
async function authorize(s){const origin=new URL(endpointOf(s.endpoint)).origin+'/*';const granted=await chrome.permissions.request({origins:[origin]});if(!granted)throw new Error('没有取得模型域名权限，设置未保存。');}
form.onsubmit=async(event)=>{
  event.preventDefault();const button=$('#save');button.disabled=true;
  try{const s=read();tell('正在保存…');await authorize(s);await message({type:'SAVE_SETTINGS',settings:s});tell('已保存，回到小红书即可使用。','success');}
  catch(err){tell(err.message,'error');}finally{button.disabled=false;}
};
$('#test-api').onclick=async()=>{
  const button=$('#test-api');button.disabled=true;
  try{const s=read();if(!s.model)throw new Error('请填写模型名称。');await authorize(s);tell('正在测试模型连接…');const r=await message({type:'TEST_API',settings:s});tell(`连接成功，耗时 ${(r.ms/1000).toFixed(1)} 秒。`,'success');}
  catch(err){tell(err.message,'error');}finally{button.disabled=false;}
};
$('#clear-cache').onclick=async()=>{try{await message({type:'CLEAR_CACHE'});tell('分析缓存已清除，API 设置已保留。','success');}catch(err){tell(err.message,'error');}};
message({type:'GET_SETTINGS'}).then(s=>fill(settingsOf(s))).catch(err=>tell(err.message,'error'));
