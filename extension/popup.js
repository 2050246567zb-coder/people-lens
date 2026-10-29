const $=s=>document.querySelector(s);let config;
async function message(msg){const r=await chrome.runtime.sendMessage(msg);if(!r?.ok)throw new Error(r?.error||'操作失败');return r.value;}
function render(){ $('#toggle').textContent=config.enabled?'暂停人物速览':'开启人物速览';$('#status').textContent=config.configured?`${config.enabled?'已启用':'已暂停'} · ${ {recent:'最近',earliest:'最早',mixed:'混合'}[config.mode]} ${config.count} 条`:'请先在设置中连接你的 AI。'; }
message({type:'PUBLIC_SETTINGS'}).then(c=>{config=c;render();}).catch(err=>$('#status').textContent=err.message);
$('#settings').onclick=()=>chrome.runtime.openOptionsPage();
$('#toggle').onclick=async()=>{try{await message({type:'SET_ENABLED',enabled:!config.enabled});config.enabled=!config.enabled;render();}catch(err){$('#status').textContent=err.message;}};
$('#analyze').onclick=async()=>{try{const r=await message({type:'ANALYZE_ACTIVE'});if(r?.ok===false)throw new Error(r.error);window.close();}catch(err){$('#status').textContent=err.message;}};
