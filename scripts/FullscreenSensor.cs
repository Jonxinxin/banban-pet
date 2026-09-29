using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class FullscreenSensor {
    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct MONITORINFO { public int Size; public RECT Monitor, Work; public uint Flags; }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X,Y; }
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(POINT point,uint flags);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out RECT rect);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder name, int max);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr window, int index);
    private static bool IsFullscreen(int ownPid) {
        IntPtr window = GetForegroundWindow(); if (window == IntPtr.Zero) return false;
        uint pid; GetWindowThreadProcessId(window, out pid); if (pid == ownPid) return false;
        var name = new StringBuilder(256); GetClassName(window, name, 256);
        string cls = name.ToString();
        if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return false;
        if ((GetWindowLong(window, -16) & 0x00C00000) != 0) return false;
        RECT rect; if (!GetWindowRect(window, out rect)) return false;
        var info = new MONITORINFO(); info.Size = Marshal.SizeOf(info);
        if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref info)) return false;
        return rect.Left <= info.Monitor.Left && rect.Top <= info.Monitor.Top && rect.Right >= info.Monitor.Right && rect.Bottom >= info.Monitor.Bottom;
    }
    private static int dragging=0;
    private static volatile bool cancelDrag=false;
    private static void MoveCapturedWindow(IntPtr window,RECT initial,int dx,int dy,POINT cursor) {
        RECT current;if(!GetWindowRect(window,out current))return;
        int x=initial.Left+dx,y=initial.Top+dy;
        var monitor=new MONITORINFO();monitor.Size=Marshal.SizeOf(monitor);
        if(GetMonitorInfo(MonitorFromPoint(cursor,2),ref monitor)){
            x=Math.Max(monitor.Work.Left,Math.Min(x,monitor.Work.Right-(current.Right-current.Left)));
            y=Math.Max(monitor.Work.Top,Math.Min(y,monitor.Work.Bottom-(current.Bottom-current.Top)));
        }
        if(x!=current.Left||y!=current.Top)SetWindowPos(window,IntPtr.Zero,x,y,0,0,0x0001|0x0004|0x0010);
    }
    private static void TestPath(IntPtr window,int parentId) {
        uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=parentId)return;
        RECT original;if(!GetWindowRect(window,out original))return;
        int[,] offsets={{0,-100},{100,-100},{100,0},{-100,0},{-100,-100},{0,0},{0,0},{0,0},{0,0}};
        bool passed=true;
        for(int i=0;i<offsets.GetLength(0);i++){
            int dx=offsets[i,0],dy=offsets[i,1];
            POINT cursor=new POINT{X=original.Left+dx+40,Y=original.Top+dy+40};
            MoveCapturedWindow(window,original,dx,dy,cursor);RECT actual;GetWindowRect(window,out actual);
            if(actual.Left!=original.Left+dx||actual.Top!=original.Top+dy)passed=false;
            Thread.Sleep(20);
        }
        Console.WriteLine(passed?"T PASS":"T FAIL");Console.Out.Flush();
    }
    private static void Drag(IntPtr window,int parentId) {
        uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=parentId)return;
        if(Interlocked.CompareExchange(ref dragging,1,0)!=0)return;
        bool moved=false,hugSent=false;
        try {
            cancelDrag=false;POINT start;RECT initial;if(!GetCursorPos(out start)||!GetWindowRect(window,out initial))return;
            Console.WriteLine("D 1");Console.Out.Flush();
            var timeout=Stopwatch.StartNew();
            while(!cancelDrag&&IsWindow(window)&&(GetAsyncKeyState(1)&0x8000)!=0&&timeout.ElapsedMilliseconds<120000){
                POINT cursor;RECT current;if(!GetCursorPos(out cursor)||!GetWindowRect(window,out current))break;
                int dx=cursor.X-start.X,dy=cursor.Y-start.Y;
                if(Math.Abs(dx)+Math.Abs(dy)>4)moved=true;
                if(!moved&&!hugSent&&timeout.ElapsedMilliseconds>=2000){hugSent=true;Console.WriteLine("H");Console.Out.Flush();}
                if(moved)MoveCapturedWindow(window,initial,dx,dy,cursor);
                Thread.Sleep(8);
            }
        } finally {Interlocked.Exchange(ref dragging,0);Console.WriteLine(moved?"D 0 1":"D 0 0");Console.Out.Flush();}
    }
    private static void Main(string[] args) {
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{SetProcessDPIAware();}
        int parentId; if (args.Length != 1 || !int.TryParse(args[0], out parentId)) return;
        try {
            var commands=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){
                if(line=="cancel-drag"){cancelDrag=true;continue;}
                if(line.StartsWith("test-path ")&&Environment.GetEnvironmentVariable("BANBAN_TEST")=="1"){long testHandle;if(long.TryParse(line.Substring(10),out testHandle))TestPath(new IntPtr(testHandle),parentId);continue;}
                if(line.StartsWith("drag ")){long handle;if(long.TryParse(line.Substring(5),out handle))ThreadPool.QueueUserWorkItem(_=>Drag(new IntPtr(handle),parentId));}
            }});commands.IsBackground=true;commands.Start();
            using (var parent = Process.GetProcessById(parentId)) {
                while (!parent.HasExited) {
                    Console.WriteLine(IsFullscreen(parentId) ? "1" : "0");
                    Console.Out.Flush();
                    Thread.Sleep(1500);
                }
            }
        } catch { /* Parent exited, or pipe closed: terminate without leaving a process behind. */ }
    }
}
