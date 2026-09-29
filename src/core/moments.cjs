function defaultMoments(){return {hugEnabled:true,umbrellaEnabled:true,
 anniversary:{enabled:false,date:'',title:'在一起的日子',letter:'{昵称}：\n\n想把每一个和你有关的日子，都好好收藏起来。谢谢你来到我的生活里。未来也想和你一起，慢慢走，好好爱。\n\n一直喜欢你的{我的称呼}'}};}
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return y>=1900&&y<=2199&&date.toISOString().slice(0,10)===value;}
function validateMoments(value,clean){
 const d=defaultMoments();if(value===undefined)return d;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('彩蛋设置格式不正确');
 // Ignore retired fields when reading older settings and companion manifests.
 const out={};for(const key of ['hugEnabled','umbrellaEnabled']){if(typeof value[key]!=='boolean')throw Error('彩蛋开关格式不正确');out[key]=value[key];}
 const a=value.anniversary;if(!a||typeof a.enabled!=='boolean')throw Error('纪念日设置格式不正确');
 if(typeof a.date!=='string'||(a.date!==''&&!validDate(a.date))||(a.enabled&&!a.date))throw Error('请先填写有效的纪念日日期');
 out.anniversary={enabled:a.enabled,date:a.date,title:clean(a.title,30,'纪念日名称',false),letter:clean(a.letter,1200,'纪念日信件',false)};
 return out;
}
function localDay(now=new Date()){const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function anniversaryInfo(config,now=new Date()){
 const a=config.moments.anniversary,today=localDay(now);if(!a.date)return null;
 const [year,month,day]=today.split('-').map(Number),[,am,ad]=a.date.split('-').map(Number);
 const leap=new Date(year,1,29).getMonth()===1,targetDay=am===2&&ad===29&&!leap?28:ad;
 return {due:a.enabled&&today>=a.date&&month===am&&day===targetDay,key:`${a.date}:${today}`,
   days:Math.max(1,Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(a.date+'T00:00:00Z'))/86400000)+1)};
}
function pendingAnniversary(config,runtime,now){const info=anniversaryInfo(config,now);return info?.due&&!(runtime.anniversarySeen||[]).includes(info.key)?info:null;}
module.exports={defaultMoments,validateMoments,validDate,localDay,anniversaryInfo,pendingAnniversary};
