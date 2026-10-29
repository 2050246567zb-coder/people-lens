import {readdir,readFile,stat} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../extension/',import.meta.url));
async function walk(p){const out=[];for(const name of await readdir(p)){const f=path.join(p,name);if((await stat(f)).isDirectory())out.push(...await walk(f));else out.push(f);}return out;}
const files=await walk(root);let count=0;
for(const f of files.filter(f=>f.endsWith('.js'))){const p=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(p.status){process.stderr.write(p.stderr);process.exit(1);}count++;}
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
for(const f of [manifest.background.service_worker,manifest.action.default_popup,manifest.options_ui.page,...manifest.content_scripts.flatMap(x=>x.js),...Object.values(manifest.icons)])await stat(path.join(root,f));
for(const f of files.filter(f=>f.endsWith('.html'))){const html=await readFile(f,'utf8');if(/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html))throw new Error('Inline script violates MV3 CSP: '+f);}
if(manifest.host_permissions.some(h=>h==='https://*/*' || h==='<all_urls>'))throw new Error('Required host permissions are too broad');
console.log(`Checked ${count} JavaScript files, manifest resources, MV3 inline-script policy and required permissions.`);
