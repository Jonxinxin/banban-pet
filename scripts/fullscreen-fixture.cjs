const {app,BrowserWindow}=require('electron');
app.whenReady().then(()=>{
 const win=new BrowserWindow({fullscreen:true,frame:false,backgroundColor:'#ede4d8',title:'伴伴全屏测试窗口',webPreferences:{nodeIntegration:false,contextIsolation:true}});
 win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><body style="background:#ede4d8;display:grid;place-content:center;height:100vh;margin:0;font-family:Microsoft YaHei;color:#997c63"><h1>全屏避让测试</h1><p>这是伴伴的临时测试窗口，验证结束后会自动关闭。</p></body></html>'));
});
app.on('window-all-closed',()=>app.quit());
