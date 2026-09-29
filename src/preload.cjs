const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['get-state','save-settings','start','manual','pause','reset-position','open-settings','close-settings','finish-close-settings','quit','menu','bubble-action','export-gift','read-gift','apply-gift','reset-settings','clear-private','export-companion','reveal-companion','test-control','open-moment','preview-moment','moment-ready','moment-action']);
contextBridge.exposeInMainWorld('banban',{
  call:async(name,...args)=>{if(!allowed.has(name))throw new Error('不支持的操作');const result=await ipcRenderer.invoke(name,...args);if(!result.ok)throw new Error(result.error);return result.value;},
  on:(name,callback)=>{if(!['state','status','bubble','sleep','prepare-close','drag-finished','gift-progress','surprise','gaze'].includes(name))return;const listener=(_event,value)=>callback(value);ipcRenderer.on(name,listener);return()=>ipcRenderer.removeListener(name,listener);},
  trackGaze:enabled=>ipcRenderer.send('gaze-tracking',Boolean(enabled)),
  surprise:action=>{if(['ready','ended','dismiss'].includes(action))ipcRenderer.send('surprise',action);},
  pointer:interactive=>ipcRenderer.send('pointer',Boolean(interactive)),
  drag:action=>{if(['start','end','cancel'].includes(action))ipcRenderer.send('drag',action);},
  bubbleSize:(id,width,height)=>ipcRenderer.send('bubble-size',{id,width,height})
});
