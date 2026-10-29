import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
const project=fileURLToPath(new URL('../',import.meta.url));
const version=JSON.parse(await readFile(path.join(project,'extension/manifest.json'),'utf8')).version;
const output=path.resolve(project,process.env.PEOPLE_LENS_OUTPUT_DIR || 'dist/people-lens-'+version);
await mkdir(output,{recursive:true});await cp(path.join(project,'extension'),output,{recursive:true});await cp(path.join(project,'README.md'),path.join(output,'安装与使用.md'));await cp(path.join(project,'VERIFICATION.md'),path.join(output,'验证说明.md'));
const manifest=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8'));
await writeFile(path.join(output,'VERSION.txt'),`${manifest.name}\n${manifest.version}\nBuild: ${new Date().toISOString()}\n`,'utf8');console.log(output);
