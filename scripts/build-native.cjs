const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
if(!fs.existsSync(compiler))throw new Error('Build the Windows sensor on a Windows PC with .NET Framework 4.x installed.');
fs.mkdirSync(path.join(root,'build'),{recursive:true});
execFileSync(compiler,['/nologo','/optimize+','/target:exe','/platform:anycpu','/out:'+path.join(root,'build','FullscreenSensor.exe'),path.join(__dirname,'FullscreenSensor.cs')],{windowsHide:true,stdio:'inherit'});
console.log('Built lightweight Windows fullscreen sensor.');
for(const character of ['cat','dog'])execFileSync(compiler,['/nologo','/optimize+','/target:winexe','/platform:anycpu','/win32icon:'+path.join(root,'assets',character==='dog'?'dog-icon.ico':'icon.ico'),'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/out:'+path.join(root,'build',character==='dog'?'BanbanGiftLauncher-dog.exe':'BanbanGiftLauncher.exe'),path.join(__dirname,'GiftLauncher.cs')],{windowsHide:true,stdio:'inherit'});
console.log('Built single-file gift launcher.');
