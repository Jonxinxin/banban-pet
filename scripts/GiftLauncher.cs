using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class GiftLauncher {
    static void CopyBytes(Stream source, Stream target, long count) {
        byte[] buffer=new byte[1024*1024];
        while(count>0){int n=source.Read(buffer,0,(int)Math.Min(buffer.Length,count));if(n<=0)throw new InvalidDataException();target.Write(buffer,0,n);count-=n;}
    }
    [STAThread] static void Main() {
        Form splash=null;
        try {
            string self=Application.ExecutablePath;
            byte[] footer=new byte[32],json;
            long zipLength,zipOffset;
            using(var input=File.OpenRead(self)){
                if(input.Length<32)throw new InvalidDataException();input.Seek(-32,SeekOrigin.End);input.Read(footer,0,32);
                if(Encoding.ASCII.GetString(footer,0,14)!="BANBAN_GIFT_V1"||BitConverter.ToInt32(footer,28)!=1)throw new InvalidDataException();
                zipLength=BitConverter.ToInt64(footer,16);int length=BitConverter.ToInt32(footer,24);
                if(length<2||length>512000||zipLength<1||zipLength>1073741824)throw new InvalidDataException();
                zipOffset=input.Length-32-length-zipLength;if(zipOffset<1024)throw new InvalidDataException();
                input.Seek(input.Length-32-length,SeekOrigin.Begin);json=new byte[length];int read=0;while(read<length){int n=input.Read(json,read,length-read);if(n<=0)throw new InvalidDataException();read+=n;}
            }
            var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(json));
            string id=Convert.ToString(data["id"]),hash=Convert.ToString(data["payloadSha256"]);
            if(!Regex.IsMatch(id,"^[a-f0-9]{32}$")||!Regex.IsMatch(hash,"^[a-f0-9]{64}$")||Convert.ToString(data["format"])!="banban-companion")throw new InvalidDataException();
            string home=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"BanbanGifts",id);
            string runtime=Path.Combine(home,"runtime-"+hash.Substring(0,16)),marker=Path.Combine(runtime,".ready");
            Directory.CreateDirectory(home);
            using(var mutex=new System.Threading.Mutex(false,"Local\\BanbanGiftExtract_"+id)){
                try{mutex.WaitOne();}catch(System.Threading.AbandonedMutexException){}
                try{
                    if(!File.Exists(marker)||!File.Exists(Path.Combine(runtime,"伴伴.exe"))){
                        Application.EnableVisualStyles();splash=new Form{Text="伴伴",Width=330,Height=145,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,ControlBox=false,BackColor=Color.FromArgb(250,245,236)};
                        splash.Controls.Add(new Label{Text="伴伴正在赶来…\r\n正在安顿它的小窝，稍等一会儿。",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Microsoft YaHei UI",11),ForeColor=Color.FromArgb(135,100,84)});splash.Show();Application.DoEvents();
                        string zip=Path.Combine(home,"runtime-"+Guid.NewGuid().ToString("N")+".zip");
                        try{
                            using(var input=File.OpenRead(self))using(var output=File.Create(zip)){input.Seek(zipOffset,SeekOrigin.Begin);CopyBytes(input,output,zipLength);}
                            using(var input=File.OpenRead(zip))using(var sha=SHA256.Create()){string actual=BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();if(actual!=hash)throw new InvalidDataException();}
                            Directory.CreateDirectory(runtime);
                            string prefix=Path.GetFullPath(runtime)+Path.DirectorySeparatorChar;
                            using(var archive=ZipFile.OpenRead(zip))foreach(var entry in archive.Entries){
                                string target=Path.GetFullPath(Path.Combine(runtime,entry.FullName.Replace('/',Path.DirectorySeparatorChar)));
                                if(!target.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException();
                                if(entry.FullName.EndsWith("/")){Directory.CreateDirectory(target);continue;}
                                Directory.CreateDirectory(Path.GetDirectoryName(target));entry.ExtractToFile(target,true);Application.DoEvents();
                            }
                            File.WriteAllText(marker,hash);
                        }finally{if(File.Exists(zip))File.Delete(zip);}
                    }
                    string manifest=Path.Combine(home,"companion.json");File.WriteAllBytes(manifest,json);
                    var start=new ProcessStartInfo(Path.Combine(runtime,"伴伴.exe")){WorkingDirectory=runtime,UseShellExecute=false,CreateNoWindow=true};
                    start.EnvironmentVariables["BANBAN_GIFT_MANIFEST"]=manifest;
                    Process.Start(start);
                }finally{mutex.ReleaseMutex();}
            }
        }catch(Exception error){Environment.ExitCode=1;if(Environment.GetEnvironmentVariable("BANBAN_TEST")=="1")Console.Error.WriteLine(error.ToString());else MessageBox.Show("这份桌宠礼物没有完整打开。请重新复制完整的文件，或请制作人重新生成一份。","伴伴",MessageBoxButtons.OK,MessageBoxIcon.Information);}
        finally{if(splash!=null)splash.Close();}
    }
}
