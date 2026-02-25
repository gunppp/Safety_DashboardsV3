import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Edit,
  Flame,
  Megaphone,
  Plus,
  Save,
  Shield,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type DayStatus = 'safe' | 'near_miss' | 'accident' | null;
interface DailyStatistic { day: number; status: DayStatus }
interface MonthlyData { month: number; year: number; days: DailyStatistic[] }
interface Announcement { id: string; text: string }
interface SafetyKpi {
  accidentCase: number; nearMissCase: number; firstAidCase: number; fireCase: number;
  ppeCompliance: number; trainingCompletion: number; ifr: number; isr: number;
}
interface LayoutState {
  cols: [number, number, number];
  leftRows: [number, number, number];
  centerRows: [number, number];
  rightRows: [number, number];
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  { id: '1', text: 'PPE Audit ประจำสัปดาห์ทุกวันพฤหัสบดี เวลา 09:00 น.' },
  { id: '2', text: 'Emergency Drill ไตรมาสนี้กำหนดวันที่ 28 มีนาคม 2026' },
];
const DEFAULT_POLICY_LINES = [
  'ปฏิบัติตามกฎความปลอดภัยและสวม PPE ก่อนเข้าพื้นที่ผลิต',
  'แจ้ง Near Miss / Unsafe Condition ทันทีเมื่อพบความเสี่ยง',
  'หยุดงานทันทีเมื่อพบสภาพไม่ปลอดภัย (Stop Work Authority)',
  'ทุกคนมีส่วนร่วมรักษา Zero Accident Workplace',
];
const DEFAULT_KPI: SafetyKpi = {
  accidentCase: 0, nearMissCase: 2, firstAidCase: 4, fireCase: 0,
  ppeCompliance: 98, trainingCompletion: 94, ifr: 0, isr: 1.2,
};
const BASE_VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_LAYOUT: LayoutState = {
  cols: [29, 39, 32],
  leftRows: [27, 18, 55],
  centerRows: [52, 48],
  rightRows: [72, 28],
};

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function sum(arr: number[]) { return arr.reduce((a,b)=>a+b,0); }
function normalized<T extends number[]>(arr: T): T {
  const s = sum(arr as number[]);
  return arr.map((v)=> (v/s)*100) as T;
}
function rootFontSize(w:number,h:number){
  const scale = Math.min(w/BASE_VIEWPORT.width, h/BASE_VIEWPORT.height);
  return clamp(16 * Math.pow(Math.max(scale,0.35), 0.45), 14, 24);
}
function createYearData(year:number): MonthlyData[] {
  return Array.from({length:12}, (_,m)=> ({
    month:m, year,
    days: Array.from({length:new Date(year,m+1,0).getDate()},(_,i)=>({day:i+1,status:null}))
  }));
}
function isValidMonthlyData(data: unknown, year:number): data is MonthlyData[] {
  return Array.isArray(data) && data.length===12 && data.every((m:any, idx)=>
    m && m.month===idx && m.year===year && Array.isArray(m.days) && m.days.length===new Date(year, idx+1, 0).getDate()
  );
}
function isValidLayout(data: any): data is LayoutState {
  if (!data) return false;
  const keys: (keyof LayoutState)[] = ['cols','leftRows','centerRows','rightRows'];
  return keys.every((k)=> Array.isArray(data[k]) && data[k].every((v:number)=> typeof v === 'number'));
}

function useResizeGroup(
  values: number[],
  setValues: (next:number[])=>void,
  minEach = 12
){
  return (index:number)=> (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const target = e.currentTarget as HTMLElement;
    const orientation = target.dataset.orientation as 'horizontal'|'vertical';
    const container = target.parentElement as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const totalPx = orientation === 'vertical' ? rect.width : rect.height;
    const start = [...values];

    const move = (ev: MouseEvent) => {
      const deltaPx = orientation === 'vertical' ? (ev.clientX - startX) : (ev.clientY - startY);
      const deltaPct = (deltaPx / Math.max(1, totalPx)) * 100;
      let a = start[index] + deltaPct;
      let b = start[index+1] - deltaPct;
      const rest = sum(start) - start[index] - start[index+1];
      const maxA = 100 - rest - minEach;
      a = clamp(a, minEach, maxA);
      b = 100 - rest - a;
      if (b < minEach) {
        b = minEach;
        a = 100 - rest - b;
      }
      const next = [...start];
      next[index] = a;
      next[index+1] = b;
      setValues(normalized(next));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
}

function Splitter({ orientation, onMouseDown }: { orientation:'vertical'|'horizontal'; onMouseDown:(e:React.MouseEvent)=>void }) {
  return (
    <div
      data-orientation={orientation}
      onMouseDown={onMouseDown}
      className={orientation === 'vertical'
        ? 'relative w-2 -mx-1 cursor-col-resize group'
        : 'relative h-2 -my-1 cursor-row-resize group'}
      title="ลากเพื่อปรับขนาด"
    >
      <div className={orientation === 'vertical'
        ? 'absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-sky-300/40 group-hover:bg-sky-500'
        : 'absolute top-1/2 left-0 w-full h-[3px] -translate-y-1/2 rounded-full bg-sky-300/40 group-hover:bg-sky-500'}
      />
    </div>
  );
}

function Card({ title, icon, children, className=''}:{ title:string; icon:React.ReactNode; children:React.ReactNode; className?:string }) {
  return (
    <section className={`rounded-2xl border border-sky-100 bg-white/95 shadow-sm min-h-0 flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-slate-800 font-semibold">
        {icon}
        <h2 className="truncate">{title}</h2>
      </div>
      <div className="p-3 min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function SafetyDashboard() {
  const now = new Date();
  const [displayMonth, setDisplayMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>(() => createYearData(now.getFullYear()));
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULT_ANNOUNCEMENTS);
  const [policyPoster, setPolicyPoster] = useState<string | null>(null);
  const [policyTitle, setPolicyTitle] = useState('Safety Policy');
  const [policyLines, setPolicyLines] = useState<string[]>(DEFAULT_POLICY_LINES);
  const [sloganTh, setSloganTh] = useState('ความปลอดภัย เริ่มที่ตัวเรา');
  const [sloganEn, setSloganEn] = useState('Safety Starts With Me');
  const [kpi, setKpi] = useState<SafetyKpi>(DEFAULT_KPI);
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);

  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [annDraft, setAnnDraft] = useState('');
  const [editSlogan, setEditSlogan] = useState(false);
  const [sloganThDraft, setSloganThDraft] = useState('');
  const [sloganEnDraft, setSloganEnDraft] = useState('');
  const [editPolicy, setEditPolicy] = useState(false);
  const [policyTitleDraft, setPolicyTitleDraft] = useState('');
  const [policyLinesDraft, setPolicyLinesDraft] = useState('');
  const [editKpi, setEditKpi] = useState(false);
  const [kpiDraft, setKpiDraft] = useState<SafetyKpi>(DEFAULT_KPI);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = `safety-dashboard-${currentYear}`;
  const layoutKey = 'safety-dashboard-layout-v3';

  useEffect(() => { const t=setInterval(()=>setCurrentTime(new Date()),1000); return ()=>clearInterval(t); }, []);
  useEffect(() => {
    const onResize = () => {
      const root = document.documentElement;
      root.style.setProperty('--font-size', `${rootFontSize(window.innerWidth, window.innerHeight)}px`);
    };
    onResize(); window.addEventListener('resize', onResize);
    return ()=>window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setMonthlyData(isValidMonthlyData(parsed.monthlyData, currentYear) ? parsed.monthlyData : createYearData(currentYear));
        setAnnouncements(Array.isArray(parsed.announcements) && parsed.announcements.length ? parsed.announcements : DEFAULT_ANNOUNCEMENTS);
        setPolicyPoster(typeof parsed.policyPoster === 'string' ? parsed.policyPoster : null);
        setPolicyTitle(typeof parsed.policyTitle === 'string' ? parsed.policyTitle : 'Safety Policy');
        setPolicyLines(Array.isArray(parsed.policyLines) && parsed.policyLines.length ? parsed.policyLines : DEFAULT_POLICY_LINES);
        setSloganTh(typeof parsed.sloganTh === 'string' ? parsed.sloganTh : 'ความปลอดภัย เริ่มที่ตัวเรา');
        setSloganEn(typeof parsed.sloganEn === 'string' ? parsed.sloganEn : 'Safety Starts With Me');
        setKpi({ ...DEFAULT_KPI, ...(parsed.kpi || {}) });
      } else {
        setMonthlyData(createYearData(currentYear));
      }
    } catch {
      setMonthlyData(createYearData(currentYear));
    }
  }, [storageKey, currentYear]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ monthlyData, announcements, policyPoster, policyTitle, policyLines, sloganTh, sloganEn, kpi }));
  }, [monthlyData, announcements, policyPoster, policyTitle, policyLines, sloganTh, sloganEn, kpi, storageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(layoutKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isValidLayout(parsed)) setLayout({
        cols: normalized(parsed.cols),
        leftRows: normalized(parsed.leftRows),
        centerRows: normalized(parsed.centerRows),
        rightRows: normalized(parsed.rightRows),
      });
    } catch {}
  }, []);
  useEffect(() => { localStorage.setItem(layoutKey, JSON.stringify(layout)); }, [layout]);

  useEffect(() => {
    const runAutoFill = () => {
      const d = new Date();
      if (d.getFullYear() !== currentYear) return;
      setMonthlyData(prev => {
        const next = prev.map(m => ({...m, days: m.days.map(x=>({...x}))}));
        let changed = false;
        const mIdx = d.getMonth(); const today = d.getDate();
        const cutoff = d.getHours() > 16 || (d.getHours()===16 && d.getMinutes()>=0);
        next[mIdx].days.forEach((item, idx) => {
          if (item.status !== null) return;
          const dayNum = idx+1;
          if (dayNum < today || (dayNum===today && cutoff)) { item.status = 'safe'; changed = true; }
        });
        return changed ? next : prev;
      });
    };
    runAutoFill();
    const t = setInterval(runAutoFill, 60000);
    return ()=>clearInterval(t);
  }, [currentYear]);

  const currentMonthData = monthlyData[displayMonth];
  const monthStartOffset = currentMonthData ? new Date(currentYear, displayMonth, 1).getDay() : 0;
  const safetyStreak = useMemo(() => {
    const items: {date:Date,status:DayStatus}[] = [];
    monthlyData.forEach(m => m.days.forEach(d => items.push({date:new Date(m.year,m.month,d.day), status:d.status})));
    items.sort((a,b)=>a.date.getTime()-b.date.getTime());
    let streak = 0;
    for (let i=items.length-1;i>=0;i--) {
      if (items[i].status === null) continue;
      if (items[i].status === 'accident') break;
      streak += 1;
    }
    return streak;
  }, [monthlyData]);
  const monthSummary = useMemo(() => {
    return (currentMonthData?.days || []).reduce((acc,d)=>{
      if (d.status==='safe') acc.safe++; if (d.status==='near_miss') acc.nearMiss++; if (d.status==='accident') acc.accident++; if (d.status!==null) acc.filled++; acc.total++; return acc;
    }, {safe:0,nearMiss:0,accident:0,filled:0,total:0});
  }, [currentMonthData]);

  const formatDate = (d:Date)=> new Intl.DateTimeFormat('th-TH',{ weekday:'long', day:'2-digit', month:'long', year:'numeric' }).format(d);
  const formatTime = (d:Date)=> new Intl.DateTimeFormat('th-TH',{ hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(d);

  const cycleDayStatus = (m:number, idx:number) => {
    setMonthlyData(prev => {
      const next = prev.map(x=>({...x, days:x.days.map(d=>({...d}))}));
      const current = next[m].days[idx].status;
      const order: DayStatus[] = [null,'safe','near_miss','accident'];
      next[m].days[idx].status = order[(order.indexOf(current)+1)%order.length];
      return next;
    });
  };
  const dayClass = (s:DayStatus) => s==='safe' ? 'bg-emerald-500 text-white border-emerald-600' : s==='near_miss' ? 'bg-amber-300 text-slate-900 border-amber-400' : s==='accident' ? 'bg-rose-500 text-white border-rose-600' : 'bg-slate-50 text-slate-500 border-slate-200';

  const onColsResize = useResizeGroup(layout.cols, (v)=>setLayout(l=>({...l, cols:v as LayoutState['cols']})), 20);
  const onLeftRowsResize = useResizeGroup(layout.leftRows, (v)=>setLayout(l=>({...l, leftRows:v as LayoutState['leftRows']})), 15);
  const onCenterRowsResize = useResizeGroup(layout.centerRows, (v)=>setLayout(l=>({...l, centerRows:v as LayoutState['centerRows']})), 18);
  const onRightRowsResize = useResizeGroup(layout.rightRows, (v)=>setLayout(l=>({...l, rightRows:v as LayoutState['rightRows']})), 20);

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50 text-slate-800" style={{ fontSize: 'var(--font-size,16px)' }}>
      <div className="h-full p-3 flex flex-col gap-3">
        <div className="rounded-2xl border border-sky-100 bg-white/95 shadow-sm px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-100 border border-emerald-200"><Shield className="h-6 w-6 text-emerald-700" /></div>
            <div className="min-w-0">
              <div className="font-bold text-lg truncate">Factory Safety Dashboard</div>
              <div className="text-xs text-slate-500 truncate">{formatDate(currentTime)} • Auto Safe Mark 16:00</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <div className="text-xs text-slate-500">Live Time</div>
              <div className="font-mono text-xl font-bold text-sky-700">{formatTime(currentTime)}</div>
            </div>
            <div className="flex items-center gap-1 border rounded-xl p-1 bg-slate-50">
              <button onClick={()=>setCurrentYear(y=>y-1)} className="h-8 w-8 rounded-lg hover:bg-white">−</button>
              <div className="px-2 font-semibold">{currentYear}</div>
              <button onClick={()=>setCurrentYear(y=>y+1)} className="h-8 w-8 rounded-lg hover:bg-white">+</button>
            </div>
            <button onClick={()=>setLayout(DEFAULT_LAYOUT)} className="h-8 px-3 text-xs rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-200">Reset Layout</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="h-full min-w-0" style={{ width: `${layout.cols[0]}%` }}>
            <div className="h-full flex flex-col">
              <div style={{ height: `${layout.leftRows[0]}%` }} className="min-h-0">
                <Card title="Safety Slogan" icon={<Shield className="h-4 w-4 text-emerald-600" />} className="h-full">
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex justify-end">
                      {!editSlogan ? (
                        <button onClick={()=>{setSloganThDraft(sloganTh); setSloganEnDraft(sloganEn); setEditSlogan(true);}} className="text-xs h-8 px-2 rounded-lg border bg-slate-50 hover:bg-white flex items-center gap-1"><Edit className="h-3.5 w-3.5"/>Edit</button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={()=>{setSloganTh(sloganThDraft||sloganTh); setSloganEn(sloganEnDraft||sloganEn); setEditSlogan(false);}} className="text-xs h-8 px-2 rounded-lg bg-emerald-500 text-white flex items-center gap-1"><Save className="h-3.5 w-3.5"/>Save</button>
                          <button onClick={()=>setEditSlogan(false)} className="text-xs h-8 px-2 rounded-lg border"><X className="h-3.5 w-3.5"/></button>
                        </div>
                      )}
                    </div>
                    {!editSlogan ? (
                      <div className="flex-1 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-sky-50 p-3 flex flex-col justify-center">
                        <div className="text-center text-xl font-bold text-emerald-700">“{sloganTh}”</div>
                        <div className="text-center text-sm italic text-sky-700 mt-1">“{sloganEn}”</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input value={sloganThDraft} onChange={e=>setSloganThDraft(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                        <input value={sloganEnDraft} onChange={e=>setSloganEnDraft(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    )}
                  </div>
                </Card>
              </div>
              <Splitter orientation="horizontal" onMouseDown={onLeftRowsResize(0)} />
              <div style={{ height: `${layout.leftRows[1]}%` }} className="min-h-0">
                <Card title="Safety Streak" icon={<Target className="h-4 w-4 text-amber-600" />} className="h-full">
                  <div className="h-full rounded-xl bg-gradient-to-r from-amber-50 to-emerald-50 border border-amber-100 p-3 flex flex-col justify-center">
                    <div className="text-xs text-slate-500">No accident streak</div>
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-black text-emerald-700 leading-none">{safetyStreak}</span>
                      <span className="mb-1 text-slate-600">days</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">Near Miss ยังนับเป็นไม่มีอุบัติเหตุ</div>
                  </div>
                </Card>
              </div>
              <Splitter orientation="horizontal" onMouseDown={onLeftRowsResize(1)} />
              <div style={{ height: `${layout.leftRows[2]}%` }} className="min-h-0">
                <Card title={policyTitle} icon={<Target className="h-4 w-4 text-sky-600" />} className="h-full">
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex justify-between gap-2">
                      <div className="flex gap-2">
                        <button onClick={()=>fileInputRef.current?.click()} className="text-xs h-8 px-2 rounded-lg bg-sky-100 border border-sky-200 text-sky-800 flex items-center gap-1"><Upload className="h-3.5 w-3.5"/>Poster</button>
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={(e)=>{
                          const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setPolicyPoster(String(ev.target?.result||'')); r.readAsDataURL(f);
                        }} />
                      </div>
                      {!editPolicy ? (
                        <button onClick={()=>{setPolicyTitleDraft(policyTitle); setPolicyLinesDraft(policyLines.join('\n')); setEditPolicy(true);}} className="text-xs h-8 px-2 rounded-lg border flex items-center gap-1"><Edit className="h-3.5 w-3.5"/></button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={()=>{setPolicyTitle(policyTitleDraft||policyTitle); const lines=policyLinesDraft.split('\n').map(s=>s.trim()).filter(Boolean); setPolicyLines(lines.length?lines:DEFAULT_POLICY_LINES); setEditPolicy(false);}} className="text-xs h-8 px-2 rounded-lg bg-sky-500 text-white"><Save className="h-3.5 w-3.5"/></button>
                          <button onClick={()=>setEditPolicy(false)} className="text-xs h-8 px-2 rounded-lg border"><X className="h-3.5 w-3.5"/></button>
                        </div>
                      )}
                    </div>
                    {policyPoster && <img src={policyPoster} className="w-full h-28 object-cover rounded-xl border border-slate-200" alt="poster" />}
                    {!editPolicy ? (
                      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <ul className="space-y-2 text-sm">
                          {policyLines.map((line,i)=><li key={i} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-500" /> <span>{line}</span></li>)}
                        </ul>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input value={policyTitleDraft} onChange={e=>setPolicyTitleDraft(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                        <textarea value={policyLinesDraft} onChange={e=>setPolicyLinesDraft(e.target.value)} className="w-full h-36 border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>

          <Splitter orientation="vertical" onMouseDown={onColsResize(0)} />

          <div className="h-full min-w-0" style={{ width: `${layout.cols[1]}%` }}>
            <div className="h-full flex flex-col">
              <div style={{ height: `${layout.centerRows[0]}%` }} className="min-h-0">
                <Card title="Safety Data" icon={<Activity className="h-4 w-4 text-sky-600" />} className="h-full">
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex justify-end">
                      {!editKpi ? (
                        <button onClick={()=>{setKpiDraft(kpi); setEditKpi(true);}} className="text-xs h-8 px-2 rounded-lg border flex items-center gap-1"><Edit className="h-3.5 w-3.5"/>Edit KPI</button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={()=>{ const c=(n:number)=>Math.max(0,Number(n)||0); const p=(n:number)=>clamp(Number(n)||0,0,100); setKpi({...kpiDraft, accidentCase:c(kpiDraft.accidentCase), nearMissCase:c(kpiDraft.nearMissCase), firstAidCase:c(kpiDraft.firstAidCase), fireCase:c(kpiDraft.fireCase), ppeCompliance:p(kpiDraft.ppeCompliance), trainingCompletion:p(kpiDraft.trainingCompletion), ifr:c(kpiDraft.ifr), isr:c(kpiDraft.isr)}); setEditKpi(false); }} className="text-xs h-8 px-2 rounded-lg bg-emerald-500 text-white flex items-center gap-1"><Save className="h-3.5 w-3.5"/>Save</button>
                          <button onClick={()=>setEditKpi(false)} className="text-xs h-8 px-2 rounded-lg border"><X className="h-3.5 w-3.5"/></button>
                        </div>
                      )}
                    </div>
                    {editKpi && (
                      <div className="grid grid-cols-2 gap-2">
                        {(['accidentCase','nearMissCase','firstAidCase','fireCase','ppeCompliance','trainingCompletion','ifr','isr'] as (keyof SafetyKpi)[]).map((key)=>(
                          <label key={key} className="text-xs">
                            <div className="mb-1 text-slate-500">{key}</div>
                            <input type="number" value={String(kpiDraft[key])} onChange={e=>setKpiDraft(s=>({...s,[key]:Number(e.target.value)}))} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {[
                        ['Accident', kpi.accidentCase, 'rose'], ['Near Miss', kpi.nearMissCase, 'amber'], ['First Aid', kpi.firstAidCase, 'sky'], ['Fire', kpi.fireCase, 'orange']
                      ].map(([label,value,tone])=> (
                        <div key={String(label)} className={`rounded-xl border p-3 ${tone==='rose'?'bg-rose-50 border-rose-100':tone==='amber'?'bg-amber-50 border-amber-100':tone==='orange'?'bg-orange-50 border-orange-100':'bg-sky-50 border-sky-100'}`}>
                          <div className="text-xs text-slate-500">{label}</div>
                          <div className="text-2xl font-bold">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[['PPE Compliance', kpi.ppeCompliance, 'emerald'], ['Training Completion', kpi.trainingCompletion, 'sky']].map(([label,val,tone])=> (
                        <div key={String(label)} className="rounded-xl border border-slate-100 p-3 bg-slate-50">
                          <div className="text-xs text-slate-500">{label}</div>
                          <div className="flex items-end justify-between"><div className={`text-2xl font-bold ${tone==='emerald'?'text-emerald-700':'text-sky-700'}`}>{val}%</div><div className="text-xs text-slate-400">Target</div></div>
                          <div className="mt-2 h-2 rounded-full bg-white border border-slate-200 overflow-hidden"><div className={`h-full ${tone==='emerald'?'bg-emerald-500':'bg-sky-500'}`} style={{width:`${clamp(Number(val),0,100)}%`}} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
              <Splitter orientation="horizontal" onMouseDown={onCenterRowsResize(0)} />
              <div style={{ height: `${layout.centerRows[1]}%` }} className="min-h-0">
                <Card title="Announcements" icon={<Megaphone className="h-4 w-4 text-amber-600" />} className="h-full">
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex justify-between">
                      <div className="text-xs text-slate-500">ลากเส้นคั่นเพื่อย่อ/ขยายช่องนี้ได้</div>
                      <button onClick={()=>{ const item={id:Date.now().toString(), text:'ประกาศใหม่...'}; setAnnouncements(a=>[item,...a]); setEditingAnnId(item.id); setAnnDraft(item.text); }} className="text-xs h-8 px-2 rounded-lg bg-amber-300 hover:bg-amber-400 border border-amber-400 text-slate-900 flex items-center gap-1"><Plus className="h-3.5 w-3.5"/>Add</button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto space-y-2 pr-1">
                      {announcements.map((a, idx)=> (
                        <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-2">
                          {editingAnnId===a.id ? (
                            <div className="space-y-2">
                              <textarea className="w-full border rounded-lg px-2 py-2 text-sm h-20" value={annDraft} onChange={e=>setAnnDraft(e.target.value)} />
                              <div className="flex justify-end gap-1">
                                <button onClick={()=>{setAnnouncements(list=>list.map(x=>x.id===a.id?{...x,text:annDraft||x.text}:x)); setEditingAnnId(null);}} className="h-8 px-2 text-xs rounded-lg bg-emerald-500 text-white">Save</button>
                                <button onClick={()=>setEditingAnnId(null)} className="h-8 px-2 text-xs rounded-lg border">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-start">
                              <div className="h-7 w-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-xs font-bold text-amber-700">{idx+1}</div>
                              <div className="flex-1 text-sm">{a.text}</div>
                              <div className="flex gap-1">
                                <button onClick={()=>{setEditingAnnId(a.id); setAnnDraft(a.text);}} className="h-8 w-8 rounded-lg border"><Edit className="h-4 w-4 mx-auto"/></button>
                                <button onClick={()=>setAnnouncements(list=>list.filter(x=>x.id!==a.id))} className="h-8 w-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-600"><Trash2 className="h-4 w-4 mx-auto"/></button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          <Splitter orientation="vertical" onMouseDown={onColsResize(1)} />

          <div className="h-full min-w-0" style={{ width: `${layout.cols[2]}%` }}>
            <div className="h-full flex flex-col">
              <div style={{ height: `${layout.rightRows[0]}%` }} className="min-h-0">
                <Card title="Daily Safety Calendar" icon={<Calendar className="h-4 w-4 text-emerald-600" />} className="h-full">
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{MONTHS[displayMonth]} {currentYear}</div>
                        <div className="text-xs text-slate-500">คลิกวันเพื่อเปลี่ยนสถานะ Safe → Near Miss → Accident</div>
                      </div>
                      <div className="flex gap-1 text-xs">
                        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">Safe</span>
                        <span className="px-2 py-1 rounded bg-amber-100 text-amber-700">Near Miss</span>
                        <span className="px-2 py-1 rounded bg-rose-100 text-rose-700">Accident</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-[0.72rem] text-slate-500">
                      {DAY_HEADERS.map(d => <div key={d} className="text-center font-semibold py-1">{d}</div>)}
                    </div>
                    <div className="flex-1 min-h-0 grid grid-cols-7 gap-1 auto-rows-fr">
                      {Array.from({length: monthStartOffset}).map((_,i)=><div key={i} />)}
                      {currentMonthData?.days.map((d, idx)=>(
                        <button key={d.day} onClick={()=>cycleDayStatus(displayMonth, idx)} className={`rounded-lg border text-xs font-bold ${dayClass(d.status)}`}>{d.day}</button>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
              <Splitter orientation="horizontal" onMouseDown={onRightRowsResize(0)} />
              <div style={{ height: `${layout.rightRows[1]}%` }} className="min-h-0">
                <Card title="Month Summary" icon={<CheckCircle2 className="h-4 w-4 text-sky-600" />} className="h-full">
                  <div className="h-full flex flex-col gap-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg p-2 bg-emerald-50 border border-emerald-100 text-center"><div className="text-xs text-slate-500">Safe</div><div className="text-lg font-bold text-emerald-700">{monthSummary.safe}</div></div>
                      <div className="rounded-lg p-2 bg-amber-50 border border-amber-100 text-center"><div className="text-xs text-slate-500">Near Miss</div><div className="text-lg font-bold text-amber-700">{monthSummary.nearMiss}</div></div>
                      <div className="rounded-lg p-2 bg-rose-50 border border-rose-100 text-center"><div className="text-xs text-slate-500">Accident</div><div className="text-lg font-bold text-rose-700">{monthSummary.accident}</div></div>
                    </div>
                    <div className="text-xs text-slate-500">Filled {monthSummary.filled}/{monthSummary.total}</div>
                    <div className="grid grid-cols-3 gap-1 overflow-auto pr-1">
                      {monthlyData.map(m => {
                        const safe = m.days.filter(x=>x.status==='safe').length;
                        const acc = m.days.filter(x=>x.status==='accident').length;
                        const active = m.month===displayMonth;
                        return <button key={m.month} onClick={()=>setDisplayMonth(m.month)} className={`rounded-lg border p-1.5 text-xs ${active?'bg-sky-100 border-sky-300':'bg-slate-50 border-slate-200 hover:bg-white'}`}>
                          <div className="font-semibold">{MONTHS[m.month].slice(0,3)}</div>
                          <div className="text-[0.65rem] text-emerald-700">{safe} safe</div>
                          <div className={`text-[0.65rem] ${acc ? 'text-rose-600' : 'text-slate-400'}`}>{acc} acc</div>
                        </button>
                      })}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
