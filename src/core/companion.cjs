const crypto=require('node:crypto');
const {defaults,validateConfig}=require('./config.cjs');
const FIELDS=['nickname','sender','welcome','petSize','petCharacter','moments','alwaysOnTop','water','stretch','windows','loveEnabled','useBuiltIn','quotes'];
function createCompanion(config){const clean=validateConfig(config);return{format:'banban-companion',version:1,id:crypto.randomUUID().replaceAll('-',''),settings:Object.fromEntries(FIELDS.map(k=>[k,clean[k]]))};}
function validateCompanion(value){
 if(!value||value.format!=='banban-companion'||value.version!==1||!/^[a-f0-9]{32}$/.test(value.id)||!value.settings)throw new Error('这份桌宠礼物的配置不完整，请重新制作。');
 const settings=Object.fromEntries(FIELDS.filter(k=>k in value.settings).map(k=>[k,value.settings[k]]));
 const clean=validateConfig({...defaults(),...settings});
 return{format:'banban-companion',version:1,id:value.id,settings:Object.fromEntries(FIELDS.map(k=>[k,clean[k]])),payloadSha256:value.payloadSha256};
}
function companionConfig(manifest){return validateConfig({...defaults(),...validateCompanion(manifest).settings,onboarded:true,hidden:false,startAtLogin:false,pauseUntil:0,position:null});}
module.exports={FIELDS,createCompanion,validateCompanion,companionConfig};
