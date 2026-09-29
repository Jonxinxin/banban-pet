const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');const {once}=require('node:events');const {ZipFile}=require('yazl');
const rawFs=process.versions.electron?require('original-fs'):fs;
const {validateCompanion}=require('./companion.cjs');
function runtimeFiles(directory){
 const files=[];
 function walk(folder,relative){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const name=relative?relative+'/'+entry.name:entry.name;const full=path.join(folder,entry.name);if(entry.isDirectory())walk(full,name);else if(entry.isFile())files.push({full,name});}}
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  if(entry.isFile()&&!/^uninstall/i.test(entry.name)&&/\.(exe|dll|pak|bin|dat|json|txt|html)$/i.test(entry.name))files.push({full:path.join(directory,entry.name),name:entry.name});
  if(entry.isDirectory()&&entry.name==='locales')walk(path.join(directory,entry.name),'locales');
 }
 for(const name of ['app.asar','FullscreenSensor.exe']){const full=path.join(directory,'resources',name);if(!fs.existsSync(full))throw new Error('桌宠运行文件缺失，请重新安装伴伴后制作。');files.push({full,name:'resources/'+name});}
 const unpacked=path.join(directory,'resources','app.asar.unpacked');if(fs.existsSync(unpacked))walk(unpacked,'resources/app.asar.unpacked');
 return files;
}
async function hashFile(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function appendFile(output,file){for await(const chunk of fs.createReadStream(file)){if(!output.write(chunk))await once(output,'drain');}}
async function makeCompanion({runtimeDirectory,launcherPath,manifest,destination,tempDirectory,onProgress=()=>{}}){
 validateCompanion(manifest);const root=path.resolve(tempDirectory);fs.mkdirSync(root,{recursive:true});const temp=fs.mkdtempSync(path.join(root,'gift-'));
 const partial=destination+'.'+crypto.randomUUID()+'.partial';
 try{
  if(!fs.existsSync(launcherPath))throw new Error('制作组件缺失，请重新安装伴伴。');
  const archive=path.join(temp,'runtime.zip'),zip=new ZipFile();onProgress('正在把伴伴和陪伴功能装进行李…');
  const files=runtimeFiles(runtimeDirectory);
  zip.on('error',error=>zip.outputStream.destroy(error));
  const writing=pipeline(zip.outputStream,fs.createWriteStream(archive));
  for(const file of files){const stat=rawFs.statSync(file.full);zip.addReadStreamLazy(file.name,{size:stat.size,mtime:stat.mtime},callback=>callback(null,rawFs.createReadStream(file.full)));}
  zip.end();await writing;
  onProgress('正在收好你的称呼、提醒时间和情话…');
  const payload=Buffer.from(JSON.stringify({...manifest,payloadSha256:await hashFile(archive)}),'utf8');
  const footer=Buffer.alloc(32);footer.write('BANBAN_GIFT_V1',0,'ascii');footer.writeBigUInt64LE(BigInt(fs.statSync(archive).size),16);footer.writeUInt32LE(payload.length,24);footer.writeUInt32LE(1,28);
  const output=fs.createWriteStream(partial);let streamError;output.on('error',error=>{streamError=error;});
  try{await appendFile(output,launcherPath);await appendFile(output,archive);if(streamError)throw streamError;output.write(payload);output.end(footer);await once(output,'finish');}catch(error){output.destroy();throw error;}
  fs.renameSync(partial,destination);onProgress('礼物准备好了。');return{path:destination,bytes:fs.statSync(destination).size,id:manifest.id};
 }finally{
  if(fs.existsSync(partial))fs.unlinkSync(partial);
  const relative=path.relative(root,path.resolve(temp));if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))fs.rmSync(temp,{recursive:true,force:true});
 }
}
module.exports={makeCompanion,runtimeFiles};
