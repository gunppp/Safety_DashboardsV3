import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Edit,
  Flame,
  Image as ImageIcon,
  Lock,
  Megaphone,
  Plus,
  Save,
  Shield,
  Target,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

type DayStatus = 'safe' | 'near_miss' | 'accident' | null;
interface DailyStatistic { day: number; status: DayStatus }
interface MonthlyData { month: number; year: number; days: DailyStatistic[] }
interface Announcement { id: string; text: string }
interface SafetyMetric { id: string; label: string; value: string; unit?: string }

type PanelKey =
  | 'slogan'
  | 'safetyData'
  | 'announcements'
  | 'calendar'
  | 'streak'
  | 'policy'
  | 'poster';

type SlotKey =
  | 'leftTop'
  | 'leftMid'
  | 'leftBottom'
  | 'centerTop'
  | 'centerBottom'
  | 'rightTop'
  | 'rightBottom';

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
const DEFAULT_METRICS: SafetyMetric[] = [
  { id: 'm1', label: 'Accident Case', value: '0', unit: 'case' },
  { id: 'm2', label: 'Near Miss', value: '2', unit: 'case' },
  { id: 'm3', label: 'PPE Compliance', value: '98', unit: '%' },
  { id: 'm4', label: 'Training Completion', value: '94', unit: '%' },
  { id: 'm5', label: 'IFR', value: '0', unit: '' },
  { id: 'm6', label: 'ISR', value: '1.2', unit: '' },
];

const BASE_VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_LAYOUT: LayoutState = {
  cols: [28, 44, 28],
  leftRows: [24, 30, 46],
  // make Safety Data bigger by default
  centerRows: [62, 38],
  rightRows: [66, 34],
};
const DEFAULT_SLOTS: Record<SlotKey, PanelKey> = {
  leftTop: 'slogan',
  leftMid: 'policy',
  leftBottom: 'poster',
  centerTop: 'safetyData',
  centerBottom: 'announcements',
  rightTop: 'calendar',
  rightBottom: 'streak',
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
function uid(prefix='id'){ return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`; }
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
function isValidSlots(data:any): data is Record<SlotKey, PanelKey> {
  const slots: SlotKey[] = ['leftTop','leftMid','leftBottom','centerTop','centerBottom','rightTop','rightBottom'];
  const panels: PanelKey[] = ['slogan','safetyData','announcements','calendar','streak','policy','poster'];
  return data && typeof data === 'object' && slots.every((s)=> panels.includes((data as any)[s]));
}

function useResizeGroup(values: number[], setValues: (next:number[])=>void, minEach = 12){
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
        ? 'absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-sky-300/60 group-hover:bg-sky-500'
        : 'absolute top-1/2 left-0 w-full h-[3px] -translate-y-1/2 rounded-full bg-sky-300/60 group-hover:bg-sky-500'}
      />
    </div>
  );
}

function Card({ title, icon, children, className='' }:{ title:string; icon:React.ReactNode; children:React.ReactNode; className?:string }) {
  return (
    <section className={`rounded-2xl border border-sky-100 bg-white shadow-sm min-h-0 flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-slate-800 font-semibold">
        {icon}
        <h2 className="truncate">{title}</h2>
      </div>
      <div className="p-3 min-h-0 flex-1">{children}</div>
    </section>
  );
}

const DND_TYPE = 'DASH_PANEL';

function DroppableSlot({
  slot,
  locked,
  onSwap,
  children,
}: {
  slot: SlotKey;
  locked: boolean;
  onSwap: (from: SlotKey, to: SlotKey) => void;
  children: React.ReactNode;
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: DND_TYPE,
    canDrop: () => !locked,
    drop: (item: any) => {
      if (!item?.fromSlot) return;
      if (item.fromSlot === slot) return;
      onSwap(item.fromSlot as SlotKey, slot);
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  }), [slot, locked, onSwap]);

  return (
    <div ref={drop as any} className={isOver && !locked ? 'ring-2 ring-sky-400 rounded-2xl' : ''}>
      {children}
    </div>
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
  const [metrics, setMetrics] = useState<SafetyMetric[]>(DEFAULT_METRICS);
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const [slots, setSlots] = useState<Record<SlotKey, PanelKey>>(DEFAULT_SLOTS);
  const [layoutLocked, setLayoutLocked] = useState(true);

  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [annDraft, setAnnDraft] = useState('');
  const [editSlogan, setEditSlogan] = useState(false);
  const [sloganThDraft, setSloganThDraft] = useState('');
  const [sloganEnDraft, setSloganEnDraft] = useState('');
  const [editPolicy, setEditPolicy] = useState(false);
  const [policyTitleDraft, setPolicyTitleDraft] = useState('');
  const [policyLinesDraft, setPolicyLinesDraft] = useState('');
  const [editMetrics, setEditMetrics] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = `safety-dashboard-${currentYear}`;
  const layoutKey = 'safety-dashboard-layout-v4';
  const slotKey = 'safety-dashboard-slots-v1';

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
        setMetrics(Array.isArray(parsed.metrics) && parsed.metrics.length ? parsed.metrics : DEFAULT_METRICS);
      } else {
        setMonthlyData(createYearData(currentYear));
      }
    } catch {
      setMonthlyData(createYearData(currentYear));
    }
  }, [storageKey, currentYear]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      monthlyData,
      announcements,
      policyPoster,
      policyTitle,
      policyLines,
      sloganTh,
      sloganEn,
      metrics,
    }));
  }, [monthlyData, announcements, policyPoster, policyTitle, policyLines, sloganTh, sloganEn, metrics, storageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(layoutKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidLayout(parsed)) setLayout({
          cols: normalized(parsed.cols),
          leftRows: normalized(parsed.leftRows),
          centerRows: normalized(parsed.centerRows),
          rightRows: normalized(parsed.rightRows),
        });
      }
    } catch {}
    try {
      const rawS = localStorage.getItem(slotKey);
      if (rawS) {
        const parsed = JSON.parse(rawS);
        if (isValidSlots(parsed)) setSlots(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => { localStorage.setItem(layoutKey, JSON.stringify(layout)); }, [layout]);
  useEffect(() => { localStorage.setItem(slotKey, JSON.stringify(slots)); }, [slots]);

  // Auto mark today as SAFE if still null at 16:00
  useEffect(() => {
    if (currentTime.getHours() < 16) return;
    if (currentTime.getFullYear() !== currentYear) return;
    const m = currentTime.getMonth();
    const d = currentTime.getDate();
    setMonthlyData((prev) => {
      const next = prev.map((mm) => ({ ...mm, days: mm.days.map((dd) => ({ ...dd })) }));
      const month = next[m];
      if (!month) return prev;
      const day = month.days[d - 1];
      if (!day || day.status !== null) return prev;
      day.status = 'safe';
      return next;
    });
  }, [currentTime, currentYear]);

  const onResizeCols = useResizeGroup(layout.cols, (next) => setLayout((p) => ({ ...p, cols: next as any })), 18);
  const onResizeLeft = useResizeGroup(layout.leftRows, (next) => setLayout((p) => ({ ...p, leftRows: next as any })), 14);
  const onResizeCenter = useResizeGroup(layout.centerRows, (next) => setLayout((p) => ({ ...p, centerRows: next as any })), 18);
  const onResizeRight = useResizeGroup(layout.rightRows, (next) => setLayout((p) => ({ ...p, rightRows: next as any })), 16);

  const displayMonthData = monthlyData[displayMonth];

  const safetyStreak = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    if (y !== currentYear) return 0;
    const end = new Date(y, today.getMonth(), today.getDate());
    let streak = 0;
    for (let dt = new Date(end); ; ) {
      const m = dt.getMonth();
      const d = dt.getDate();
      const st = monthlyData[m]?.days?.[d - 1]?.status ?? null;
      if (st === 'safe') streak += 1;
      else break;
      dt.setDate(dt.getDate() - 1);
      if (dt.getFullYear() !== y) break;
    }
    return streak;
  }, [monthlyData, currentYear]);

  const monthSummary = useMemo(() => {
    if (!displayMonthData) return { safe: 0, near: 0, accident: 0 };
    let safe = 0, near = 0, accident = 0;
    for (const d of displayMonthData.days) {
      if (d.status === 'safe') safe += 1;
      if (d.status === 'near_miss') near += 1;
      if (d.status === 'accident') accident += 1;
    }
    return { safe, near, accident };
  }, [displayMonthData]);

  const firstDayOffset = useMemo(() => new Date(currentYear, displayMonth, 1).getDay(), [currentYear, displayMonth]);
  const daysInMonth = useMemo(() => new Date(currentYear, displayMonth + 1, 0).getDate(), [currentYear, displayMonth]);
  const gridCells = useMemo(() => {
    const cells: Array<{ day: number | null }> = [];
    for (let i = 0; i < firstDayOffset; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [firstDayOffset, daysInMonth]);

  const setDayStatus = (day: number, status: DayStatus) => {
    setMonthlyData((prev) => {
      const next = prev.map((mm) => ({ ...mm, days: mm.days.map((dd) => ({ ...dd })) }));
      const month = next[displayMonth];
      if (!month) return prev;
      const target = month.days[day - 1];
      if (!target) return prev;
      target.status = status;
      return next;
    });
  };

  const swapSlots = (from: SlotKey, to: SlotKey) => {
    setSlots((prev) => {
      const next = { ...prev };
      const a = next[from];
      const b = next[to];
      next[from] = b;
      next[to] = a;
      return next;
    });
  };

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT);
    setSlots(DEFAULT_SLOTS);
    try { localStorage.removeItem(layoutKey); } catch {}
    try { localStorage.removeItem(slotKey); } catch {}
  };

  const startEditSlogan = () => {
    setSloganThDraft(sloganTh);
    setSloganEnDraft(sloganEn);
    setEditSlogan(true);
  };
  const saveSlogan = () => {
    setSloganTh(sloganThDraft.trim() || sloganTh);
    setSloganEn(sloganEnDraft.trim() || sloganEn);
    setEditSlogan(false);
  };

  const startEditPolicy = () => {
    setPolicyTitleDraft(policyTitle);
    setPolicyLinesDraft(policyLines.join('\n'));
    setEditPolicy(true);
  };
  const savePolicy = () => {
    const lines = policyLinesDraft
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setPolicyTitle(policyTitleDraft.trim() || policyTitle);
    setPolicyLines(lines.length ? lines : policyLines);
    setEditPolicy(false);
  };

  const addAnnouncement = () => {
    const id = uid('ann');
    setAnnouncements((p) => [{ id, text: 'New announcement...' }, ...p]);
    setEditingAnnId(id);
    setAnnDraft('New announcement...');
  };
  const startEditAnn = (ann: Announcement) => {
    setEditingAnnId(ann.id);
    setAnnDraft(ann.text);
  };
  const saveAnn = (id: string) => {
    setAnnouncements((p) => p.map((a) => (a.id === id ? { ...a, text: annDraft.trim() || a.text } : a)));
    setEditingAnnId(null);
    setAnnDraft('');
  };
  const deleteAnn = (id: string) => {
    setAnnouncements((p) => p.filter((a) => a.id !== id));
    if (editingAnnId === id) { setEditingAnnId(null); setAnnDraft(''); }
  };

  const addMetric = () => setMetrics((p) => [{ id: uid('m'), label: 'New Metric', value: '0', unit: '' }, ...p]);
  const updateMetric = (id: string, patch: Partial<SafetyMetric>) => setMetrics((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const deleteMetric = (id: string) => setMetrics((p) => p.filter((m) => m.id !== id));

  const onPosterSelected = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPolicyPoster(String(reader.result));
    reader.readAsDataURL(file);
  };

  const renderPanel = (panel: PanelKey) => {
    if (panel === 'slogan') {
      return (
        <Card title="Safety Slogan" icon={<Target className="h-5 w-5 text-sky-600" />} className="relative">
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {!editSlogan ? (
              <button onClick={startEditSlogan} className="p-2 rounded-lg hover:bg-slate-50" title="Edit">
                <Edit className="h-4 w-4 text-slate-600" />
              </button>
            ) : (
              <>
                <button onClick={saveSlogan} className="p-2 rounded-lg hover:bg-slate-50" title="Save">
                  <Save className="h-4 w-4 text-emerald-600" />
                </button>
                <button onClick={() => setEditSlogan(false)} className="p-2 rounded-lg hover:bg-slate-50" title="Cancel">
                  <X className="h-4 w-4 text-slate-600" />
                </button>
              </>
            )}
          </div>
          {!editSlogan ? (
            <div className="h-full flex flex-col justify-center gap-3">
              <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
                <div className="text-2xl font-extrabold text-slate-900 leading-tight">{sloganTh}</div>
                <div className="mt-2 text-lg font-semibold text-slate-600">{sloganEn}</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold text-emerald-700">SAFE</div>
                  <div className="mt-1 text-sm text-slate-700">Green</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800">NEAR MISS</div>
                  <div className="mt-1 text-sm text-slate-700">Yellow</div>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                  <div className="text-xs font-semibold text-rose-700">ACCIDENT</div>
                  <div className="mt-1 text-sm text-slate-700">Red</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Thai</label>
              <textarea value={sloganThDraft} onChange={(e)=>setSloganThDraft(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 bg-white" rows={2} />
              <label className="block text-sm font-semibold text-slate-700">English</label>
              <textarea value={sloganEnDraft} onChange={(e)=>setSloganEnDraft(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 bg-white" rows={2} />
            </div>
          )}
        </Card>
      );
    }

    if (panel === 'safetyData') {
      return (
        <Card title="Safety Data" icon={<Activity className="h-5 w-5 text-sky-600" />} className="relative">
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {!editMetrics ? (
              <button onClick={() => setEditMetrics(true)} className="p-2 rounded-lg hover:bg-slate-50" title="Edit">
                <Edit className="h-4 w-4 text-slate-600" />
              </button>
            ) : (
              <>
                <button onClick={addMetric} className="p-2 rounded-lg hover:bg-slate-50" title="Add Metric">
                  <Plus className="h-4 w-4 text-sky-700" />
                </button>
                <button onClick={() => setEditMetrics(false)} className="p-2 rounded-lg hover:bg-slate-50" title="Done">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </button>
              </>
            )}
          </div>
          {!editMetrics ? (
            <div className="grid grid-cols-3 gap-3 h-full">
              {metrics.slice(0, 12).map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 flex flex-col justify-between">
                  <div className="text-sm font-semibold text-slate-700 line-clamp-2">{m.label}</div>
                  <div className="mt-2 flex items-end gap-2">
                    <div className="text-4xl font-extrabold text-slate-900 leading-none">{m.value}</div>
                    <div className="text-base font-semibold text-slate-500 pb-1">{m.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 overflow-auto pr-2" style={{ maxHeight: '100%' }}>
              {metrics.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center gap-3">
                  <input value={m.label} onChange={(e)=>updateMetric(m.id, { label: e.target.value })} className="flex-1 rounded-xl border border-slate-200 px-3 py-2" placeholder="หัวข้อ" />
                  <input value={m.value} onChange={(e)=>updateMetric(m.id, { value: e.target.value })} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-right" placeholder="ค่า" />
                  <input value={m.unit || ''} onChange={(e)=>updateMetric(m.id, { unit: e.target.value })} className="w-20 rounded-xl border border-slate-200 px-3 py-2" placeholder="หน่วย" />
                  <button onClick={()=>deleteMetric(m.id)} className="p-2 rounded-xl hover:bg-rose-50" title="Delete">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    }

    if (panel === 'announcements') {
      return (
        <Card title="Announcements" icon={<Megaphone className="h-5 w-5 text-amber-600" />} className="relative">
          <div className="absolute right-3 top-3">
            <button onClick={addAnnouncement} className="p-2 rounded-lg hover:bg-amber-50" title="Add">
              <Plus className="h-4 w-4 text-amber-700" />
            </button>
          </div>
          <div className="h-full overflow-auto pr-2 space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-2xl border border-slate-100 bg-white p-3">
                {editingAnnId !== a.id ? (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-amber-400" />
                    <div className="flex-1 text-slate-800 font-medium">{a.text}</div>
                    <button onClick={()=>startEditAnn(a)} className="p-2 rounded-xl hover:bg-slate-50" title="Edit">
                      <Edit className="h-4 w-4 text-slate-600" />
                    </button>
                    <button onClick={()=>deleteAnn(a.id)} className="p-2 rounded-xl hover:bg-rose-50" title="Delete">
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea value={annDraft} onChange={(e)=>setAnnDraft(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3" rows={2} />
                    <div className="flex justify-end gap-2">
                      <button onClick={()=>saveAnn(a.id)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700">Save</button>
                      <button onClick={()=>{ setEditingAnnId(null); setAnnDraft(''); }} className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      );
    }

    if (panel === 'calendar') {
      return (
        <Card title="Safety Calendar" icon={<CalendarIcon className="h-5 w-5 text-sky-600" />}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50" onClick={() => setDisplayMonth((m) => (m + 11) % 12)} title="Prev">‹</button>
              <div className="text-lg font-extrabold text-slate-900">{MONTHS[displayMonth]} {currentYear}</div>
              <button className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50" onClick={() => setDisplayMonth((m) => (m + 1) % 12)} title="Next">›</button>
            </div>
            <div className="text-sm text-slate-500 font-semibold">{currentTime.toLocaleTimeString()}</div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-xs font-bold text-slate-500 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {gridCells.map((c, idx) => {
              if (!c.day) return <div key={idx} className="rounded-xl bg-transparent" />;
              const st = displayMonthData?.days?.[c.day - 1]?.status ?? null;
              const base = 'rounded-xl border p-2 flex flex-col gap-2 min-h-[3.2rem]';
              const cls = st === 'safe' ? 'border-emerald-200 bg-emerald-50'
                : st === 'near_miss' ? 'border-amber-200 bg-amber-50'
                : st === 'accident' ? 'border-rose-200 bg-rose-50'
                : 'border-slate-200 bg-white';
              return (
                <div key={idx} className={`${base} ${cls}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-extrabold text-slate-900">{c.day}</div>
                    {st === 'safe' && <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
                    {st === 'near_miss' && <AlertTriangle className="h-4 w-4 text-amber-700" />}
                    {st === 'accident' && <AlertTriangle className="h-4 w-4 text-rose-700" />}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button onClick={() => setDayStatus(c.day!, 'safe')} className="rounded-lg bg-emerald-600/10 text-emerald-800 text-[10px] font-bold py-1 hover:bg-emerald-600/15">SAFE</button>
                    <button onClick={() => setDayStatus(c.day!, 'near_miss')} className="rounded-lg bg-amber-600/10 text-amber-900 text-[10px] font-bold py-1 hover:bg-amber-600/15">NEAR</button>
                    <button onClick={() => setDayStatus(c.day!, 'accident')} className="rounded-lg bg-rose-600/10 text-rose-800 text-[10px] font-bold py-1 hover:bg-rose-600/15">ACC</button>
                  </div>
                  <button onClick={() => setDayStatus(c.day!, null)} className="rounded-lg border border-slate-200 text-[10px] font-bold py-1 hover:bg-slate-50">CLEAR</button>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
              <div className="text-xs font-bold text-emerald-700">SAFE</div>
              <div className="text-2xl font-extrabold text-slate-900">{monthSummary.safe}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
              <div className="text-xs font-bold text-amber-800">NEAR MISS</div>
              <div className="text-2xl font-extrabold text-slate-900">{monthSummary.near}</div>
            </div>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-3">
              <div className="text-xs font-bold text-rose-700">ACCIDENT</div>
              <div className="text-2xl font-extrabold text-slate-900">{monthSummary.accident}</div>
            </div>
          </div>
        </Card>
      );
    }

    if (panel === 'streak') {
      return (
        <Card title="Safety Streak" icon={<Flame className="h-5 w-5 text-emerald-700" />}>
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-sm font-bold text-slate-600">Consecutive Safe Days</div>
            <div className="mt-2 text-7xl font-extrabold text-emerald-700 leading-none">{safetyStreak}</div>
            <div className="mt-2 text-base font-semibold text-slate-700">days</div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-sky-50 border border-sky-100 px-4 py-2">
              <Shield className="h-4 w-4 text-sky-700" />
              <span className="text-sm font-bold text-slate-700">Zero Accident Workplace</span>
            </div>
          </div>
        </Card>
      );
    }

    if (panel === 'policy') {
      return (
        <Card title={policyTitle} icon={<Shield className="h-5 w-5 text-sky-700" />} className="relative">
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {!editPolicy ? (
              <button onClick={startEditPolicy} className="p-2 rounded-lg hover:bg-slate-50" title="Edit">
                <Edit className="h-4 w-4 text-slate-600" />
              </button>
            ) : (
              <>
                <button onClick={savePolicy} className="p-2 rounded-lg hover:bg-slate-50" title="Save">
                  <Save className="h-4 w-4 text-emerald-600" />
                </button>
                <button onClick={() => setEditPolicy(false)} className="p-2 rounded-lg hover:bg-slate-50" title="Cancel">
                  <X className="h-4 w-4 text-slate-600" />
                </button>
              </>
            )}
          </div>
          {!editPolicy ? (
            <ul className="space-y-2">
              {policyLines.map((l, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
                  <div className="text-slate-800 font-medium leading-relaxed">{l}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Title</label>
              <input value={policyTitleDraft} onChange={(e)=>setPolicyTitleDraft(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <label className="block text-sm font-semibold text-slate-700">Lines (one per line)</label>
              <textarea value={policyLinesDraft} onChange={(e)=>setPolicyLinesDraft(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3" rows={6} />
            </div>
          )}
        </Card>
      );
    }

    return (
      <Card title="Company Policy Poster" icon={<ImageIcon className="h-5 w-5 text-amber-700" />} className="relative">
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPosterSelected(e.target.files?.[0])} />
          <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-amber-50" title="Upload">
            <Upload className="h-4 w-4 text-amber-700" />
          </button>
          {policyPoster && (
            <button onClick={() => setPolicyPoster(null)} className="p-2 rounded-lg hover:bg-rose-50" title="Remove">
              <Trash2 className="h-4 w-4 text-rose-600" />
            </button>
          )}
        </div>
        {!policyPoster ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6">
            <Upload className="h-8 w-8 text-slate-500" />
            <div className="font-bold text-slate-700">Upload Poster (Vertical)</div>
            <div className="text-sm text-slate-500">แนะนำอัตราส่วน 3:4 หรือ A4 แนวตั้ง</div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="w-full h-full max-h-[72vh] rounded-2xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
              <img src={policyPoster} alt="Policy Poster" className="h-full w-auto object-contain" />
            </div>
          </div>
        )}
      </Card>
    );
  };

  const Slot = ({ slot }: { slot: SlotKey }) => {
    const panel = slots[slot];
    const [{ isDragging }, drag] = useDrag(() => ({
      type: DND_TYPE,
      item: { fromSlot: slot },
      canDrag: !layoutLocked,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }), [slot, layoutLocked]);

    return (
      <DroppableSlot slot={slot} locked={layoutLocked} onSwap={swapSlots}>
        <div className={isDragging ? 'opacity-60' : ''}>
          <div className="relative">
            {!layoutLocked && (
              <button
                ref={drag as any}
                className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/80 backdrop-blur px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-white"
                title="ลากเพื่อย้ายตำแหน่ง"
              >
                <Unlock className="h-3.5 w-3.5" />
                MOVE
              </button>
            )}
            {renderPanel(panel)}
          </div>
        </div>
      </DroppableSlot>
    );
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 text-slate-900" style={{ fontSize: 'var(--font-size)' }}>
        <header className="px-6 py-5 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-sm">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <div className="text-2xl font-extrabold">Safety Dashboard</div>
              <div className="text-sm text-slate-500 font-semibold">Light Safety Theme • Drag & Resize</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setLayoutLocked((v) => !v)}
              className={`px-4 py-2 rounded-2xl border font-extrabold flex items-center gap-2 ${layoutLocked ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-sky-200 bg-sky-50 hover:bg-sky-100'}`}
              title={layoutLocked ? 'Unlock layout to move panels' : 'Lock layout'}
            >
              {layoutLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {layoutLocked ? 'LOCKED' : 'UNLOCKED'}
            </button>
            <button onClick={resetLayout} className="px-4 py-2 rounded-2xl border border-slate-200 bg-white font-extrabold hover:bg-slate-50" title="Reset layout">
              Reset Layout
            </button>
          </div>
        </header>

        <main className="px-6 pb-6">
          <div className="flex w-full gap-2" style={{ height: 'calc(100vh - 110px)' }}>
            <div className="flex flex-col gap-2" style={{ width: `${layout.cols[0]}%` }}>
              <div style={{ height: `${layout.leftRows[0]}%` }} className="min-h-0"><Slot slot="leftTop" /></div>
              <Splitter orientation="horizontal" onMouseDown={onResizeLeft(0)} />
              <div style={{ height: `${layout.leftRows[1]}%` }} className="min-h-0"><Slot slot="leftMid" /></div>
              <Splitter orientation="horizontal" onMouseDown={onResizeLeft(1)} />
              <div style={{ height: `${layout.leftRows[2]}%` }} className="min-h-0"><Slot slot="leftBottom" /></div>
            </div>

            <Splitter orientation="vertical" onMouseDown={onResizeCols(0)} />

            <div className="flex flex-col gap-2" style={{ width: `${layout.cols[1]}%` }}>
              <div style={{ height: `${layout.centerRows[0]}%` }} className="min-h-0"><Slot slot="centerTop" /></div>
              <Splitter orientation="horizontal" onMouseDown={onResizeCenter(0)} />
              <div style={{ height: `${layout.centerRows[1]}%` }} className="min-h-0"><Slot slot="centerBottom" /></div>
            </div>

            <Splitter orientation="vertical" onMouseDown={onResizeCols(1)} />

            <div className="flex flex-col gap-2" style={{ width: `${layout.cols[2]}%` }}>
              <div style={{ height: `${layout.rightRows[0]}%` }} className="min-h-0"><Slot slot="rightTop" /></div>
              <Splitter orientation="horizontal" onMouseDown={onResizeRight(0)} />
              <div style={{ height: `${layout.rightRows[1]}%` }} className="min-h-0"><Slot slot="rightBottom" /></div>
            </div>
          </div>
        </main>
      </div>
    </DndProvider>
  );
}
