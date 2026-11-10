// Source-only local handoff: no runtime database, browser state, private files or Git history.
import {execFileSync} from 'node:child_process';
import {mkdirSync,cpSync,lstatSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {standardZip} from './standard-zip.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export function includeInLocalPackage(path){
 const p=path.replaceAll('\\','/');if(p.startsWith('/')||p.split('/').some(x=>x==='..'||x==='.git'))return false;
 if(/(?:^|\/)(?:private|local|student-profiles|assessments|node_modules|tmp|qa-output)(?:\/|$)/i.test(p))return false;
 if(/(?:^|\/)(?:\.env(?:\..+)?|credentials[^/]*|secrets[^/]*)(?:$|\/)/i.test(p)&&p!=='.env.example')return false;
 if(/\.(?:sqlite(?:-shm|-wal)?|pem|key|log)$/i.test(p)||/(?:^|\/)(?:[^/]*transcript[^/]*|[^/]*CV[^/]*\.(?:docx?|pdf))$/i.test(p))return false;
 return /^(?:server|public|data|scripts|tests|docs)\//.test(p)||['README.md','package.json','.env.example','start-local.cmd','start-local.ps1','CONTRIBUTING.md'].includes(p);
}
export function packageLocal({output}){
 const target=resolve(root,output);if(!target.startsWith(resolve(root,'tmp')+sep)||!target.endsWith('.zip')||existsSync(target))throw new Error('Choose a new ZIP under ignored tmp/');
 const stage=target.slice(0,-4);if(existsSync(stage))throw new Error('Staging directory already exists');mkdirSync(stage,{recursive:true});
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).filter(includeInLocalPackage).sort();
 for(const f of files){const from=resolve(root,f);if(!from.startsWith(root)||!lstatSync(from).isFile())throw new Error('Only ordinary repository files may be packaged');mkdirSync(dirname(resolve(stage,f)),{recursive:true});cpSync(from,resolve(stage,f));}
 const meta={createdAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceTreeDirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),nodeRequired:'>=24',entryPoint:'start-local.cmd',data:'Repository source snapshots; fresh local database created on first normal start. No personal runtime data bundled.',files:files.map(f=>({path:f,sha256:createHash('sha256').update(readFileSync(resolve(stage,f))).digest('hex')}))};
 writeFileSync(resolve(stage,'LOCAL-DELIVERY.json'),JSON.stringify(meta,null,2)+'\n');
 try{writeFileSync(target,standardZip([...files,'LOCAL-DELIVERY.json'].map(path=>({name:path,data:readFileSync(resolve(stage,path))}))),{flag:'wx'});}catch(error){throw new Error('ZIP creation failed; staging preserved for inspection: '+error.message);}
 return {archive:target,stage,files:files.length,sha256:createHash('sha256').update(readFileSync(target)).digest('hex'),sourceCommit:meta.sourceCommit};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==4||process.argv[2]!=='--output')throw new Error('Usage: --output tmp/<new-package>.zip');console.log(JSON.stringify(packageLocal({output:process.argv[3]})));}
