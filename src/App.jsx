import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── LocalStorage helper ──────────────────────────────────────────────────
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} },
};

// ─── Supabase config (set via environment or directly here) ────────────
const SB_URL = import.meta.env.VITE_SUPABASE_URL || window.SUPABASE_URL || "";
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || "";
const CLOUD_ENABLED = !!(SB_URL && SB_KEY);
console.log("CLOUD_ENABLED:", CLOUD_ENABLED, "URL:", SB_URL ? "SET" : "MISSING", "KEY:", SB_KEY ? "SET" : "MISSING");
const SB_HEADERS = { "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY, "Prefer":"return=representation" };
const sbFetch = async (path, opts={}) => {
  if (!SB_URL || !SB_KEY) { console.warn("Supabase not configured"); return []; }
  try {
    console.log("sbFetch:", path, opts.method||"GET");
    const res = await fetch(SB_URL+"/rest/v1/"+path, { headers:{...SB_HEADERS,...(opts.headers||{})}, ...opts });
    if (!res.ok) { const err = await res.text(); console.error("Supabase error:", err); return []; }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch(e) { console.error("sbFetch error:", e); return []; }
};
const sbUpsert = (table, row) => sbFetch(table, { method:"POST", headers:{"Content-Type":"application/json","apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Prefer":"resolution=merge-duplicates,return=representation"}, body:JSON.stringify(row) });
const sbDelete = (table, id) => sbFetch(table+"?id=eq."+id, { method:"DELETE" });
const sbPatch  = (table, filter, row) => sbFetch(table+"?"+filter, { method:"PATCH", body:JSON.stringify(row) });


// ─── Utilities ────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); };
const fmtFull = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString([], {month:"short",day:"numeric"}) + " " + d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); };
const initials = (name) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
const timeAgo = (iso) => { if (!iso) return ""; const s = Math.floor((Date.now()-new Date(iso))/1000); if(s<60) return "just now"; if(s<3600) return Math.floor(s/60)+"m ago"; if(s<86400) return Math.floor(s/3600)+"h ago"; return Math.floor(s/86400)+"d ago"; };
const todayIdx = () => new Date().getDay();
const daysOverdue = (d) => { if(!d) return 0; const due=new Date(d); const now=new Date(); due.setHours(0,0,0,0); now.setHours(0,0,0,0); return Math.max(0,Math.round((now-due)/86400000)); };

const PRIORITIES = [
  { key:"high",   label:"High",   color:"#DC2626", bg:"#FEE2E2", order:0 },
  { key:"medium", label:"Medium", color:"#D97706", bg:"#FEF3C7", order:1 },
  { key:"low",    label:"Low",    color:"#16A34A", bg:"#DCFCE7", order:2 },
  { key:"none",   label:"None",   color:"#aaa",    bg:"#f5f5f5", order:3 },
];
const getPriority = (k) => PRIORITIES.find(p => p.key === k) || PRIORITIES[3];

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const COLORS = ["#0D2240","#C41230","#0891B2","#059669","#7C3AED","#D97706","#DB2777","#374151"];
const POSITIONS = ["Worker","Lead","Supervisor","Trainer","Part-time"];

// ─── Seed data ────────────────────────────────────────────────────────────
const SEED_WORKERS = [
  { id:"w1", name:"Alex R.",   role:"worker", position:"Worker", avatar:"AR", pin:"1111" },
  { id:"w2", name:"Jordan M.", role:"worker", position:"Lead",   avatar:"JM", pin:"2222" },
  { id:"w3", name:"Casey T.",  role:"worker", position:"Worker", avatar:"CT", pin:"3333" },
  { id:"w4", name:"Sam K.",    role:"worker", position:"Worker", avatar:"SK", pin:"4444" },
];
const MANAGER = { id:"mgr", name:"Manager", role:"manager", avatar:"M", pin:"0000" };

const mkTask = (text, priority="none") => ({ id:uid(), text, priority, taskAssignees:[], scheduleMode:"always", days:[], startDate:null, doneBy:null, doneAt:null, note:null, noteBy:null, noteAt:null, originalDueDate:null });

const SEED_LISTS = [
  { id:"l1", title:"Morning Opening",     assignedTo:["w1","w2"], dueTime:"07:00 AM", color:COLORS[0], isRollover:false, createdBy:"mgr",
    tasks:[mkTask("Unlock facility and disable alarm"),mkTask("Check temperature logs for cold storage","high"),mkTask("Inspect receiving dock for overnight deliveries"),mkTask("Power on workstations and scanners"),mkTask("Brief team on daily priorities","medium")] },
  { id:"l2", title:"Inventory Cycle Count", assignedTo:["w2","w3"], dueTime:"12:00 PM", color:COLORS[2], isRollover:false, createdBy:"mgr",
    tasks:[mkTask("Pull cycle count report from WMS","high"),mkTask("Count Zone A shelving units"),mkTask("Count Zone B shelving units"),mkTask("Reconcile variances over 2%","medium"),mkTask("Submit count sheet to supervisor")] },
  { id:"l3", title:"Shipping Closeout",    assignedTo:["w1","w4"], dueTime:"04:00 PM", color:COLORS[1], isRollover:false, createdBy:"mgr",
    tasks:[mkTask("Verify all outbound orders scanned","high"),mkTask("Seal and label final pallets"),mkTask("Submit BOL to carrier","medium"),mkTask("Clear shipping dock"),mkTask("Log daily outbound totals")] },
  { id:"l4", title:"End of Day Closeout",  assignedTo:["w1","w2","w3","w4"], dueTime:"06:00 PM", color:COLORS[3], isRollover:false, createdBy:"mgr",
    tasks:[mkTask("Complete all pending put-aways","high"),mkTask("Sweep and clear all aisles"),mkTask("Secure hazmat storage area","high"),mkTask("Shut down non-essential equipment"),mkTask("Set overnight alarm")] },
];

// ─── Migration ────────────────────────────────────────────────────────────
try {
  const raw = localStorage.getItem("wh_lists");
  if (raw) {
    const parsed = JSON.parse(raw);
    const migrated = parsed.map(l => ({
      ...l,
      tasks: l.tasks.map(t => ({
        ...t,
        priority:      t.priority      ?? "none",
        taskAssignees: t.taskAssignees ?? [],
        originalDueDate: t.originalDueDate ?? null,
        scheduleMode:  t.scheduleMode  ?? "always",
        days:          t.days          ?? [],
        startDate:     t.startDate     ?? null,
        note:          t.note          ?? null,
        noteBy:        t.noteBy        ?? null,
        noteAt:        t.noteAt        ?? null,
      }))
    }));
    localStorage.setItem("wh_lists", JSON.stringify(migrated));
  }
} catch(e) { console.warn("Migration error:", e); }
// ─── Responsive CSS ───────────────────────────────────────────────────────
const responsiveCSS = [
  "* { box-sizing: border-box; }",
  "html, body { margin: 0; padding: 0; }",
  "@media (max-width: 500px) {",
  "  .rsp-shell { background: #081729; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; }",
  "  .rsp-phone { width: 100% !important; min-height: 100vh !important; border-radius: 0 !important; box-shadow: none !important; }",
  "}",
  "@media (min-width: 501px) and (max-width: 1024px) {",
  "  .rsp-shell { background: #081729; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 0; }",
  "  .rsp-phone { width: 100% !important; min-height: 100vh !important; border-radius: 0 !important; box-shadow: none !important; }",
  "  .rsp-grid-2 { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; }",
  "  .rsp-grid-3 { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 10px !important; }",
  "}",
  "@media (min-width: 1025px) {",
  "  .rsp-shell { background: #081729; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 32px; gap: 24px; }",
  "  .rsp-phone { width: 520px !important; min-height: calc(100vh - 64px) !important; border-radius: 24px !important; flex-shrink: 0; }",
  "  .rsp-grid-2 { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px !important; }",
  "  .rsp-grid-3 { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 12px !important; }",
  "  .rsp-login-grid { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 12px !important; }",
  "  .rsp-card-scroll { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; align-content: start; }",
  "}",
  "button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }",
  "input, textarea, select { font-size: 16px !important; }",
  "textarea { font-size: 14px !important; }",
  "::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }",
].join("\n");

export default function App() {
  // ── State ────────────────────────────────────────────────────────────────
  const [workers,      setWorkers]      = useState(() => CLOUD_ENABLED ? [] : LS.get("wh_workers", SEED_WORKERS));
  const [lists,        setLists]        = useState(() => CLOUD_ENABLED ? [] : LS.get("wh_lists", SEED_LISTS));
  const [currentUser,  setCurrentUser]  = useState(() => LS.get("wh_user", null));
  const [view,         setView]         = useState("login");
  const [activeListId, setActiveListId] = useState(null);
  const [activityLog,  setActivityLog]  = useState(() => CLOUD_ENABLED ? [] : LS.get("wh_activity", []));
  const [notifMap,     setNotifMap]     = useState(() => CLOUD_ENABLED ? {} : LS.get("wh_notifs", {}));
  const [notifOpen,    setNotifOpen]    = useState(false);
  const notifRef = useRef(null);

  // Login / PIN state
  const [pinTarget,    setPinTarget]    = useState(null);
  const [pinEntry,     setPinEntry]     = useState("");
  const [pinError,     setPinError]     = useState(false);

  // New list form
  const [newListTitle,    setNewListTitle]    = useState("");
  const [newListDue,      setNewListDue]      = useState("");
  const [newListColor,    setNewListColor]    = useState(COLORS[0]);
  const [newListScheduleMode, setNewListScheduleMode] = useState("always");
  const [newListDays,     setNewListDays]     = useState([]);
  const [newListStartDate,setNewListStartDate]= useState("");
  const [newListAssigned, setNewListAssigned] = useState([]);
  const [newTaskBuf,      setNewTaskBuf]      = useState([]);
  const [newTaskText,     setNewTaskText]     = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("none");
  const [newTaskScheduleMode, setNewTaskScheduleMode] = useState("always");
  const [newTaskDays,     setNewTaskDays]     = useState([]);
  const [newTaskStartDate,setNewTaskStartDate]= useState("");

  // Admin / edit state
  const [adminTab,        setAdminTab]        = useState("lists");
  const [newWorkerName,   setNewWorkerName]   = useState("");
  const [newWorkerPosition,setNewWorkerPosition]=useState("Worker");
  const [editingListId,   setEditingListId]   = useState(null);
  const [editTitle,       setEditTitle]       = useState("");
  const [editDue,         setEditDue]         = useState("");
  const [editColor,       setEditColor]       = useState(COLORS[0]);
  const [editAssigned,    setEditAssigned]    = useState([]);
  const [editTasks,       setEditTasks]       = useState([]);
  const [editTaskText,    setEditTaskText]    = useState("");
  const [editTaskPriority,setEditTaskPriority]= useState("none");
  const [editTaskScheduleMode,setEditTaskScheduleMode]=useState("always");
  const [editTaskDays,    setEditTaskDays]    = useState([]);
  const [editTaskStartDate,setEditTaskStartDate]=useState("");

  // Inline task add
  const [inlineTask,    setInlineTask]    = useState("");
  const [addingTaskTo,  setAddingTaskTo]  = useState(null);

  // Task interaction
  const [editingNoteFor, setEditingNoteFor] = useState(null);
  const [noteText,       setNoteText]       = useState("");
  const [assigningTaskId,setAssigningTaskId]= useState(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);

  // Dashboard filter / report tab
  const [dashFilter,  setDashFilter]  = useState("attention");
  const [reportTab,   setReportTab]   = useState("overview");

  // Confetti (top-level - Rules of Hooks)
  const [confettiActive, setConfettiActive] = useState(false);
  const prevPctRef = useRef(0);

  const [loading, setLoading] = useState(false);

  // ── Load from Supabase on mount ────────────────────────────────────────
  useEffect(() => {
    if (!CLOUD_ENABLED) return; // no config, stay with localStorage
    setLoading(true);
    Promise.all([
      sbFetch("workers?order=created_at.asc"),
      sbFetch("lists?order=created_at.desc"),
      sbFetch("tasks?order=created_at.asc"),
      sbFetch("activity?order=created_at.desc&limit=200"),
      sbFetch("notifications?order=created_at.desc&limit=100"),
    ]).then(([dbWorkers, dbLists, dbTasks, dbActivity, dbNotifs]) => {
      // Map DB rows to app format
      if (dbWorkers.length > 0) {
        const w = dbWorkers.map(w => ({ id:w.id, name:w.name, role:w.role, position:w.position, avatar:w.avatar, pin:w.pin }));
        setWorkers(w);
        LS.set("wh_workers", w);
      } else {
        // Supabase is empty - clear localStorage workers too
        setWorkers([]);
        LS.set("wh_workers", []);
      }
      if (dbLists.length > 0) {
        const listsWithTasks = dbLists.map(l => ({
          id:l.id, title:l.title, dueTime:l.due_time, color:l.color,
          isRollover:l.is_rollover, createdBy:l.created_by,
          assignedTo:l.assigned_to||[], scheduleMode:l.schedule_mode||"always",
          scheduleDays:l.schedule_days||[], scheduleDate:l.schedule_date||null,
          tasks: dbTasks.filter(t => t.list_id===l.id).map(t => ({
            id:t.id, text:t.text, priority:t.priority||"none",
            taskAssignees:t.task_assignees||[], scheduleMode:t.schedule_mode||"always",
            days:t.days||[], startDate:t.start_date||null,
            doneBy:t.done_by||null, doneAt:t.done_at||null,
            note:t.note||null, noteBy:t.note_by||null, noteAt:t.note_at||null,
            originalDueDate:t.original_due_date||null, _fromList:t.from_list||null,
          }))
        }));
        setLists(listsWithTasks);
        LS.set("wh_lists", listsWithTasks);
      } else {
        // Supabase lists empty - clear localStorage lists too
        setLists([]);
        LS.set("wh_lists", []);
      }
      if (dbActivity.length > 0) {
        const act = dbActivity.map(a => ({ id:a.id, msg:a.msg, userId:a.user_id, at:a.created_at }));
        setActivityLog(act);
      }
      if (dbNotifs.length > 0) {
        const nm = {};
        dbNotifs.forEach(n => {
          if (!nm[n.user_id]) nm[n.user_id] = [];
          nm[n.user_id].push({ id:n.id, title:n.title, body:n.body, listId:n.list_id, at:n.created_at, read:n.is_read });
        });
        setNotifMap(nm);
      }
      
    }).catch(e => { console.warn("Supabase load failed, using localStorage:", e); })
    .finally(() => setLoading(false));
  }, []);

  // ── Persist to localStorage only ─────────────────────────────────────────
  useEffect(() => { LS.set("wh_workers", workers); }, [workers]);
  useEffect(() => { LS.set("wh_lists", lists); }, [lists]);
  useEffect(() => { LS.set("wh_activity", activityLog); }, [activityLog]);
  useEffect(() => { LS.set("wh_notifs", notifMap); }, [notifMap]);
  useEffect(() => { if (currentUser) LS.set("wh_user", currentUser); else localStorage.removeItem("wh_user"); }, [currentUser]);

  // ── Confetti effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "detail" || !activeListId) return;
    const list = lists.find(l => l.id === activeListId);
    if (!list) return;
    const pct = progress(list);
    if (pct === 100 && prevPctRef.current < 100) {
      setConfettiActive(true);
      setTimeout(() => setConfettiActive(false), 3500);
    }
    prevPctRef.current = pct;
  }, [lists, activeListId, view]);

  // ── Close notif drawer on outside click ───────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Rollover at midnight ──────────────────────────────────────────────────
  useEffect(() => {
    const checkRollover = () => {
      const today = new Date().toDateString();
      const lastRollover = LS.get("wh_last_rollover", null);
      if (lastRollover === today) return;

      const storedLists = LS.get("wh_lists", []);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
      const yStr = yesterday.toISOString().slice(0,10);

      const workerIds = [...new Set(storedLists.flatMap(l => l.isRollover ? [] : l.assignedTo))];
      const workerTaskMap = {};
      workerIds.forEach(id => { workerTaskMap[id] = []; });

      storedLists.forEach(list => {
        if (list.isRollover) return;
        list.tasks.forEach(task => {
          if (task.doneBy) return;
          const taskOwners = (task.taskAssignees && task.taskAssignees.length > 0) ? task.taskAssignees : list.assignedTo;
          taskOwners.forEach(wId => {
            if (!workerTaskMap[wId]) return;
            workerTaskMap[wId].push({
              ...task,
              id: uid(),
              doneBy: null, doneAt: null,
              _fromList: list.title,
              originalDueDate: task.originalDueDate || yStr,
            });
          });
        });
      });

      const rolloverLists = workerIds.filter(id => workerTaskMap[id].length > 0).map(wId => {
        const w = [...SEED_WORKERS, ...LS.get("wh_workers",[])].find(x => x.id === wId);
        return {
          id: uid(), title: "Rollover - " + (w ? w.name : wId),
          assignedTo: [wId], dueTime: "11:59 PM", color: "#C41230",
          isRollover: true, createdBy: "mgr", tasks: workerTaskMap[wId],
        };
      });

      if (rolloverLists.length > 0) {
        const updatedLists = [...rolloverLists, ...storedLists];
        LS.set("wh_lists", updatedLists);
        setLists(updatedLists);

        const storedNotifs = LS.get("wh_notifs", {});
        const updatedNotifs = { ...storedNotifs };
        const n = { id:uid(), title:"Rollover Created", body:`${rolloverLists.length} rollover list(s) created for today.`, listId:null, at:new Date().toISOString(), read:false };
        ["mgr", ...workerIds.filter(id => workerTaskMap[id].length > 0)].forEach(uid2 => {
          updatedNotifs[uid2] = [n, ...(updatedNotifs[uid2]||[])].slice(0,50);
        });
        LS.set("wh_notifs", updatedNotifs);
        setNotifMap(updatedNotifs);
      }
      LS.set("wh_last_rollover", today);
    };

    // Recurring task reset
    const resetRecurring = () => {
      const today = new Date().toDateString();
      if (LS.get("wh_last_task_reset",null) === today) return;
      setLists(prev => prev.map(l => ({
        ...l, tasks: l.tasks.map(t => t.days && t.days.length > 0 && t.doneBy ? {...t, doneBy:null, doneAt:null} : t)
      })));
      LS.set("wh_last_task_reset", today);
    };

    checkRollover();
    resetRecurring();
    const iv = setInterval(() => { checkRollover(); resetRecurring(); }, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── High priority reminders ───────────────────────────────────────────────
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const hh = now.getHours(), mm = now.getMinutes();
      const todayKey = now.toDateString();
      const storedLists  = LS.get("wh_lists", []);
      const storedNotifs = LS.get("wh_notifs", {});
      const firedToday   = LS.get("wh_reminders_fired", {});
      let updated = false;
      const updatedNotifs = { ...storedNotifs };
      const updatedFired  = { ...firedToday };

      storedLists.forEach(list => {
        if (list.isRollover) return;
        const highTasks = list.tasks.filter(t => !t.doneBy && t.priority === "high");
        if (highTasks.length === 0) return;
        const recipients = [...list.assignedTo, "mgr"].filter((id,i,a) => a.indexOf(id)===i);

        // 1pm fixed reminder
        const fixedKey = "fixed_" + list.id + "_" + todayKey;
        if (hh === 13 && mm === 0 && !updatedFired[fixedKey]) {
          updatedFired[fixedKey] = true;
          const n = { id:uid(), title:"High Priority Reminder", body:highTasks.length + " high priority task(s) incomplete in " + list.title, listId:list.id, at:now.toISOString(), read:false };
          recipients.forEach(uid2 => { updatedNotifs[uid2] = [n,...(updatedNotifs[uid2]||[])].slice(0,50); });
          updated = true;
        }

        // 1hr before due
        if (!list.dueTime || list.dueTime === "-") return;
        const dm = list.dueTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!dm) return;
        let dh = parseInt(dm[1]);
        const dmin = parseInt(dm[2]);
        if (dm[3].toUpperCase()==="PM" && dh!==12) dh+=12;
        if (dm[3].toUpperCase()==="AM" && dh===12) dh=0;
        const dueMins = dh*60+dmin, nowMins = hh*60+mm;
        const warnKey = "warn_" + list.id + "_" + todayKey;
        if (nowMins === dueMins-60 && !updatedFired[warnKey]) {
          updatedFired[warnKey] = true;
          const n = { id:uid(), title:"Due in 1 Hour", body:list.title + " is due at " + list.dueTime + " with " + highTasks.length + " high priority task(s) incomplete.", listId:list.id, at:now.toISOString(), read:false };
          recipients.forEach(uid2 => { updatedNotifs[uid2] = [n,...(updatedNotifs[uid2]||[])].slice(0,50); });
          updated = true;
        }
      });

      if (updated) { LS.set("wh_notifs", updatedNotifs); setNotifMap(updatedNotifs); }
      const prunedFired = {};
      Object.keys(updatedFired).forEach(k => { if (k.includes(todayKey)) prunedFired[k] = updatedFired[k]; });
      LS.set("wh_reminders_fired", prunedFired);
    };

    checkReminders();
    const iv = setInterval(checkReminders, 60000);
    return () => clearInterval(iv);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const allUsers = [MANAGER, ...workers];
  const getList = (id) => lists.find(l => l.id === id);
  const getUser = (id) => { if (id === "mgr") return MANAGER; return workers.find(w => w.id === id); };
  const isManager = currentUser?.role === "manager" || currentUser?.position === "Lead";

  const progress = (list) => {
    const today = new Date();
    const todayTasks = list.tasks.filter(t => {
      if (t.scheduleMode === "oneTime") { if (!t.startDate) return false; const d = new Date(t.startDate+"T00:00:00"); d.setHours(0,0,0,0); today.setHours(0,0,0,0); return d.getTime() === today.getTime(); }
      if (t.scheduleMode === "recurring") { return t.days && t.days.includes(todayIdx()); }
      return true;
    });
    if (todayTasks.length === 0) return 100;
    return Math.round(todayTasks.filter(t => t.doneBy).length / todayTasks.length * 100);
  };

  const log = useCallback((msg, userId) => {
    const entry = { id:uid(), msg, userId, at:new Date().toISOString() };
    setActivityLog(prev => [entry, ...prev].slice(0,200));
    if (CLOUD_ENABLED) sbFetch("activity", { method:"POST", body:JSON.stringify({ id:entry.id, msg:entry.msg, user_id:entry.userId }) });
  }, []);

  const pushNotif = useCallback((userIds, title, body, listId=null) => {
    const n = { id:uid(), title, body, listId, at:new Date().toISOString(), read:false };
    setNotifMap(prev => {
      const next = { ...prev };
      userIds.forEach(uid2 => { next[uid2] = [n,...(next[uid2]||[])].slice(0,50); });
      return next;
    });
    if (CLOUD_ENABLED) userIds.forEach(uid2 => sbFetch("notifications", { method:"POST", body:JSON.stringify({ id:uid(), user_id:uid2, title, body, list_id:listId||null, is_read:false }) }));
  }, []);
  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = (user) => {
    setCurrentUser(user);
    setView("dashboard");
    log(user.name + " signed in", user.id);
  };

  const selectUser = (user) => {
    if (!user.pin) { handleLogin(user); return; }
    setPinTarget(user); setPinEntry(""); setPinError(false);
  };

  const submitPin = (pin) => {
    if (pin === pinTarget.pin) {
      setPinTarget(null); setPinEntry("");
      handleLogin(pinTarget);
    } else {
      setPinError(true); setPinEntry("");
      setTimeout(() => setPinError(false), 1000);
    }
  };

  const tapDigit = (d) => {
    const next = pinEntry + d;
    setPinEntry(next);
    if (next.length === 4) submitPin(next);
  };

  const handleLogout = () => {
    setCurrentUser(null); setView("login");
    setPinTarget(null); setPinEntry("");
  };

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const toggleTask = (listId, taskId) => {
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      const tasks = l.tasks.map(t => {
        if (t.id !== taskId) return t;
        const done = !t.doneBy;
        const doneAt = done ? new Date().toISOString() : null;
        if (CLOUD_ENABLED) sbUpsert("tasks", { id:t.id, list_id:listId, text:t.text, priority:t.priority||"none",
          task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always", days:t.days||[],
          done_by:done?currentUser.id:null, done_at:doneAt });
        if (done) {
          pushNotif(["mgr"], "Task Completed", currentUser.name + " completed: " + t.text, listId);
          log(currentUser.name + " completed: " + t.text, currentUser.id);
        }
        return { ...t, doneBy: done ? currentUser.id : null, doneAt };
      });
      return { ...l, tasks };
    }));
  };

  const deleteTask = (listId, taskId) => {
    setLists(prev => prev.map(l => l.id!==listId ? l : { ...l, tasks: l.tasks.filter(t => t.id!==taskId) }));
    if (CLOUD_ENABLED) sbDelete("tasks", taskId);
  };

  const setTaskPriority = (listId, taskId, priority) => {
    setLists(prev => prev.map(l => l.id!==listId ? l : { ...l, tasks: l.tasks.map(t => {
      if (t.id!==taskId) return t;
      if (CLOUD_ENABLED) sbUpsert("tasks", { id:t.id, list_id:listId, text:t.text, priority,
        task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always", days:t.days||[],
        done_by:t.doneBy||null, done_at:t.doneAt||null });
      return { ...t, priority };
    })}));
  };

  const toggleTaskAssignee = (listId, taskId, wId) => {
    setLists(prev => prev.map(l => {
      if (l.id!==listId) return l;
      return { ...l, tasks: l.tasks.map(t => {
        if (t.id!==taskId) return t;
        const cur = t.taskAssignees||[];
        const newAssignees = cur.includes(wId) ? cur.filter(x=>x!==wId) : [...cur,wId];
        if (CLOUD_ENABLED) sbUpsert("tasks", { id:t.id, list_id:listId, text:t.text, priority:t.priority||"none",
          task_assignees:newAssignees, schedule_mode:t.scheduleMode||"always", days:t.days||[],
          done_by:t.doneBy||null, done_at:t.doneAt||null });
        return { ...t, taskAssignees: newAssignees };
      })};
    }));
  };

  const saveNote = (listId, taskId) => {
    const trimmed = noteText.trim();
    const noteAt = trimmed ? new Date().toISOString() : null;
    setLists(prev => prev.map(l => {
      if (l.id!==listId) return l;
      return { ...l, tasks: l.tasks.map(t => {
        if (t.id!==taskId) return t;
        if (CLOUD_ENABLED) sbUpsert("tasks", { id:t.id, list_id:listId, text:t.text, priority:t.priority||"none",
          task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always", days:t.days||[],
          done_by:t.doneBy||null, done_at:t.doneAt||null,
          note:trimmed||null, note_by:trimmed?currentUser.id:null, note_at:noteAt });
        if (trimmed) pushNotif(["mgr"], "Note Added", currentUser.name + " added a note to: " + t.text, listId);
        return { ...t, note: trimmed||null, noteBy: trimmed?currentUser.id:null, noteAt };
      })};
    }));
    setEditingNoteFor(null); setNoteText("");
  };

  const addInlineTask = (listId) => {
    if (!inlineTask.trim()) return;
    const newTask = { id:uid(), text:inlineTask.trim(), priority:newTaskPriority, taskAssignees:[],
      scheduleMode:newTaskScheduleMode, days:newTaskScheduleMode==="recurring"?newTaskDays:[],
      startDate:newTaskScheduleMode==="oneTime"?newTaskStartDate:null,
      doneBy:null, doneAt:null, note:null, noteBy:null, noteAt:null, originalDueDate:null };
    setLists(prev => prev.map(l => l.id!==listId ? l : { ...l, tasks:[...l.tasks, newTask] }));
    if (CLOUD_ENABLED) sbUpsert("tasks", { id:newTask.id, list_id:listId, text:newTask.text,
      priority:newTask.priority||"none", task_assignees:[], schedule_mode:"always", days:[] });
    const list = getList(listId);
    if (list) pushNotif(list.assignedTo, "New Task Added", "\"" + newTask.text + "\" added to " + list.title, listId);
    setInlineTask(""); setNewTaskPriority("none"); setNewTaskScheduleMode("always"); setNewTaskDays([]); setNewTaskStartDate(""); setAddingTaskTo(null);
  };

  const resetList = (listId) => {
    setLists(prev => prev.map(l => {
      if (l.id!==listId) return l;
      const tasks = l.tasks.map(t => ({ ...t, doneBy:null, doneAt:null }));
      if (CLOUD_ENABLED) tasks.forEach(t => sbUpsert("tasks", { id:t.id, list_id:listId, text:t.text,
        priority:t.priority||"none", task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always",
        days:t.days||[], done_by:null, done_at:null }));
      return { ...l, tasks };
    }));
    const list = getList(listId);
    if (list) { pushNotif(list.assignedTo, "List Reset", "\"" + list.title + "\" was reset.", listId); log("Reset list: " + list.title, currentUser.id); }
  };

  // ── Lists ─────────────────────────────────────────────────────────────────
  const createList = async () => {
    if (!newListTitle.trim()) return;
    const newList = { id:uid(), title:newListTitle.trim(), assignedTo:newListAssigned,
      dueTime:newListDue||"-", color:newListColor, isRollover:false, createdBy:currentUser.id,
      scheduleMode:newListScheduleMode, scheduleDays:newListScheduleMode==="recurring"?newListDays:[],
      scheduleDate:newListScheduleMode==="oneTime"?newListStartDate:null,
      tasks: newTaskBuf.map(t => ({ id:uid(), text:t.text, priority:t.priority||"none", taskAssignees:[],
        scheduleMode:t.scheduleMode||"always", days:t.days||[], startDate:t.startDate||null,
        doneBy:null, doneAt:null, note:null, noteBy:null, noteAt:null, originalDueDate:null })) };
    setLists(prev => [newList, ...prev]);
    if (CLOUD_ENABLED) {
      const result = await sbUpsert("lists", { id:newList.id, title:newList.title, due_time:newList.dueTime, color:newList.color,
        is_rollover:false, created_by:newList.createdBy||null, assigned_to:newList.assignedTo||[],
        schedule_mode:newList.scheduleMode||"always", schedule_days:newList.scheduleDays||[], schedule_date:newList.scheduleDate||null });
      console.log("List saved to Supabase:", result);
      for (let i=0; i<newList.tasks.length; i++) {
        const t = newList.tasks[i];
        await sbUpsert("tasks", { id:t.id, list_id:newList.id, text:t.text,
          priority:t.priority||"none", task_assignees:[], schedule_mode:"always", days:[], sort_order:i });
      }
    }
    pushNotif(newListAssigned, "New List Assigned", "\"" + newList.title + "\" has been assigned to you.", newList.id);
    log("Created list: " + newList.title, currentUser.id);
    setNewListTitle(""); setNewListDue(""); setNewListColor(COLORS[0]); setNewListAssigned([]); setNewTaskBuf([]);
    setNewListScheduleMode("always"); setNewListDays([]); setNewListStartDate("");
  };

  const deleteList = (listId) => {
    setLists(prev => prev.filter(l => l.id!==listId));
    if (CLOUD_ENABLED) sbDelete("lists", listId);
    log("Deleted a list", currentUser.id);
  };

  const openEditList = (list) => {
    setEditingListId(list.id); setEditTitle(list.title);
    setEditDue(list.dueTime==="-"?"":list.dueTime); setEditColor(list.color);
    setEditAssigned(list.assignedTo); setEditTasks([...list.tasks]);
  };

  const saveEditList = () => {
    setLists(prev => prev.map(l => l.id!==editingListId ? l : {
      ...l, title:editTitle.trim()||l.title, dueTime:editDue.trim()||"-",
      color:editColor, assignedTo:editAssigned, tasks:editTasks,
    }));
    if (CLOUD_ENABLED) {
      const l = { id:editingListId, title:editTitle.trim(), due_time:editDue.trim()||"-",
        color:editColor, assigned_to:editAssigned };
      sbUpsert("lists", l);
      editTasks.forEach((t,i) => sbUpsert("tasks", { id:t.id, list_id:editingListId, text:t.text,
        priority:t.priority||"none", task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always",
        days:t.days||[], start_date:t.startDate||null, done_by:t.doneBy||null, done_at:t.doneAt||null,
        note:t.note||null, note_by:t.noteBy||null, note_at:t.noteAt||null, sort_order:i }));
    }
    setEditingListId(null);
  };

  const addEditTask = () => {
    if (!editTaskText.trim()) return;
    setEditTasks(prev => [...prev, { id:uid(), text:editTaskText.trim(), priority:editTaskPriority, taskAssignees:[],
      scheduleMode:editTaskScheduleMode, days:editTaskScheduleMode==="recurring"?editTaskDays:[],
      startDate:editTaskScheduleMode==="oneTime"?editTaskStartDate:null,
      doneBy:null, doneAt:null, note:null, noteBy:null, noteAt:null, originalDueDate:null }]);
    setEditTaskText(""); setEditTaskPriority("none"); setEditTaskScheduleMode("always"); setEditTaskDays([]); setEditTaskStartDate("");
  };

  // ── Workers ───────────────────────────────────────────────────────────────
  const addWorker = async () => {
    if (!newWorkerName.trim()) return;
    const w = { id:uid(), name:newWorkerName.trim(), role:"worker", position:newWorkerPosition, avatar:initials(newWorkerName.trim()), pin:"0000" };
    setWorkers(prev => [...prev, w]);
    if (CLOUD_ENABLED) {
      const result = await sbUpsert("workers", { id:w.id, name:w.name, role:w.role, position:w.position, avatar:w.avatar, pin:w.pin });
      console.log("Worker saved to Supabase:", result);
    }
    log("Added worker: " + w.name, currentUser.id);
    setNewWorkerName(""); setNewWorkerPosition("Worker");
  };

  const removeWorker = (wId) => {
    setWorkers(prev => prev.filter(w => w.id!==wId));
    if (CLOUD_ENABLED) sbDelete("workers", wId);
  };

  // ── Notifications ─────────────────────────────────────────────────────────
  const myNotifs = notifMap[currentUser?.id] || [];
  const unreadCount = myNotifs.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifMap(prev => ({ ...prev, [currentUser.id]: (prev[currentUser.id]||[]).map(n => ({ ...n, read:true })) }));
    if (CLOUD_ENABLED) sbPatch("notifications", "user_id=eq."+currentUser.id+"&is_read=eq.false", { is_read:true });
  };
  // ── LOGIN VIEW ────────────────────────────────────────────────────────────
  // Loading screen while fetching from Supabase
  if (loading) return (
    <Shell>
      <div style={{flex:1,background:"#0D2240",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"20px"}}>
        <div style={{width:"64px",height:"64px",background:"#C41230",borderRadius:"16px",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:"28px",fontWeight:900}}>A</div>
        <div style={{color:"#fff",fontSize:"16px",fontWeight:700}}>Loading...</div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:"13px"}}>Syncing with cloud</div>
      </div>
    </Shell>
  );

  if (view === "login" || !currentUser) {

    // PIN entry screen
    if (pinTarget) {
      const accentColor = pinTarget.role==="manager" ? "#C41230" : pinTarget.position==="Lead" ? "#9B0E25" : "#0D2240";
      const digits = ["1","2","3","4","5","6","7","8","9","","0","back"];
      return (
        <Shell>
          <div style={s.loginBg}>
            <div style={s.loginLogo}>
              <img src="data:image/png;base64,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AAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAMYEAiAAACAASURBVAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEju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AAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAgDdG8AAAIABJREFUAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAsWvHAgAAAACD/K2nsaM4AgAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAAKhdOyYAAABAGGT/1NbYATnIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAJuDSMAAAHqElEQVQAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAABo2Hb7Ig9End1H4wAAAABJRU5ErkJggg==" style={{width:"80px",height:"80px",objectFit:"contain",marginBottom:"8px"}} alt="AMBAC" />
              <div style={{...s.logoText, marginTop:"0"}}>AMBAC</div>
              <div style={{...s.logoDept, color:"#C41230"}}>MATERIALS</div>
              <div style={s.logoSub}>Task Manager</div>
            </div>
            <div style={s.loginCard}>
              <button onClick={() => { setPinTarget(null); setPinEntry(""); }} style={s.pinBackBtn}>Back</button>
              <div style={{textAlign:"center",marginBottom:"20px"}}>
                <div style={{...s.loginAvatar, background:accentColor, margin:"0 auto 10px", width:"52px",height:"52px",fontSize:"18px"}}>{pinTarget.avatar}</div>
                <div style={s.loginName}>{pinTarget.name}</div>
                <div style={s.loginRole}>Enter your 4-digit PIN</div>
              </div>
              <div style={s.pinDots}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{...s.pinDot, background: pinError?"#EF4444":pinEntry.length>i?accentColor:"#e0e0e0", transition:"all 0.15s"}} />
                ))}
              </div>
              {pinError && <div style={s.pinErrorMsg}>Incorrect PIN. Try again.</div>}
              <div style={s.pinPad}>
                {digits.map((d,i) => (
                  d==="" ? <div key={i} /> :
                  <button key={i} onClick={() => {
                    if (d==="back") { setPinEntry(p => p.slice(0,-1)); }
                    else if (pinEntry.length < 4) { tapDigit(d); }
                  }} style={{...s.pinKey, background:d==="back"?"#f0f0f0":"#fff", color:d==="back"?"#888":"#111"}}>
                    {d==="back" ? "<" : d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Shell>
      );
    }

    // User select screen
    return (
      <Shell>
        <div style={s.loginBg}>
          <div style={s.loginLogo}>
            <div style={s.logoBox}>A</div>
            <div style={s.logoText}>AMBAC</div>
            <div style={{...s.logoDept, color:"#C41230"}}>MATERIALS</div>
            <div style={s.logoSub}>Task Manager</div>
          </div>
          <div style={s.loginCard}>
            <div style={s.loginTitle}>Who are you?</div>
            <div style={s.loginGrid} className="rsp-login-grid">
              {[MANAGER, ...workers].map(user => {
                const notifs = notifMap[user.id]||[];
                const unread = notifs.filter(n => !n.read).length;
                const avatarBg = user.role==="manager" ? "#C41230" : user.position==="Lead" ? "#9B0E25" : "#0D2240";
                const borderColor = user.role==="manager" ? "#C41230" : user.position==="Lead" ? "#9B0E25" : "#e0e0e0";
                return (
                  <button key={user.id} onClick={() => selectUser(user)} style={{...s.loginUserBtn, borderColor}}>
                    <div style={{position:"relative"}}>
                      <div style={{...s.loginAvatar, background:avatarBg}}>{user.avatar||initials(user.name)}</div>
                      {unread > 0 && <div style={s.loginBadge}>{unread > 9 ? "9+" : unread}</div>}
                    </div>
                    <div style={s.loginName}>{user.name}</div>
                    <div style={s.loginRole}>{user.role==="manager" ? "Manager" : (user.position||"Worker")}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Shell>
    );
  }
  // ── DETAIL VIEW ───────────────────────────────────────────────────────────
  if (view === "detail") {
    const current = getList(activeListId);
    if (!current) { setView("dashboard"); return null; }

    const today = new Date();
    const visibleTasks = current.tasks.filter(t => {
      if (t.scheduleMode==="oneTime") { if(!t.startDate) return false; const d=new Date(t.startDate+"T00:00:00"); d.setHours(0,0,0,0); today.setHours(0,0,0,0); return d.getTime()===today.getTime(); }
      if (t.scheduleMode==="recurring") { return t.days && t.days.includes(todayIdx()); }
      return true;
    });
    const sortedTasks = [...visibleTasks].sort((a,b) => {
      const aD=!!a.doneBy, bD=!!b.doneBy;
      if (aD !== bD) return aD ? 1 : -1;
      return getPriority(a.priority||"none").order - getPriority(b.priority||"none").order;
    });
    const pct = progress(current);

    return (
      <Shell>
        {confettiActive && <Confetti color={current.color} />}
        <div style={{...s.detailHeader, background:current.color}}>
          <button onClick={() => setView("dashboard")} style={s.backBtn}>&#x2190; Back</button>
          <div style={s.detailTitleArea}>
            <div style={s.detailTitle}>{current.title}</div>
            <div style={s.detailMeta}>{current.dueTime !== "-" ? "Due " + current.dueTime : ""} {current.isRollover ? " - Rollover" : ""}</div>
          </div>
          {isManager && <button onClick={() => resetList(current.id)} style={s.resetBtn}>Reset</button>}
        </div>

        {/* Progress bar */}
        <div style={s.progressWrap}>
          <div style={s.progressTrack}>
            <div style={{...s.progressFill, width:pct+"%", background:current.color}} />
          </div>
          <span style={s.progressPct}>{pct}%</span>
        </div>

        {pct===100 && <div style={{...s.doneBanner, borderColor:current.color, color:current.color}}>All tasks complete!</div>}

        {/* Task list */}
        <div style={s.taskScroll}>
          {sortedTasks.map(task => {
            const checked = !!task.doneBy;
            const doneUser = task.doneBy ? getUser(task.doneBy) : null;
            const noteUser = task.noteBy ? getUser(task.noteBy) : null;
            const isEditingNote = editingNoteFor === task.id;
            const isAssigningThis = assigningTaskId === task.id;
            const p = getPriority(task.priority||"none");
            const taskAssignees = task.taskAssignees||[];
            const listWorkers = current.assignedTo.map(id => getUser(id)).filter(Boolean);
            const assigneeUsers = taskAssignees.map(id => getUser(id)).filter(Boolean);

            return (
              <div key={task.id} style={{...s.taskRowWrap, borderLeft:"5px solid "+(checked?"#e0e0e0":p.key==="none"?"#e0e0e0":p.color)}}>
                <button onClick={() => toggleTask(current.id, task.id)} style={{...s.taskRow, opacity:checked?0.5:1}}>
                  <div style={{...s.checkbox, background:checked?current.color:"transparent", borderColor:checked?current.color:"#ccc"}}>
                    {checked && <span style={s.checkmark}>✓</span>}
                  </div>
                  <div style={s.taskInfo}>
                    <div style={s.taskTopRow}>
                      <span style={{...s.taskText, textDecoration:checked?"line-through":"none"}}>{task.text}</span>
                      <span style={{...s.priorityPill, background:checked?"#f0f0f0":p.bg, color:checked?"#bbb":p.color}}>
                        {p.key==="none" ? "-" : p.label}
                      </span>
                    </div>
                    {task._fromList && (
                      <div style={s.fromListRow}>
                        <span style={s.fromListTag}>From: {task._fromList}</span>
                        {task.originalDueDate && daysOverdue(task.originalDueDate) > 0 && (
                          <span style={s.overdueBadge}>{daysOverdue(task.originalDueDate)} day{daysOverdue(task.originalDueDate)!==1?"s":""} overdue</span>
                        )}
                      </div>
                    )}
                    {assigneeUsers.length > 0 && (
                      <span style={s.taskAssigneeText}>{assigneeUsers.map(u=>u.name).join(", ")}</span>
                    )}
                    {doneUser && <span style={s.doneByTag}>Done by {doneUser.name} at {fmt(task.doneAt)}</span>}
                    {task.note && !isEditingNote && (
                      <div style={s.noteDisplay}>
                        <span style={s.noteText}>{task.note}</span>
                        {noteUser && <span style={s.noteBy}> - {noteUser.name}</span>}
                      </div>
                    )}
                  </div>
                </button>

                {/* Note editor - OUTSIDE the toggle button */}
                {isEditingNote && (
                  <div style={s.noteEditOuter} onClick={e => e.stopPropagation()}>
                    <textarea autoFocus value={noteText} onChange={e=>setNoteText(e.target.value)}
                      placeholder="Why was this not completed?" style={s.noteTextarea} rows={3} />
                    <div style={s.noteEditBtns}>
                      <button onClick={() => saveNote(current.id,task.id)} style={{...s.noteSaveBtn,background:current.color}}>Save</button>
                      {task.note && <button onClick={() => { setNoteText(""); saveNote(current.id,task.id); }} style={s.noteClearBtn}>Clear</button>}
                      <button onClick={() => { setEditingNoteFor(null); setNoteText(""); }} style={s.noteCancelBtn}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Task action buttons */}
                <div style={s.taskActions}>
                  {isManager && (
                    <button onClick={e => { e.stopPropagation(); const idx=PRIORITIES.findIndex(x=>x.key===(task.priority||"none")); setTaskPriority(current.id,task.id,PRIORITIES[(idx+1)%PRIORITIES.length].key); }}
                      style={{...s.priorityDropBtn, background:p.bg, color:p.color}}>
                      {p.key==="none"?"-":"●"}
                    </button>
                  )}
                  {isManager && listWorkers.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); setAssigningTaskId(isAssigningThis?null:task.id); }}
                      style={{...s.assignTaskBtn, background:taskAssignees.length>0?current.color:"#f0f0f0", color:taskAssignees.length>0?"#fff":"#888"}}>
                      A
                    </button>
                  )}
                  <button onClick={() => { setEditingNoteFor(isEditingNote?null:task.id); setNoteText(task.note||""); }}
                    style={{...s.noteBtn, color:task.note?"#C41230":"#ccc"}}>N</button>
                  {isManager && <button onClick={() => deleteTask(current.id,task.id)} style={s.taskDeleteBtn}>X</button>}
                </div>

                {/* Assignee picker */}
                {isAssigningThis && isManager && (
                  <div style={s.assignPickerWrap}>
                    <div style={s.assignPickerLabel}>ASSIGN TO</div>
                    <div style={s.assignPickerRow}>
                      {listWorkers.map(w => (
                        <button key={w.id} onClick={() => toggleTaskAssignee(current.id,task.id,w.id)}
                          style={{...s.assignPickerChip, background:taskAssignees.includes(w.id)?current.color:"#f0f0f0", color:taskAssignees.includes(w.id)?"#fff":"#555"}}>
                          {w.name.split(" ")[0]}
                        </button>
                      ))}
                      {taskAssignees.length > 0 && (
                        <button onClick={() => setLists(prev=>prev.map(l=>l.id!==current.id?l:{...l,tasks:l.tasks.map(t=>t.id!==task.id?t:{...t,taskAssignees:[]})}))}
                          style={{...s.assignPickerChip,background:"#f5f5f5",color:"#aaa"}}>All</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add inline task */}
          {isManager && (
            <div style={s.addTaskSection}>
              {addingTaskTo === current.id ? (
                <div style={s.addTaskForm}>
                  <input value={inlineTask} onChange={e=>setInlineTask(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&addInlineTask(current.id)}
                    placeholder="New task..." style={s.inlineInput} autoFocus />
                  <div style={s.addTaskFormRow}>
                    {PRIORITIES.filter(p=>p.key!=="none").map(p => (
                      <button key={p.key} onClick={()=>setNewTaskPriority(p.key)}
                        style={{...s.priorityChipBtn, background:newTaskPriority===p.key?p.bg:"#f0f0f0", color:newTaskPriority===p.key?p.color:"#888"}}>
                        {p.label}
                      </button>
                    ))}
                    <button onClick={() => addInlineTask(current.id)} style={{...s.inlineAddBtn, background:current.color}}>Add</button>
                    <button onClick={() => { setAddingTaskTo(null); setInlineTask(""); }} style={s.inlineCancelBtn}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingTaskTo(current.id)} style={{...s.addTaskBtn, color:current.color, borderColor:current.color}}>+ Add Task</button>
              )}
            </div>
          )}
        </div>
      </Shell>
    );
  }
  // ── NOTIFICATION DRAWER ──────────────────────────────────────────────────
  const NotifDrawer = () => (
    <div style={{position:"relative"}} ref={notifRef}>
      <button onClick={() => setNotifOpen(!notifOpen)} style={s.bellBtn}>
        <span style={s.bellIcon}>&#x1F514;</span>
        {unreadCount > 0 && <span style={s.bellBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {notifOpen && (
        <div style={s.notifDrawer}>
          <div style={s.notifHeader}>
            <span style={s.notifHeaderTitle}>Notifications</span>
            {unreadCount > 0 && <button onClick={markAllRead} style={s.markReadBtn}>Mark all read</button>}
          </div>
          <div style={s.notifList}>
            {myNotifs.length === 0 && <div style={s.notifEmpty}>All caught up!</div>}
            {myNotifs.map(n => {
              const list = n.listId ? getList(n.listId) : null;
              return (
                <button key={n.id} onClick={() => {
                  setNotifOpen(false);
                  if (list) { setActiveListId(list.id); setView("detail"); }
                  setNotifMap(prev => ({ ...prev, [currentUser.id]: (prev[currentUser.id]||[]).map(x => x.id===n.id ? {...x,read:true} : x) }));
                }} style={{...s.notifItem, background:n.read?"#fff":"#fff8f3"}}>
                  <div style={{...s.notifDot, background:list?.color||"#ccc", opacity:n.read?0.4:1}} />
                  <div style={s.notifBody}>
                    <div style={s.notifItemTitle}>{n.title}</div>
                    <div style={s.notifItemBody}>{n.body}</div>
                    <div style={s.notifTime}>{timeAgo(n.at)}{list ? " - Tap to view" : n.listId ? " - List removed" : ""}</div>
                  </div>
                  {!n.read && <div style={s.unreadDot} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ── DASHBOARD VIEW ────────────────────────────────────────────────────────
  const visibleLists = lists.filter(l => isManager || l.assignedTo.includes(currentUser?.id));
  const totalDone = visibleLists.filter(l => progress(l)===100).length;
  const totalInProgress = visibleLists.filter(l => { const p=progress(l); return p>0&&p<100; }).length;

  if (view === "dashboard") {
    const statButtons = [
      { key:"attention", label:"Needs Attention", val:visibleLists.filter(l=>progress(l)<100).length },
      { key:"done",      label:"Done",            val:totalDone },
      { key:"all",       label:"All",             val:visibleLists.length },
    ];

    return (
      <Shell>
        <div style={s.header} className="rsp-header-pad">
          <div style={s.headerTop}>
            <img src="data:image/png;base64,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AAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAMYEAiAAACAASURBVAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEjuAAAAAAAAAAAAAABsSO4AAAAAAAAAAAAAAGxI7gAAAAAAAAAAAAAAbEju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AAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAgDdG8AAAIABJREFUAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAAAAAAAAAABuSOwAAAAAAAAAAAAAAG5I7AAAAAAAAAAAAAAAbkjsAAAAAsWvHAgAAAACD/K2nsaM4AgAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAANiQ3AEAAAAAAAAAAAAA2JDcAQAAAAAAAAAAAADYkNwBAAAAAAAAAAAAAKhdOyYAAABAGGT/1NbYATnIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAJuDSMAAAHqElEQVQAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAADIkNwBAAAAAAAAAAAAAMiQ3AEAAAAAAAAAAAAAyJDcAQAAAAAAAAAAAABo2Hb7Ig9End1H4wAAAABJRU5ErkJggg==" style={{width:"32px",height:"32px",objectFit:"contain"}} alt="AMBAC" />
            <div style={s.headerTitleArea}>
              <div style={s.headerTitle}>{isManager ? "All Lists" : "Hi, " + currentUser.name.split(" ")[0]}</div>
              {!isManager && <div style={s.headerSub}>Your assigned tasks today</div>}
            </div>
            <div style={s.headerActions}>
              {CLOUD_ENABLED && <span style={s.cloudBadge} title="Synced to cloud">&#x2601;</span>}
              {isManager && (
                <>
                  <button onClick={() => setView("report")} style={s.iconBtn} title="Reports">&#x1F4CA;</button>
                  <button onClick={() => setView("activity")} style={s.iconBtn} title="Activity Log">&#x1F4CB;</button>
                  <button onClick={() => setView("admin")} style={s.iconBtn} title="Admin">&#x2699;&#xFE0F;</button>
                </>
              )}
              <NotifDrawer />
              <button onClick={handleLogout} style={s.avatarBtn}>
                <div style={{...s.avatarCircle, background:isManager?(currentUser?.role==="manager"?"#C41230":"#9B0E25"):"#0D2240"}}>
                  {currentUser.avatar||initials(currentUser.name)}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div style={s.statsStrip} className="rsp-grid-3">
          {statButtons.map(stat => (
            <button key={stat.key} onClick={() => setDashFilter(dashFilter===stat.key?"all":stat.key)}
              style={{...s.statBox,
                outline:dashFilter===stat.key?"2px solid #C41230":"none",
                outlineOffset:"2px",
                background:dashFilter===stat.key?"rgba(196,18,48,0.25)":"rgba(255,255,255,0.06)",
              }}>
              <div style={s.statVal}>{stat.val}</div>
              <div style={s.statLabel}>{stat.label}{dashFilter===stat.key?" X":""}</div>
            </button>
          ))}
        </div>

        {/* List cards */}
        <div style={s.cardScroll} className="rsp-card-scroll">
          {(() => {
            const now = new Date();
            const nowMins = now.getHours()*60 + now.getMinutes();

            // Parse due time to minutes for sorting/comparison
            const parseDueMins = (dueTime) => {
              if (!dueTime || dueTime==="-") return 9999;
              const m = dueTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
              if (!m) return 9999;
              let h = parseInt(m[1]);
              if (m[3].toUpperCase()==="PM" && h!==12) h+=12;
              if (m[3].toUpperCase()==="AM" && h===12) h=0;
              return h*60+parseInt(m[2]);
            };

            const filtered = visibleLists.filter(l => {
              const p = progress(l);
              if (dashFilter==="attention") return p < 100;
              if (dashFilter==="done")      return p === 100;
              return true;
            });

            // Sort: lists with High priority incomplete tasks first, then by due time
            const sorted = [...filtered].sort((a, b) => {
              const aHighCount = a.tasks.filter(t => !t.doneBy && t.priority==="high").length;
              const bHighCount = b.tasks.filter(t => !t.doneBy && t.priority==="high").length;
              if (aHighCount !== bHighCount) return bHighCount - aHighCount;
              const aMedCount = a.tasks.filter(t => !t.doneBy && t.priority==="medium").length;
              const bMedCount = b.tasks.filter(t => !t.doneBy && t.priority==="medium").length;
              if (aMedCount !== bMedCount) return bMedCount - aMedCount;
              return parseDueMins(a.dueTime) - parseDueMins(b.dueTime);
            });

            if (sorted.length === 0) return (
              <div style={s.emptyState}>
                {dashFilter!=="all" ? "No " + (dashFilter==="done"?"completed":"incomplete") + " lists."
                  : isManager ? "No lists yet. Tap S to create one." : "No lists assigned yet."}
              </div>
            );

            return sorted.map(list => {
              const pct = progress(list);
              const overdueCount = list.tasks.filter(t => t.originalDueDate && !t.doneBy && daysOverdue(t.originalDueDate)>0).length;
              const assignedWorkerNames = list.assignedTo.map(id => getUser(id)?.name?.split(" ")[0]).filter(Boolean);
              const highCount = list.tasks.filter(t => !t.doneBy && t.priority==="high").length;
              const dueMins = parseDueMins(list.dueTime);
              const minsUntilDue = dueMins - nowMins;
              const dueSoon = minsUntilDue > 0 && minsUntilDue <= 120 && pct < 100;
              // Overdue: due time passed AND today is a scheduled day for this list
              const isScheduledToday = !list.scheduleMode || list.scheduleMode === "always" ||
                (list.scheduleMode === "recurring" && list.scheduleDays && list.scheduleDays.includes(todayIdx())) ||
                (list.scheduleMode === "oneTime" && list.scheduleDate && new Date(list.scheduleDate+"T00:00:00").toDateString() === new Date().toDateString());
              const overdue = minsUntilDue < 0 && pct < 100 && !list.isRollover && isScheduledToday;

              // Urgency: red border = high priority tasks, amber = due soon, green = done
              const urgencyBorder = pct===100 ? "#16A34A" : highCount > 0 ? "#C41230" : dueSoon ? "#D97706" : list.color;

              return (
                <button key={list.id} onClick={() => { setActiveListId(list.id); setView("detail"); }}
                  style={{...s.card, boxShadow: highCount>0 ? "0 2px 12px rgba(196,18,48,0.18)" : "0 2px 8px rgba(0,0,0,0.06)"}}>
                  <div style={{...s.cardAccent, background:urgencyBorder}} />
                  <div style={s.cardBody}>
                    <div style={s.cardTitleRow}>
                      <div style={s.cardTitle}>{list.title}</div>
                      <div style={{display:"flex", gap:"4px", flexWrap:"wrap", justifyContent:"flex-end"}}>
                        {highCount > 0 && pct < 100 && (
                          <span style={s.highPriorityBadge}>{highCount} HIGH</span>
                        )}
                        {dueSoon && (
                          <span style={s.dueSoonBadge}>Due in {minsUntilDue<60?minsUntilDue+"m":Math.round(minsUntilDue/60)+"h"}</span>
                        )}
                        {overdue && !list.isRollover && (
                          <span style={s.overdueListBadge}>Overdue</span>
                        )}
                        {list.isRollover && (
                          <span style={s.rolloverBadge}>{overdueCount>0?overdueCount+"d overdue":"Rollover"}</span>
                        )}
                      </div>
                    </div>
                    <div style={s.cardMeta}>
                      {list.dueTime !== "-" && <span style={{...s.cardDue, color:dueSoon?"#D97706":overdue?"#C41230":"#888", fontWeight:dueSoon||overdue?700:400}}>{list.dueTime}</span>}
                      {list.scheduleMode==="recurring" && list.scheduleDays && list.scheduleDays.length>0 && (
                        <span style={s.cardScheduleTag}>{list.scheduleDays.map(i=>DAYS[i]).join(", ")}</span>
                      )}
                      {list.scheduleMode==="oneTime" && list.scheduleDate && (
                        <span style={s.cardScheduleTag}>{new Date(list.scheduleDate+"T00:00:00").toLocaleDateString([],{month:"short",day:"numeric"})}</span>
                      )}
                      {assignedWorkerNames.length > 0 && <span style={s.cardWorkers}>{assignedWorkerNames.join(", ")}</span>}
                    </div>
                    <div style={s.cardProgressBar}>
                      <div style={{...s.cardProgressFill, width:pct+"%", background:urgencyBorder}} />
                    </div>
                    <div style={s.cardBottom}>
                      <span style={s.cardPctText}>{list.tasks.filter(t=>t.doneBy).length}/{list.tasks.length} tasks</span>
                      <span style={{...s.cardPctNum, color:pct===100?"#16A34A":pct>50?"#D97706":"#C41230"}}>{pct}%</span>
                    </div>
                  </div>
                </button>
              );
            });
          })()}
        </div>
      </Shell>
    );
  }
  // ── REPORT VIEW ────────────────────────────────────────────────────────────
  if (view === "report") {
    const today2 = new Date(); today2.setHours(0,0,0,0);

    const workerReport = {};
    workers.forEach(w => { workerReport[w.id] = { worker:w, overdueTasks:[], completedToday:[], completedLate:[], totalAssigned:0 }; });

    // Build completed texts per worker for dedup
    const workerCompletedTexts = {};
    workers.forEach(w => { workerCompletedTexts[w.id] = []; });
    lists.forEach(list => {
      list.tasks.forEach(task => {
        if (task.doneBy && workerCompletedTexts[task.doneBy]) {
          workerCompletedTexts[task.doneBy].push(task.text.trim().toLowerCase().replace(/\s+/g," "));
        }
      });
    });

    lists.forEach(list => {
      list.tasks.forEach(task => {
        const owners = (task.taskAssignees&&task.taskAssignees.length>0) ? task.taskAssignees : list.assignedTo;
        owners.forEach(wId => {
          if (!workerReport[wId]) return;
          const r = workerReport[wId];
          r.totalAssigned++;
          if (task.originalDueDate && !task.doneBy) {
            const days = daysOverdue(task.originalDueDate);
            if (days > 0) {
              const norm = task.text.trim().toLowerCase().replace(/\s+/g," ");
              const finishedElsewhere = (workerCompletedTexts[wId]||[]).some(t => t===norm);
              const alreadyCounted = r.overdueTasks.some(o => o.task.text.trim().toLowerCase().replace(/\s+/g," ")===norm);
              if (!finishedElsewhere && !alreadyCounted) r.overdueTasks.push({ task, list, days });
            }
          }
          if (task.doneBy===wId && task.doneAt) {
            const doneD = new Date(task.doneAt); doneD.setHours(0,0,0,0);
            if (doneD.getTime()===today2.getTime()) r.completedToday.push({ task, list });
            if (task.originalDueDate) {
              const dueD = new Date(task.originalDueDate); dueD.setHours(0,0,0,0);
              if (doneD > dueD) r.completedLate.push({ task, list });
            }
          }
        });
      });
    });

    const totalOverdue        = Object.values(workerReport).reduce((s,r) => s+r.overdueTasks.length, 0);
    const totalCompletedToday = Object.values(workerReport).reduce((s,r) => s+r.completedToday.length, 0);
    const totalCompletedLate  = Object.values(workerReport).reduce((s,r) => s+r.completedLate.length, 0);
    const totalPending        = lists.flatMap(l => l.tasks.filter(t => !t.doneBy && !l.isRollover)).length;

    // Trend analysis
    const THEMES = [
      { key:"equipment", label:"Equipment / System Issue", color:"#EF4444",
        keywords:["system","locked","machine","equipment","broken","down","error","access","computer","device","forklift","scanner","printer","software","hardware","offline","frozen","crashed","malfunction","not working","wont work","out of order","dead","battery","charging","power","hydraulic","leak","flat tire","hydraulics","lift","pallet jack","conveyor","sensor","alarm","network","wifi","internet","login","password","glitch","reboot","restart","slow","lagging","connection","signal","radio","walkie","busted","acting up","keeps freezing","crapped out","needs repair","needs maintenance"] },
      { key:"time",      label:"Ran Out of Time",          color:"#F59E0B",
        keywords:["time","busy","rush","late","end of shift","ran out","no time","other tasks","overloaded","too much","couldnt get to","didnt finish","not enough time","short on time","swamped","overwhelmed","backed up","behind","fell behind","running behind","priority","urgent","pulled away","called away","tied up","couldnt finish","didnt have time","ran long","took longer","overtime","end of day","closing time","shift end","slipped my mind","kept getting interrupted","slammed","buried","no break","more pressing"] },
      { key:"waiting",   label:"Waiting on Someone/Part",  color:"#3B82F6",
        keywords:["waiting","wait","pending","order","delivery","shipment","approval","parts","part","supply","supplies","stock","inventory","out of stock","back order","backordered","vendor","supplier","distributor","purchase order","requisition","authorization","sign off","signature","manager approval","waiting on","waiting for","held up","need someone","another department","other team","maintenance","repair","technician","contractor","couldnt reach","no response","never got back","never came","still waiting","in transit","on the way"] },
      { key:"unclear",   label:"Task Unclear / No Info",   color:"#8B5CF6",
        keywords:["unclear","confused","not sure","no instructions","missing info","wrong","didnt know","dont know","unsure","uncertain","no guidance","no direction","no training","untrained","first time","never done","havent done","need help","need training","need more info","conflicting","different instructions","changed","updated","new process","new procedure","vague","not specified","no detail","incomplete","no one told","wasnt told","miscommunication","misunderstood","misunderstanding","outdated","lack of training","lack of proper training","improper training","not properly trained","never received training","didnt know how","unfamiliar","not familiar","wasnt aware","never been shown","nobody showed","didnt have the knowledge","no clue","no idea how","wasnt taught","was never taught","did not know","have not been trained"] },
      { key:"staffing",  label:"Understaffed / Absent",    color:"#EC4899",
        keywords:["short staffed","call out","absent","sick","no one","short handed","understaffed","alone","by myself","shorthanded","called out","no show","didnt show","left early","went home","injured","hurt","accident","workers comp","vacation","pto","personal day","jury duty","bereavement","family emergency","not enough people","need more people","one person","only one","working alone","solo","no backup","no help","just me","a man down","doing two jobs","high volume","skeleton crew"] },
      { key:"safety",    label:"Safety Concern",           color:"#C41230",
        keywords:["unsafe","hazard","danger","spill","blocked","injury","safety","risk","wet floor","wet","slippery","slip","trip","fall","fire","smoke","chemical","fumes","gas","osha","incident","accident","near miss","lockout","tagout","loto","ppe","protective equipment","hard hat","safety vest","forklift traffic","aisle blocked","emergency","evacuation","alarm","flooding","electrical","exposed wire","unstable","rack","overloaded","too heavy","didnt feel safe","too dangerous","almost slipped","almost fell","wrote it up","filled out a report"] },
      { key:"other",     label:"Other", color:"#6B7280", keywords:[] },
    ];

    const categorize = (note) => {
      if (!note) return "other";
      let lower = note.toLowerCase().replace(/[^a-z0-9 ]/g," ");
      for (const theme of THEMES.slice(0,-1)) {
        if (theme.keywords.some(kw => lower.includes(kw))) return theme.key;
      }
      return "other";
    };

    const allNotes = [];
    lists.forEach(list => {
      list.tasks.forEach(task => {
        if (task.note && task.note.trim()) {
          allNotes.push({ note:task.note.trim(), taskText:task.text, listTitle:list.title,
            noteBy:task.noteBy?getUser(task.noteBy):null, noteAt:task.noteAt });
        }
      });
    });
    const themeGroups = {};
    THEMES.forEach(t => { themeGroups[t.key] = []; });
    allNotes.forEach(n => { themeGroups[categorize(n.note)].push(n); });
    const totalNotes = allNotes.length;
    const workerNoteMap = {};
    workers.forEach(w => { workerNoteMap[w.id] = []; });
    allNotes.forEach(n => { if (n.noteBy && workerNoteMap[n.noteBy.id]) workerNoteMap[n.noteBy.id].push(n); });

    // Build report HTML for email/print
    const generateReport = () => {
      const dateStr = new Date().toLocaleDateString([],{weekday:"long",year:"numeric",month:"long",day:"numeric"});

      const workerRowsHtml = workers.map(w => {
        const r = workerReport[w.id];
        const overdueRows = r.overdueTasks.sort((a,b)=>b.days-a.days).map(({task,list,days}) =>
          "<tr><td style='padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;'>" + (task.text||"") + "</td>" +
          "<td style='padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;color:#666;'>" + (list?list.title:"") + "</td>" +
          "<td style='padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:700;color:#C41230;'>" + days + " day" + (days!==1?"s":"") + " overdue</td>" +
          "<td style='padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;color:#666;'>" + (task.priority||"none") + "</td></tr>"
        ).join("");
        return "<div style='margin-bottom:24px;'>" +
          "<div style='font-size:15px;font-weight:700;color:#111;margin-bottom:4px;'>" + w.name + " <span style=\"font-size:12px;color:#888;font-weight:400;\">(" + (w.position||"Worker") + ")</span></div>" +
          "<div style='font-size:12px;color:#888;margin-bottom:8px;'>" + r.overdueTasks.length + " overdue &nbsp; " + r.completedToday.length + " done today &nbsp; " + r.completedLate.length + " completed late</div>" +
          (r.overdueTasks.length > 0 ?
            "<table style='width:100%;border-collapse:collapse;'>" +
            "<thead><tr style='background:#f5f5f5;'><th style='padding:6px 10px;text-align:left;font-size:11px;color:#888;'>TASK</th><th style='padding:6px 10px;text-align:left;font-size:11px;color:#888;'>LIST</th><th style='padding:6px 10px;text-align:left;font-size:11px;color:#888;'>OVERDUE</th><th style='padding:6px 10px;text-align:left;font-size:11px;color:#888;'>PRIORITY</th></tr></thead>" +
            "<tbody>" + overdueRows + "</tbody></table>"
            : "<div style='font-size:13px;color:#16A34A;'>No overdue tasks</div>") +
          "</div>";
      }).join("<hr style='border:none;border-top:1px solid #eee;margin:16px 0;'/>");

      const listRowsHtml = lists.filter(l=>!l.isRollover).map(list => {
        const pct = progress(list);
        const od = list.tasks.filter(t=>t.originalDueDate&&!t.doneBy&&daysOverdue(t.originalDueDate)>0).length;
        return "<tr>" +
          "<td style='padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;'>" + list.title + "</td>" +
          "<td style='padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#888;'>" + list.dueTime + "</td>" +
          "<td style='padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;'>" + list.tasks.filter(t=>t.doneBy).length + "/" + list.tasks.length + "</td>" +
          "<td style='padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:700;color:" + (pct===100?"#16A34A":pct>50?"#D97706":"#C41230") + ";'>" + pct + "%</td>" +
          "<td style='padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:" + (od>0?"#C41230":"#aaa") + ";font-weight:" + (od>0?700:400) + ";'>" + (od>0?od+" overdue":"-") + "</td>" +
          "</tr>";
      }).join("");

      const html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>AMBAC Materials Report</title>" +
        "<style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:32px;max-width:900px;margin:0 auto;}" +
        ".header{background:#0D2240;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:24px;}" +
        ".header h1{color:#fff;margin:0;font-size:22px;}" +
        ".header p{margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;}" +
        ".stats{display:flex;gap:16px;margin-bottom:24px;}" +
        ".stat{flex:1;background:#f9f9f9;border-radius:8px;padding:14px;text-align:center;}" +
        ".stat-num{font-size:28px;font-weight:900;} .stat-lbl{font-size:11px;color:#888;margin-top:4px;font-weight:600;}" +
        "h2{color:#0D2240;font-size:16px;margin:24px 0 12px;border-bottom:2px solid #0D2240;padding-bottom:6px;}" +
        "@media print{body{padding:16px;}}</style></head><body>" +
        "<div class='header'><h1>AMBAC Materials Department - Task Report</h1><p>" + dateStr + "</p></div>" +
        "<div class='stats'>" +
        "<div class='stat'><div class='stat-num' style='color:#C41230;'>" + totalOverdue + "</div><div class='stat-lbl'>OVERDUE</div></div>" +
        "<div class='stat'><div class='stat-num' style='color:#D97706;'>" + totalPending + "</div><div class='stat-lbl'>PENDING</div></div>" +
        "<div class='stat'><div class='stat-num' style='color:#16A34A;'>" + totalCompletedToday + "</div><div class='stat-lbl'>DONE TODAY</div></div>" +
        "<div class='stat'><div class='stat-num' style='color:#7C3AED;'>" + totalCompletedLate + "</div><div class='stat-lbl'>COMPLETED LATE</div></div>" +
        "</div>" +
        "<h2>Worker Breakdown</h2>" + workerRowsHtml +
        "<h2>List Completion</h2>" +
        "<table style='width:100%;border-collapse:collapse;'>" +
        "<thead><tr style='background:#f5f5f5;'><th style='padding:8px 10px;text-align:left;font-size:11px;color:#888;'>LIST</th><th style='padding:8px 10px;text-align:left;font-size:11px;color:#888;'>DUE</th><th style='padding:8px 10px;text-align:left;font-size:11px;color:#888;'>TASKS</th><th style='padding:8px 10px;text-align:left;font-size:11px;color:#888;'>COMPLETE</th><th style='padding:8px 10px;text-align:left;font-size:11px;color:#888;'>OVERDUE</th></tr></thead>" +
        "<tbody>" + listRowsHtml + "</tbody></table>" +
        "<p style='margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px;'>Generated by AMBAC Materials Department Task Manager - " + dateStr + "</p>" +
        "</body></html>";

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 600);
      }
    };

    return (
      <Shell>
        <div style={s.topBar} className="rsp-topbar-pad">
          <button onClick={() => setView("dashboard")} style={s.backBtn2}>&#x2190; Back</button>
          <span style={s.topBarTitle}>Reports</span>
          <span style={s.reportDate}>{new Date().toLocaleDateString([],{month:"short",day:"numeric"})}</span>
        </div>

        <div style={s.reportScroll}>
          {/* Export button */}
          <button onClick={generateReport} style={s.exportBtn}>&#x1F4E4; Export / Email Report</button>

          {/* Tab row */}
          <div style={s.reportTabRow}>
            {[["overview","Overview"],["trends","Reason Trends"]].map(([key,label]) => (
              <button key={key} onClick={() => setReportTab(key)}
                style={{...s.reportTabBtn, background:reportTab===key?"#0D2240":"#f0f0f0", color:reportTab===key?"#fff":"#555"}}>
                {label}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {reportTab === "overview" && (
            <div>
              <div style={s.reportSummaryRow} className="rsp-grid-2">
                <div style={{...s.summaryCard, borderTop:"3px solid #C41230"}}><div style={s.summaryNum}>{totalOverdue}</div><div style={s.summaryLbl}>Overdue</div></div>
                <div style={{...s.summaryCard, borderTop:"3px solid #F59E0B"}}><div style={s.summaryNum}>{totalPending}</div><div style={s.summaryLbl}>Pending</div></div>
                <div style={{...s.summaryCard, borderTop:"3px solid #10B981"}}><div style={s.summaryNum}>{totalCompletedToday}</div><div style={s.summaryLbl}>Done Today</div></div>
                <div style={{...s.summaryCard, borderTop:"3px solid #8B5CF6"}}><div style={s.summaryNum}>{totalCompletedLate}</div><div style={s.summaryLbl}>Completed Late</div></div>
              </div>

              <div style={s.sectionLabel}>WORKER BREAKDOWN</div>
              {workers.map(w => {
                const r = workerReport[w.id];
                const hasOverdue = r.overdueTasks.length > 0;
                return (
                  <div key={w.id} style={s.workerReportCard}>
                    <div style={s.workerReportHeader}>
                      <div style={{...s.workerReportAvatar, background:w.position==="Lead"?"#9B0E25":"#0D2240"}}>{w.avatar}</div>
                      <div style={s.workerReportInfo}>
                        <div style={s.workerReportName}>{w.name}</div>
                        <div style={s.workerReportPos}>{w.position||"Worker"}</div>
                      </div>
                      <div style={s.workerReportStats}>
                        <div style={{...s.workerStatPill, background:hasOverdue?"#FEE2E2":"#f0f0f0", color:hasOverdue?"#C41230":"#888"}}>
                          {r.overdueTasks.length} overdue
                        </div>
                        <div style={{...s.workerStatPill, background:"#F0FDF4", color:"#16A34A"}}>
                          {r.completedToday.length} today
                        </div>
                        {r.completedLate.length > 0 && (
                          <div style={{...s.workerStatPill, background:"#F5F3FF", color:"#7C3AED"}}>
                            {r.completedLate.length} late
                          </div>
                        )}
                      </div>
                    </div>
                    {r.overdueTasks.length > 0 && (
                      <div style={s.workerReportTasks}>
                        <div style={s.workerReportTasksLabel}>OVERDUE</div>
                        {r.overdueTasks.sort((a,b)=>b.days-a.days).map(({task,list,days}) => (
                          <div key={task.id} style={s.reportTaskRow}>
                            <div style={{...s.reportTaskAccent, background:getPriority(task.priority||"none").color}} />
                            <div style={s.reportTaskInfo}>
                              <div style={s.reportTaskText}>{task.text||"(unknown)"}</div>
                              <div style={s.reportTaskMeta}>
                                <span style={s.reportTaskList}>{list?list.title:"(removed)"}</span>
                                <span style={{...s.reportDaysBadge, background:days>=3?"#FEE2E2":days>=2?"#FEF3C7":"#FFF7ED", color:days>=3?"#C41230":days>=2?"#B45309":"#C2410C"}}>
                                  {days} day{days!==1?"s":""} overdue
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.overdueTasks.length === 0 && <div style={s.reportAllClear}>No overdue tasks</div>}
                  </div>
                );
              })}

              <div style={s.sectionLabel}>LIST COMPLETION</div>
              {lists.filter(l=>!l.isRollover).map(list => {
                const pct = progress(list);
                const overdueCount = list.tasks.filter(t=>t.originalDueDate&&!t.doneBy&&daysOverdue(t.originalDueDate)>0).length;
                return (
                  <div key={list.id} style={s.listReportCard}>
                    <div style={{...s.listReportAccent, background:list.color}} />
                    <div style={s.listReportBody}>
                      <div style={s.listReportHeader}>
                        <div style={s.listReportTitle}>{list.title}</div>
                        <span style={{...s.listReportPct, color:pct===100?"#16A34A":pct>50?"#D97706":"#C41230"}}>{pct}%</span>
                      </div>
                      <div style={s.listReportBar}><div style={{...s.listReportFill, width:pct+"%", background:list.color}} /></div>
                      <div style={s.listReportMeta}>
                        <span>{list.tasks.filter(t=>t.doneBy).length}/{list.tasks.length} done</span>
                        {overdueCount>0&&<span style={{color:"#C41230",fontWeight:700}}>{overdueCount} overdue</span>}
                        <span style={{color:"#aaa"}}>{list.dueTime}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Trends tab */}
          {reportTab === "trends" && (
            <div>
              {totalNotes === 0 ? (
                <div style={s.trendsEmpty}>
                  <div style={{fontSize:"32px",marginBottom:"12px"}}>N</div>
                  <div style={{fontSize:"15px",fontWeight:700,color:"#333",marginBottom:"6px"}}>No notes yet</div>
                  <div style={{fontSize:"13px",color:"#aaa",lineHeight:"1.6",textAlign:"center"}}>When workers leave notes explaining why a task was not completed, the trend analysis will appear here.</div>
                </div>
              ) : (
                <div>
                  <div style={s.sectionLabel}>REASON BREAKDOWN - {totalNotes} notes</div>
                  {THEMES.filter(t=>themeGroups[t.key].length>0).sort((a,b)=>themeGroups[b.key].length-themeGroups[a.key].length).map(theme => {
                    const notes = themeGroups[theme.key];
                    const pct = Math.round(notes.length/totalNotes*100);
                    return (
                      <div key={theme.key} style={s.trendCard}>
                        <div style={s.trendCardHeader}>
                          <div style={{...s.trendDot, background:theme.color}} />
                          <div style={s.trendLabel}>{theme.label}</div>
                          <div style={{...s.trendCount, color:theme.color}}>{notes.length}</div>
                        </div>
                        <div style={s.trendBarTrack}><div style={{...s.trendBarFill, width:pct+"%", background:theme.color}} /></div>
                        <div style={s.trendPct}>{pct}%</div>
                        <div style={s.trendNoteList}>
                          {notes.slice(0,5).map((n,i) => (
                            <div key={i} style={s.trendNoteRow}>
                              <span style={s.trendNoteQuote}>"{n.note}"</span>
                              <span style={s.trendNoteMeta}>{n.noteBy?n.noteBy.name:"Unknown"} - {n.taskText} - {n.listTitle}</span>
                            </div>
                          ))}
                          {notes.length>5&&<div style={s.trendMore}>+{notes.length-5} more</div>}
                        </div>
                      </div>
                    );
                  })}
                  <div style={s.sectionLabel}>BY WORKER</div>
                  {workers.filter(w=>workerNoteMap[w.id]&&workerNoteMap[w.id].length>0).map(w => {
                    const wNotes = workerNoteMap[w.id];
                    const themeCounts = {};
                    wNotes.forEach(n => { const k=categorize(n.note); themeCounts[k]=(themeCounts[k]||0)+1; });
                    const topKey = Object.keys(themeCounts).sort((a,b)=>themeCounts[b]-themeCounts[a])[0];
                    const topTheme = THEMES.find(t=>t.key===topKey);
                    return (
                      <div key={w.id} style={s.workerTrendCard}>
                        <div style={s.trendCardHeader}>
                          <div style={{...s.workerReportAvatar,background:w.position==="Lead"?"#9B0E25":"#0D2240",width:"32px",height:"32px",fontSize:"12px"}}>{w.avatar}</div>
                          <div style={{flex:1}}>
                            <div style={s.workerReportName}>{w.name}</div>
                            <div style={{fontSize:"12px",color:"#aaa"}}>{wNotes.length} note{wNotes.length!==1?"s":""} - Top: <span style={{color:topTheme?.color,fontWeight:700}}>{topTheme?.label}</span></div>
                          </div>
                        </div>
                        <div style={s.workerThemeBreakdown}>
                          {Object.entries(themeCounts).sort((a,b)=>b[1]-a[1]).map(([key,count]) => {
                            const t = THEMES.find(th=>th.key===key);
                            return <div key={key} style={{...s.workerThemeChip, background:(t?.color||"#888")+"22", color:t?.color||"#888"}}>{t?.label}: {count}</div>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Shell>
    );
  }
  // ── ACTIVITY VIEW ─────────────────────────────────────────────────────────
  if (view === "activity") {
    return (
      <Shell>
        <div style={s.topBar} className="rsp-topbar-pad">
          <button onClick={() => setView("dashboard")} style={s.backBtn2}>&#x2190; Back</button>
          <span style={s.topBarTitle}>Activity Log</span>
          <button onClick={() => { setActivityLog([]); LS.set("wh_activity",[]); }} style={s.clearBtn}>Clear</button>
        </div>
        <div style={s.activityScroll}>
          {activityLog.length === 0 && <div style={s.emptyState}>No activity yet.</div>}
          {activityLog.map(entry => {
            const user = getUser(entry.userId);
            return (
              <div key={entry.id} style={s.activityItem}>
                <div style={{...s.actAvatar, background:user?.role==="manager"?"#C41230":"#0D2240"}}>
                  {user?.avatar||"?"}
                </div>
                <div style={s.actBody}>
                  <div style={s.actMsg}>{entry.msg}</div>
                  <div style={s.actTime}>{fmtFull(entry.at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Shell>
    );
  }

  // ── ADMIN VIEW ────────────────────────────────────────────────────────────
  if (view === "admin") {
    return (
      <Shell>
        <div style={s.topBar} className="rsp-topbar-pad">
          <button onClick={() => setView("dashboard")} style={s.backBtn2}>&#x2190; Back</button>
          <span style={s.topBarTitle}>Admin</span>
        </div>
        <div style={s.tabRow}>
          {["lists","workers"].map(tab => (
            <button key={tab} onClick={() => setAdminTab(tab)}
              style={{...s.tabBtn, ...(adminTab===tab?s.tabBtnActive:{})}}>
              {tab==="lists"?"Lists":"Workers"}
            </button>
          ))}
        </div>
        <div style={s.adminScroll}>

          {/* LISTS TAB */}
          {adminTab === "lists" && (
            <div>
              <div style={s.sectionLabel}>CREATE LIST</div>
              <label style={s.formLabel}>Title</label>
              <input value={newListTitle} onChange={e=>setNewListTitle(e.target.value)} placeholder="List title" style={s.formInput} />
              <label style={s.formLabel}>Due Time</label>
              <input value={newListDue} onChange={e=>setNewListDue(e.target.value)} placeholder="e.g. 07:00 AM" style={s.formInput} />
              <label style={s.formLabel}>Schedule</label>
              <div style={s.schedModeRow}>
                {[["always","Every Day"],["recurring","Specific Days"],["oneTime","One-Time Date"]].map(([mode,label]) => (
                  <button key={mode} onClick={()=>{ setNewListScheduleMode(mode); setNewListDays([]); setNewListStartDate(""); }}
                    style={{...s.schedModeBtn, background:newListScheduleMode===mode?"#0D2240":"#f0f0f0", color:newListScheduleMode===mode?"#fff":"#555"}}>
                    {label}
                  </button>
                ))}
              </div>
              {newListScheduleMode==="recurring" && (
                <div style={s.dayChips}>
                  {DAYS.map((day,i) => (
                    <button key={i} onClick={()=>setNewListDays(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i])}
                      style={{...s.dayChip, background:newListDays.includes(i)?"#0D2240":"#f0f0f0", color:newListDays.includes(i)?"#fff":"#555"}}>
                      {day}
                    </button>
                  ))}
                </div>
              )}
              {newListScheduleMode==="oneTime" && (
                <input type="date" value={newListStartDate} onChange={e=>setNewListStartDate(e.target.value)} style={s.formInput} />
              )}
              <label style={s.formLabel}>Color</label>
              <div style={s.colorRow}>
                {COLORS.map(c => (
                  <button key={c} onClick={()=>setNewListColor(c)}
                    style={{...s.colorDot, background:c, border:newListColor===c?"3px solid #fff":"3px solid transparent"}} />
                ))}
              </div>
              <label style={s.formLabel}>Assign Workers</label>
              <div style={s.workerChips}>
                {workers.map(w => (
                  <button key={w.id} onClick={()=>setNewListAssigned(prev=>prev.includes(w.id)?prev.filter(x=>x!==w.id):[...prev,w.id])}
                    style={{...s.assignChip, background:newListAssigned.includes(w.id)?"#0D2240":"#f0f0f0", color:newListAssigned.includes(w.id)?"#fff":"#555"}}>
                    {w.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <label style={s.formLabel}>Tasks</label>
              <div style={s.addTaskRow}>
                <input value={newTaskText} onChange={e=>setNewTaskText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&newTaskText.trim()){ setNewTaskBuf(prev=>[...prev,{text:newTaskText.trim(),priority:newTaskPriority}]); setNewTaskText(""); }}}
                  placeholder="Add task..." style={s.inlineInput} />
                <button onClick={()=>{ if(newTaskText.trim()){ setNewTaskBuf(prev=>[...prev,{text:newTaskText.trim(),priority:newTaskPriority}]); setNewTaskText(""); }}}
                  style={{...s.inlineAddBtn, background:"#0D2240"}}>Add</button>
              </div>
              {newTaskBuf.map((t,i) => (
                <div key={i} style={s.bufTaskRow}>
                  <span style={s.bufTaskText}>{t.text}</span>
                  <button onClick={()=>setNewTaskBuf(prev=>prev.filter((_,j)=>j!==i))} style={s.adminDelBtn}>X</button>
                </div>
              ))}
              <button onClick={createList} disabled={!newListTitle.trim()} style={{...s.createBtn, opacity:newListTitle.trim()?1:0.4}}>Create List</button>

              <div style={s.sectionLabel}>EXISTING LISTS</div>
              {lists.map(list => (
                <div key={list.id} style={s.adminListItem}>
                  <div style={{...s.adminListAccent, background:list.color}} />
                  <div style={s.adminListInfo}>
                    <div style={s.adminListTitle}>{list.title}</div>
                    <div style={s.adminListMeta}>{list.tasks.length} tasks - {list.dueTime}</div>
                  </div>
                  <button onClick={() => openEditList(list)} style={s.editBtn}>Edit</button>
                  <button onClick={() => deleteList(list.id)} style={s.adminDelBtn}>X</button>
                </div>
              ))}

              {editingListId && (
                <div style={s.editPanel}>
                  <div style={s.sectionLabel}>EDITING: {editTitle}</div>
                  <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="Title" style={s.formInput} />
                  <input value={editDue} onChange={e=>setEditDue(e.target.value)} placeholder="Due time" style={s.formInput} />
                  <div style={s.colorRow}>
                    {COLORS.map(c => <button key={c} onClick={()=>setEditColor(c)} style={{...s.colorDot,background:c,border:editColor===c?"3px solid #fff":"3px solid transparent"}} />)}
                  </div>
                  <div style={s.workerChips}>
                    {workers.map(w => (
                      <button key={w.id} onClick={()=>setEditAssigned(prev=>prev.includes(w.id)?prev.filter(x=>x!==w.id):[...prev,w.id])}
                        style={{...s.assignChip,background:editAssigned.includes(w.id)?"#0D2240":"#f0f0f0",color:editAssigned.includes(w.id)?"#fff":"#555"}}>
                        {w.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                  {editTasks.map((t,i) => (
                    <div key={t.id} style={s.bufTaskRow}>
                      <span style={s.bufTaskText}>{t.text}</span>
                      <button onClick={()=>setEditTasks(prev=>prev.filter((_,j)=>j!==i))} style={s.adminDelBtn}>X</button>
                    </div>
                  ))}
                  <div style={s.addTaskRow}>
                    <input value={editTaskText} onChange={e=>setEditTaskText(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addEditTask()}
                      placeholder="Add task..." style={s.inlineInput} />
                    <button onClick={addEditTask} style={{...s.inlineAddBtn,background:"#0D2240"}}>Add</button>
                  </div>
                  <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
                    <button onClick={saveEditList} style={{...s.createBtn,flex:1}}>Save</button>
                    <button onClick={()=>setEditingListId(null)} style={{...s.createBtn,flex:1,background:"#888"}}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={s.sectionLabel}>ROLLOVER</div>
              <div style={s.rolloverInfoBox}>
                <div style={s.rolloverInfoText}>Uncompleted tasks roll over at midnight into a new Rollover list.</div>
                <button onClick={() => { LS.set("wh_last_rollover",null); window.location.reload(); }} style={s.rolloverTestBtn}>Trigger Rollover Now</button>
                <button onClick={async () => {
                  const cleaned = lists.map(list => ({...list, tasks:list.tasks.map(t=>({...t,originalDueDate:null}))}));
                  setLists(cleaned);
                  LS.set("wh_lists", cleaned);
                  if (CLOUD_ENABLED) {
                    for (const list of cleaned) {
                      for (const t of list.tasks) {
                        await sbUpsert("tasks", { id:t.id, list_id:list.id, text:t.text,
                          priority:t.priority||"none", task_assignees:t.taskAssignees||[],
                          schedule_mode:t.scheduleMode||"always", days:t.days||[],
                          done_by:t.doneBy||null, done_at:t.doneAt||null,
                          original_due_date:null });
                      }
                    }
                  }
                  alert("Overdue data cleared.");
                }} style={{...s.rolloverTestBtn, background:"#6B7280", marginTop:"8px"}}>Clear Overdue Data</button>
                <button onClick={async () => {
                  if (window.confirm("Delete ALL lists and activity? Workers kept.")) {
                    if (CLOUD_ENABLED) {
                      await sbFetch("tasks?id=neq.placeholder", { method:"DELETE" });
                      await sbFetch("lists?id=neq.placeholder", { method:"DELETE" });
                      await sbFetch("activity?id=neq.placeholder", { method:"DELETE" });
                      await sbFetch("notifications?id=neq.placeholder", { method:"DELETE" });
                    }
                    LS.set("wh_lists",[]); LS.set("wh_activity",[]); LS.set("wh_notifs",{});
                    LS.set("wh_last_rollover",null); LS.set("wh_last_task_reset",null);
                    window.location.reload();
                  }
                }} style={{...s.rolloverTestBtn, background:"#374151", marginTop:"8px"}}>Reset All Data</button>
                <div style={{background:CLOUD_ENABLED?"#DCFCE7":"#FEE2E2", borderRadius:"10px", padding:"10px 14px", marginTop:"8px", fontSize:"13px", color:CLOUD_ENABLED?"#15803D":"#C41230", fontWeight:700}}>
                  {CLOUD_ENABLED ? "Cloud: Connected" : "Cloud: NOT Connected - check Vercel env vars"}
                </div>
                <button onClick={async () => {
                  if (!CLOUD_ENABLED) { alert("Not connected!"); return; }
                  const testId = "test-" + Date.now();
                  alert("Testing... URL: " + (SB_URL ? SB_URL.slice(0,30) : "MISSING"));
                  const result = await fetch(SB_URL + "/rest/v1/lists", {
                    method: "POST",
                    headers: { "Content-Type":"application/json", "apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY, "Prefer":"return=representation" },
                    body: JSON.stringify({ id:testId, title:"TEST-"+testId, due_time:"-", color:"#ff0000", is_rollover:false, assigned_to:[], schedule_mode:"always", schedule_days:[] })
                  });
                  const text = await result.text();
                  alert("Status: " + result.status + " Response: " + text.slice(0,200));
                }} style={{...s.rolloverTestBtn, background:"#7C3AED", marginTop:"8px"}}>&#x1F9EA; Test Supabase Write</button>
                <button onClick={async () => {
                  if (!CLOUD_ENABLED) { alert("Supabase not connected."); return; }
                  let count = 0;
                  for (const l of lists) {
                    await sbUpsert("lists", { id:l.id, title:l.title, due_time:l.dueTime||"-", color:l.color, is_rollover:l.isRollover||false, created_by:l.createdBy||null, assigned_to:l.assignedTo||[], schedule_mode:l.scheduleMode||"always", schedule_days:l.scheduleDays||[], schedule_date:l.scheduleDate||null });
                    for (let i=0; i<l.tasks.length; i++) {
                      const t = l.tasks[i];
                      await sbUpsert("tasks", { id:t.id, list_id:l.id, text:t.text, priority:t.priority||"none", task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always", days:t.days||[], start_date:t.startDate||null, done_by:t.doneBy||null, done_at:t.doneAt||null, note:t.note||null, note_by:t.noteBy||null, note_at:t.noteAt||null, original_due_date:t.originalDueDate||null, from_list:t._fromList||null, sort_order:i });
                    }
                    count++;
                  }
                  for (const w of workers) {
                    await sbUpsert("workers", { id:w.id, name:w.name, role:w.role, position:w.position||"Worker", avatar:w.avatar, pin:w.pin||"0000" });
                  }
                  alert("Pushed " + count + " lists and " + workers.length + " workers to cloud!");
                }} style={{...s.rolloverTestBtn, background:"#059669", marginTop:"8px"}}>&#x2601; Push All Data to Cloud</button>
              </div>

              <div style={s.sectionLabel}>HIGH PRIORITY REMINDERS</div>
              <div style={s.reminderInfoBox}>
                <div style={s.reminderInfoText}>Daily at 1:00 PM and 1 hour before due time for lists with incomplete High priority tasks.</div>
                <button onClick={() => { LS.set("wh_reminders_fired",{}); alert("Reminder history cleared."); }} style={s.reminderTestBtn}>Reset Reminder History</button>
              </div>
            </div>
          )}

          {/* WORKERS TAB */}
          {adminTab === "workers" && (
            <div>
              {workers.map(w => (
                <div key={w.id} style={s.workerItem}>
                  <div style={s.workerAvatar}>{w.avatar}</div>
                  <div style={s.workerInfo}>
                    <div style={s.workerName}>{w.name}</div>
                    <div style={s.workerMeta}>
                      <select value={w.position||"Worker"} onChange={e=>{ const pos=e.target.value; setWorkers(prev=>prev.map(u=>u.id===w.id?{...u,position:pos}:u)); if(CLOUD_ENABLED) sbUpsert("workers",{id:w.id,name:w.name,role:w.role,position:pos,avatar:w.avatar,pin:w.pin||"0000"}); }} style={s.positionSelect}>
                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={() => removeWorker(w.id)} style={s.adminDelBtn}>X</button>
                </div>
              ))}

              <div style={s.sectionLabel}>ADD WORKER</div>
              <label style={s.formLabel}>Full Name</label>
              <input value={newWorkerName} onChange={e=>setNewWorkerName(e.target.value)} placeholder="e.g. Sam K." style={s.formInput} />
              <label style={s.formLabel}>Position</label>
              <div style={s.positionRow}>
                {POSITIONS.map(pos => (
                  <button key={pos} onClick={()=>setNewWorkerPosition(pos)}
                    style={{...s.positionChip, background:newWorkerPosition===pos?(pos==="Lead"?"#E86A2B":"#0D2240"):"#f0f0f0", color:newWorkerPosition===pos?"#fff":"#555"}}>
                    {pos}
                  </button>
                ))}
              </div>
              {newWorkerPosition==="Lead" && <div style={s.leadNotice}>Lead has the same access as Manager.</div>}
              <button onClick={addWorker} disabled={!newWorkerName.trim()} style={{...s.createBtn, marginTop:"14px", opacity:newWorkerName.trim()?1:0.4}}>Add Worker</button>

              <div style={s.sectionLabel}>PINS</div>
              <div style={s.pinInfoBox}>Manager PIN: 0000</div>
              {workers.map(w => (
                <div key={w.id} style={s.pinRow}>
                  <div style={s.workerAvatar}>{w.avatar}</div>
                  <div style={s.workerInfo}>
                    <div style={s.workerName}>{w.name}</div>
                    <div style={{...s.positionBadge, background:w.position==="Lead"?"#FFF0E6":"#f0f0f0", color:w.position==="Lead"?"#E86A2B":"#888"}}>{w.position||"Worker"}</div>
                  </div>
                  <input type="number" maxLength={4} value={w.pin||""} onChange={e=>{ const v=e.target.value.slice(0,4); setWorkers(prev=>prev.map(u=>u.id===w.id?{...u,pin:v}:u)); if(CLOUD_ENABLED&&v.length===4) sbUpsert("workers",{id:w.id,name:w.name,role:w.role,position:w.position||"Worker",avatar:w.avatar,pin:v}); }}
                    placeholder="0000" style={s.pinEditInput} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Shell>
    );
  }
  // ── DASHBOARD FALLBACK ────────────────────────────────────────────────────
  return null;
}

// ── Confetti ──────────────────────────────────────────────────────────────
function Confetti({ color }) {
  const pieces = React.useMemo(() => Array.from({length:60},(_,i) => ({
    id:i, x:Math.random()*100, delay:Math.random()*1.2,
    duration:1.8+Math.random()*1.4, size:6+Math.random()*8,
    color:[color,"#FFD700","#fff","#C41230","#0D2240","#10B981","#F59E0B","#3B82F6","#EC4899"][Math.floor(Math.random()*9)],
    rotation:Math.random()*360, shape:Math.random()>0.5?"rect":"circle",
  })),[]);

  const cssArr = [
    "@keyframes cfall { 0% { transform: translateY(-20px) rotate(0deg); opacity:1; } 80% { opacity:1; } 100% { transform: translateY(900px) rotate(720deg); opacity:0; } }",
    "@keyframes cwiggle { 0%,100% { margin-left:0; } 25% { margin-left:12px; } 75% { margin-left:-12px; } }",
  ];

  return (
    <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,pointerEvents:"none",overflow:"hidden",zIndex:999}}>
      <style>{cssArr.join(" ")}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:"absolute", left:p.x+"%", top:"-10px",
          width:p.shape==="circle"?p.size+"px":(p.size*0.6)+"px",
          height:p.size+"px", background:p.color,
          borderRadius:p.shape==="circle"?"50%":"2px",
          animation:"cfall "+p.duration+"s "+p.delay+"s ease-in forwards, cwiggle "+(p.duration*0.4)+"s "+p.delay+"s ease-in-out infinite",
          transform:"rotate("+p.rotation+"deg)",
        }} />
      ))}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────
function Shell({ children }) {
  React.useEffect(() => {
    if (!document.getElementById("rsp-css")) {
      const el = document.createElement("style");
      el.id = "rsp-css";
      el.textContent = responsiveCSS;
      document.head.appendChild(el);
    }
  }, []);
  return (
    <div style={s.shell} className="rsp-shell">
      <div style={s.phone} className="rsp-phone">{children}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = {
  // Shell
  shell: { minHeight:"100vh", background:"#081729", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px 0", fontFamily:"DM Sans,Segoe UI,sans-serif" },
  phone: { width:"390px", minHeight:"844px", background:"#F2F2F0", borderRadius:"44px", overflow:"hidden", boxShadow:"0 40px 80px rgba(0,0,0,0.6)", display:"flex", flexDirection:"column", position:"relative" },

  // Login
  loginBg: { flex:1, background:"#0D2240", display:"flex", flexDirection:"column" },
  loginLogo: { padding:"64px 24px 32px", textAlign:"center" },
  logoBox: { width:"64px", height:"64px", background:"#C41230", borderRadius:"16px", margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:"28px", fontWeight:900 },
  logoText: { color:"#fff", fontSize:"22px", fontWeight:900, letterSpacing:"4px" },
  logoDept: { fontSize:"12px", fontWeight:700, letterSpacing:"3px", marginTop:"4px" },
  logoSub: { color:"rgba(255,255,255,0.5)", fontSize:"12px", marginTop:"8px" },
  loginCard: { background:"#F2F2F0", borderRadius:"32px 32px 0 0", flex:1, padding:"28px 20px" },
  loginTitle: { fontSize:"18px", fontWeight:800, color:"#111", marginBottom:"20px", textAlign:"center" },
  loginGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" },
  loginUserBtn: { background:"#fff", border:"2px solid", borderRadius:"16px", padding:"16px 10px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" },
  loginAvatar: { width:"44px", height:"44px", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:"16px" },
  loginName: { fontSize:"14px", fontWeight:700, color:"#111" },
  loginRole: { fontSize:"11px", color:"#888" },
  loginBadge: { position:"absolute", top:"-4px", right:"-4px", background:"#C41230", color:"#fff", borderRadius:"50%", width:"18px", height:"18px", fontSize:"10px", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" },

  // PIN
  pinBackBtn: { background:"none", border:"none", color:"#888", fontSize:"14px", cursor:"pointer", padding:"0 0 12px", display:"block" },
  pinDots: { display:"flex", justifyContent:"center", gap:"16px", margin:"20px 0 8px" },
  pinDot: { width:"16px", height:"16px", borderRadius:"50%" },
  pinErrorMsg: { textAlign:"center", color:"#EF4444", fontSize:"13px", marginBottom:"8px" },
  pinPad: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px", padding:"10px 20px 0" },
  pinKey: { borderRadius:"16px", border:"1.5px solid #e8e8e8", padding:"18px 10px", fontSize:"22px", fontWeight:600, cursor:"pointer", boxShadow:"0 2px 6px rgba(0,0,0,0.06)" },

  // Header / TopBar
  header: { background:"#0D2240", padding:"48px 20px 16px" },
  headerTop: { display:"flex", alignItems:"center", gap:"12px" },
  logoSmall: { width:"32px", height:"32px", background:"#C41230", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:"14px", flexShrink:0 },
  headerTitleArea: { flex:1 },
  headerTitle: { color:"#fff", fontSize:"18px", fontWeight:800 },
  headerSub: { color:"rgba(255,255,255,0.6)", fontSize:"12px", marginTop:"2px" },
  headerActions: { display:"flex", alignItems:"center", gap:"8px" },
  iconBtn: { background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"10px", width:"36px", height:"36px", color:"#fff", fontSize:"14px", cursor:"pointer", fontWeight:700 },
  cloudBadge: { color:"#10B981", fontSize:"16px", padding:"0 2px" },
  avatarBtn: { background:"none", border:"none", cursor:"pointer", padding:0 },
  avatarCircle: { width:"36px", height:"36px", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:"13px" },
  topBar: { background:"#0D2240", display:"flex", alignItems:"center", padding:"48px 16px 14px", gap:"12px" },
  topBarTitle: { flex:1, color:"#fff", fontSize:"16px", fontWeight:800, textAlign:"center" },
  backBtn2: { background:"none", border:"none", color:"rgba(255,255,255,0.7)", fontSize:"14px", cursor:"pointer", padding:0, fontWeight:600 },
  clearBtn: { background:"rgba(255,255,255,0.1)", border:"none", color:"#fff", borderRadius:"8px", padding:"4px 12px", fontSize:"12px", cursor:"pointer", fontWeight:600 },
  reportDate: { fontSize:"12px", color:"rgba(255,255,255,0.6)" },

  // Stats strip
  statsStrip: { background:"#0D2240", display:"flex", padding:"0 16px 16px", gap:"8px" },
  statBox: { flex:1, background:"rgba(255,255,255,0.06)", borderRadius:"14px", padding:"10px 8px", textAlign:"center", border:"none", cursor:"pointer" },
  statVal: { color:"#fff", fontSize:"22px", fontWeight:900 },
  statLabel: { color:"rgba(255,255,255,0.6)", fontSize:"10px", fontWeight:600, marginTop:"2px" },

  // Cards
  cardScroll: { flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:"10px" },
  card: { background:"#fff", borderRadius:"16px", display:"flex", overflow:"hidden", border:"none", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", textAlign:"left" },
  cardAccent: { width:"5px", flexShrink:0 },
  cardBody: { flex:1, padding:"14px 14px 12px" },
  cardTitleRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" },
  cardTitle: { fontSize:"15px", fontWeight:700, color:"#111" },
  rolloverBadge: { background:"#FEE2E2", color:"#C41230", borderRadius:"8px", padding:"2px 8px", fontSize:"11px", fontWeight:700 },
  highPriorityBadge: { background:"#FEE2E2", color:"#C41230", borderRadius:"8px", padding:"2px 8px", fontSize:"11px", fontWeight:800, letterSpacing:"0.5px" },
  dueSoonBadge: { background:"#FEF3C7", color:"#B45309", borderRadius:"8px", padding:"2px 8px", fontSize:"11px", fontWeight:700 },
  overdueListBadge: { background:"#FEE2E2", color:"#C41230", borderRadius:"8px", padding:"2px 8px", fontSize:"11px", fontWeight:700 },
  cardMeta: { display:"flex", gap:"8px", marginBottom:"8px", flexWrap:"wrap" },
  cardDue: { fontSize:"12px", color:"#888" },
  cardWorkers: { fontSize:"12px", color:"#0D2240", fontWeight:600 },
  cardProgressBar: { height:"4px", background:"#f0f0f0", borderRadius:"99px", overflow:"hidden", marginBottom:"6px" },
  cardProgressFill: { height:"100%", borderRadius:"99px", transition:"width 0.4s ease" },
  cardBottom: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  cardPctText: { fontSize:"12px", color:"#aaa" },
  cardPctNum: { fontSize:"14px", fontWeight:900 },
  emptyState: { textAlign:"center", padding:"40px 20px", color:"#aaa", fontSize:"14px" },

  // Detail
  detailHeader: { padding:"48px 16px 16px", display:"flex", alignItems:"center", gap:"12px" },
  backBtn: { background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:"10px", padding:"6px 14px", fontSize:"13px", cursor:"pointer", fontWeight:600, flexShrink:0 },
  detailTitleArea: { flex:1 },
  detailTitle: { color:"#fff", fontSize:"17px", fontWeight:800 },
  detailMeta: { color:"rgba(255,255,255,0.7)", fontSize:"12px", marginTop:"2px" },
  resetBtn: { background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:"10px", padding:"6px 14px", fontSize:"13px", cursor:"pointer", fontWeight:600 },
  progressWrap: { display:"flex", alignItems:"center", gap:"8px", padding:"8px 16px" },
  progressTrack: { flex:1, height:"6px", background:"#e0e0e0", borderRadius:"99px", overflow:"hidden" },
  progressFill: { height:"100%", borderRadius:"99px", transition:"width 0.4s ease" },
  progressPct: { fontSize:"12px", fontWeight:700, color:"#333", minWidth:"36px", textAlign:"right" },
  doneBanner: { margin:"0 16px 8px", padding:"10px 16px", border:"2px solid", borderRadius:"12px", fontSize:"14px", fontWeight:700, background:"#fff", textAlign:"center" },
  taskScroll: { flex:1, overflowY:"auto", padding:"4px 0 16px" },
  taskRowWrap: { background:"#fff", marginBottom:"1px", borderLeft:"5px solid #e0e0e0" },
  taskRow: { width:"100%", display:"flex", alignItems:"flex-start", gap:"12px", padding:"12px 14px 8px", background:"none", border:"none", cursor:"pointer", textAlign:"left" },
  checkbox: { width:"22px", height:"22px", borderRadius:"6px", border:"2px solid", flexShrink:0, marginTop:"1px", display:"flex", alignItems:"center", justifyContent:"center" },
  checkmark: { color:"#fff", fontSize:"13px", fontWeight:900 },
  taskInfo: { flex:1 },
  taskTopRow: { display:"flex", alignItems:"flex-start", gap:"8px", justifyContent:"space-between" },
  taskText: { fontSize:"14px", color:"#111", fontWeight:500, lineHeight:"1.4", flex:1 },
  priorityPill: { borderRadius:"6px", padding:"2px 8px", fontSize:"11px", fontWeight:700, flexShrink:0, marginTop:"1px" },
  fromListRow: { display:"flex", alignItems:"center", gap:"8px", marginTop:"4px", flexWrap:"wrap" },
  fromListTag: { fontSize:"11px", color:"#EF4444", fontWeight:600 },
  overdueBadge: { background:"#FEF2F2", color:"#C41230", borderRadius:"6px", padding:"1px 7px", fontSize:"11px", fontWeight:800, border:"1px solid #FECACA" },
  taskAssigneeText: { display:"block", fontSize:"12px", fontWeight:700, color:"#111", marginTop:"3px" },
  doneByTag: { display:"block", fontSize:"11px", color:"#888", marginTop:"3px" },
  noteDisplay: { marginTop:"4px", background:"#fafafa", borderRadius:"8px", padding:"6px 8px" },
  noteText: { fontSize:"12px", color:"#555", fontStyle:"italic" },
  noteBy: { fontSize:"11px", color:"#aaa" },
  noteEditOuter: { padding:"0 14px 12px 50px", background:"#fff" },
  noteTextarea: { width:"100%", padding:"10px 12px", borderRadius:"10px", border:"1.5px solid #f97316", fontSize:"13px", outline:"none", background:"#fff8f3", resize:"none", boxSizing:"border-box", fontFamily:"inherit", lineHeight:"1.5", color:"#222" },
  noteEditBtns: { display:"flex", gap:"8px", marginTop:"8px" },
  noteSaveBtn: { border:"none", color:"#fff", borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
  noteClearBtn: { background:"#f5f5f5", border:"none", color:"#888", borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
  noteCancelBtn: { background:"#f5f5f5", border:"none", color:"#888", borderRadius:"8px", padding:"8px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
  taskActions: { display:"flex", gap:"6px", padding:"0 14px 10px 50px" },
  priorityDropBtn: { borderRadius:"8px", border:"none", padding:"4px 8px", fontSize:"12px", fontWeight:700, cursor:"pointer" },
  assignTaskBtn: { width:"26px", height:"26px", borderRadius:"8px", border:"none", fontSize:"12px", cursor:"pointer", fontWeight:700 },
  noteBtn: { background:"none", border:"none", fontSize:"14px", cursor:"pointer", fontWeight:700, padding:"0 4px" },
  taskDeleteBtn: { background:"none", border:"none", color:"#ccc", cursor:"pointer", fontSize:"14px", fontWeight:700, marginLeft:"auto" },
  assignPickerWrap: { padding:"8px 12px 12px", borderTop:"1px solid #f0f0f0", background:"#f9f9f9" },
  assignPickerLabel: { fontSize:"11px", fontWeight:700, color:"#aaa", letterSpacing:"1px", marginBottom:"8px" },
  assignPickerRow: { display:"flex", gap:"6px", flexWrap:"wrap" },
  assignPickerChip: { borderRadius:"10px", padding:"6px 12px", border:"none", fontSize:"13px", fontWeight:600, cursor:"pointer" },
  addTaskSection: { padding:"12px 16px" },
  addTaskBtn: { width:"100%", background:"none", border:"2px dashed", borderRadius:"12px", padding:"12px", fontSize:"14px", fontWeight:700, cursor:"pointer" },
  addTaskForm: { background:"#fff", borderRadius:"12px", padding:"12px", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" },
  addTaskFormRow: { display:"flex", gap:"6px", marginTop:"8px", flexWrap:"wrap" },
  priorityChipBtn: { borderRadius:"8px", border:"none", padding:"5px 10px", fontSize:"12px", fontWeight:600, cursor:"pointer" },
  inlineInput: { flex:1, padding:"8px 12px", borderRadius:"10px", border:"1.5px solid #e0e0e0", fontSize:"14px", outline:"none", minWidth:0 },
  inlineAddBtn: { border:"none", color:"#fff", borderRadius:"10px", padding:"8px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer", flexShrink:0 },
  inlineCancelBtn: { background:"#f0f0f0", border:"none", color:"#888", borderRadius:"10px", padding:"8px 14px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
  addTaskRow: { display:"flex", gap:"8px", marginBottom:"8px" },

  // Notifications
  bellBtn: { background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"10px", width:"36px", height:"36px", cursor:"pointer", position:"relative", display:"flex", alignItems:"center", justifyContent:"center" },
  bellIcon: { color:"#fff", fontSize:"14px", fontWeight:700 },
  bellBadge: { position:"absolute", top:"-4px", right:"-4px", background:"#C41230", color:"#fff", borderRadius:"50%", width:"18px", height:"18px", fontSize:"10px", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" },
  notifDrawer: { position:"absolute", right:0, top:"44px", width:"300px", background:"#fff", borderRadius:"16px", boxShadow:"0 8px 32px rgba(0,0,0,0.2)", zIndex:100, overflow:"hidden", maxHeight:"400px", display:"flex", flexDirection:"column" },
  notifHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid #f0f0f0" },
  notifHeaderTitle: { fontSize:"14px", fontWeight:700, color:"#111" },
  markReadBtn: { background:"none", border:"none", color:"#C41230", fontSize:"12px", cursor:"pointer", fontWeight:600 },
  notifList: { overflowY:"auto", flex:1 },
  notifEmpty: { padding:"20px", textAlign:"center", color:"#aaa", fontSize:"13px" },
  notifItem: { display:"flex", alignItems:"flex-start", gap:"10px", padding:"12px 16px", width:"100%", border:"none", borderBottom:"1px solid #f5f5f5", cursor:"pointer", textAlign:"left" },
  notifDot: { width:"8px", height:"8px", borderRadius:"50%", flexShrink:0, marginTop:"4px" },
  notifBody: { flex:1 },
  notifItemTitle: { fontSize:"13px", fontWeight:700, color:"#0D2240", marginBottom:"2px" },
  notifItemBody: { fontSize:"12px", color:"#666", lineHeight:"1.4" },
  notifTime: { fontSize:"11px", color:"#aaa", marginTop:"3px" },
  unreadDot: { width:"8px", height:"8px", borderRadius:"50%", background:"#C41230", flexShrink:0, marginTop:"4px" },

  // Admin
  tabRow: { display:"flex", background:"#0D2240" },
  tabBtn: { flex:1, background:"none", border:"none", color:"rgba(255,255,255,0.6)", padding:"12px", fontSize:"14px", fontWeight:600, cursor:"pointer" },
  tabBtnActive: { color:"#fff", borderBottom:"3px solid #C41230" },
  adminScroll: { flex:1, overflowY:"auto", padding:"16px" },
  sectionLabel: { fontSize:"10px", fontWeight:800, color:"#aaa", letterSpacing:"2px", marginBottom:"10px", marginTop:"16px" },
  formLabel: { display:"block", fontSize:"12px", fontWeight:700, color:"#555", marginBottom:"4px", marginTop:"10px" },
  formInput: { width:"100%", padding:"10px 12px", borderRadius:"10px", border:"1.5px solid #e0e0e0", fontSize:"14px", outline:"none", boxSizing:"border-box", marginBottom:"4px" },
  colorRow: { display:"flex", gap:"8px", marginBottom:"8px", flexWrap:"wrap" },
  schedModeRow: { display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"8px" },
  schedModeBtn: { borderRadius:"10px", padding:"7px 10px", border:"none", fontSize:"12px", fontWeight:600, cursor:"pointer", flex:1 },
  dayChips: { display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"8px" },
  dayChip: { borderRadius:"8px", padding:"6px 10px", border:"none", fontSize:"12px", fontWeight:600, cursor:"pointer" },
  cardScheduleTag: { fontSize:"11px", color:"#0D2240", fontWeight:700, background:"#E8EEF7", borderRadius:"6px", padding:"2px 6px" },
  colorDot: { width:"28px", height:"28px", borderRadius:"50%", cursor:"pointer" },
  workerChips: { display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"8px" },
  assignChip: { borderRadius:"10px", padding:"6px 12px", border:"none", fontSize:"13px", fontWeight:600, cursor:"pointer" },
  bufTaskRow: { display:"flex", alignItems:"center", gap:"8px", background:"#f5f5f5", borderRadius:"10px", padding:"8px 12px", marginBottom:"6px" },
  bufTaskText: { flex:1, fontSize:"13px", color:"#333" },
  createBtn: { width:"100%", background:"#0D2240", color:"#fff", border:"none", borderRadius:"12px", padding:"12px", fontSize:"14px", fontWeight:700, cursor:"pointer", marginTop:"8px" },
  adminListItem: { display:"flex", alignItems:"center", gap:"8px", background:"#fff", borderRadius:"12px", padding:"10px 14px", marginBottom:"8px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  adminListAccent: { width:"4px", height:"36px", borderRadius:"2px", flexShrink:0 },
  adminListInfo: { flex:1 },
  adminListTitle: { fontSize:"14px", fontWeight:700, color:"#111" },
  adminListMeta: { fontSize:"12px", color:"#aaa", marginTop:"2px" },
  editBtn: { background:"#f0f0f0", border:"none", color:"#555", borderRadius:"8px", padding:"5px 10px", fontSize:"12px", cursor:"pointer", fontWeight:600 },
  adminDelBtn: { background:"none", border:"none", color:"#ccc", cursor:"pointer", fontSize:"14px", fontWeight:700, padding:"4px 8px" },
  editPanel: { background:"#f9f9f9", borderRadius:"14px", padding:"14px", marginTop:"10px" },
  rolloverInfoBox: { background:"#FEF2F2", borderRadius:"14px", padding:"14px 16px", marginBottom:"8px", border:"1px solid #FECACA" },
  rolloverInfoText: { fontSize:"13px", color:"#991B1B", lineHeight:"1.5", marginBottom:"10px" },
  rolloverTestBtn: { background:"#EF4444", color:"#fff", border:"none", borderRadius:"10px", padding:"8px 16px", fontSize:"13px", fontWeight:700, cursor:"pointer", display:"block", width:"100%" },
  reminderInfoBox: { background:"#EFF6FF", borderRadius:"14px", padding:"14px 16px", marginBottom:"8px", border:"1px solid #BFDBFE" },
  reminderInfoText: { fontSize:"13px", color:"#1E40AF", lineHeight:"1.5", marginBottom:"10px" },
  reminderTestBtn: { background:"#2563EB", color:"#fff", border:"none", borderRadius:"10px", padding:"8px 16px", fontSize:"13px", fontWeight:700, cursor:"pointer" },

  // Workers
  workerItem: { display:"flex", alignItems:"center", gap:"12px", background:"#fff", borderRadius:"14px", padding:"12px 14px", marginBottom:"8px", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" },
  workerAvatar: { width:"36px", height:"36px", borderRadius:"50%", background:"#0D2240", color:"#fff", fontWeight:800, fontSize:"13px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  workerInfo: { flex:1 },
  workerName: { fontSize:"15px", fontWeight:600, color:"#111" },
  workerMeta: { marginTop:"3px" },
  positionSelect: { fontSize:"12px", color:"#666", border:"1px solid #e0e0e0", borderRadius:"8px", padding:"3px 6px", background:"#fafafa", cursor:"pointer", outline:"none" },
  positionRow: { display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"4px" },
  positionChip: { borderRadius:"10px", padding:"7px 12px", border:"none", fontSize:"13px", fontWeight:600, cursor:"pointer" },
  positionBadge: { borderRadius:"6px", padding:"2px 7px", fontSize:"11px", fontWeight:700, display:"inline-block" },
  leadNotice: { background:"#FFF0E6", border:"1px solid #F5C9A8", borderRadius:"10px", padding:"10px 12px", fontSize:"13px", color:"#9A3E0A", lineHeight:"1.5", marginBottom:"4px" },
  pinInfoBox: { background:"#f5f5f5", borderRadius:"10px", padding:"10px 14px", fontSize:"13px", color:"#555", marginBottom:"8px" },
  pinRow: { display:"flex", alignItems:"center", gap:"12px", background:"#fff", borderRadius:"14px", padding:"10px 14px", marginBottom:"8px", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" },
  pinEditInput: { width:"72px", padding:"8px 10px", borderRadius:"10px", border:"1.5px solid #e0e0e0", fontSize:"18px", fontWeight:700, textAlign:"center", outline:"none", letterSpacing:"4px", color:"#111" },

  // Report
  reportScroll: { flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"10px" },
  reportTabRow: { display:"flex", gap:"8px", marginBottom:"4px" },
  exportBtn: { background:"#0D2240", color:"#fff", border:"none", borderRadius:"12px", padding:"12px 16px", fontSize:"14px", fontWeight:700, cursor:"pointer", width:"100%", marginBottom:"4px" },
  reportTabBtn: { flex:1, border:"none", borderRadius:"10px", padding:"10px 8px", fontSize:"13px", fontWeight:700, cursor:"pointer" },
  reportSummaryRow: { display:"flex", gap:"10px", flexWrap:"wrap" },
  summaryCard: { flex:"1 1 40%", background:"#fff", borderRadius:"14px", padding:"14px 10px", textAlign:"center", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" },
  summaryNum: { fontSize:"28px", fontWeight:900, color:"#111" },
  summaryLbl: { fontSize:"11px", color:"#aaa", marginTop:"4px", fontWeight:600 },
  workerReportCard: { background:"#fff", borderRadius:"16px", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" },
  workerReportHeader: { display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px" },
  workerReportAvatar: { width:"40px", height:"40px", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:"14px", flexShrink:0 },
  workerReportInfo: { flex:1 },
  workerReportName: { fontSize:"15px", fontWeight:700, color:"#111" },
  workerReportPos: { fontSize:"12px", color:"#aaa", marginTop:"2px" },
  workerReportStats: { display:"flex", flexDirection:"column", gap:"4px", alignItems:"flex-end" },
  workerStatPill: { borderRadius:"8px", padding:"3px 8px", fontSize:"11px", fontWeight:700 },
  workerReportTasks: { borderTop:"1px solid #f5f5f5", padding:"10px 16px 14px" },
  workerReportTasksLabel: { fontSize:"10px", fontWeight:800, color:"#ccc", letterSpacing:"1.5px", marginBottom:"8px" },
  reportTaskRow: { display:"flex", gap:"10px", alignItems:"flex-start", marginBottom:"8px" },
  reportTaskAccent: { width:"3px", borderRadius:"3px", alignSelf:"stretch", flexShrink:0, minHeight:"20px" },
  reportTaskInfo: { flex:1 },
  reportTaskText: { fontSize:"13px", color:"#222", fontWeight:600, lineHeight:"1.4" },
  reportTaskMeta: { display:"flex", alignItems:"center", gap:"8px", marginTop:"3px", flexWrap:"wrap" },
  reportTaskList: { fontSize:"11px", color:"#aaa" },
  reportDaysBadge: { borderRadius:"6px", padding:"1px 7px", fontSize:"11px", fontWeight:800 },
  reportAllClear: { padding:"10px 16px 14px", fontSize:"13px", color:"#aaa", fontStyle:"italic" },
  listReportCard: { background:"#fff", borderRadius:"14px", display:"flex", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" },
  listReportAccent: { width:"5px", flexShrink:0 },
  listReportBody: { flex:1, padding:"12px 14px" },
  listReportHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" },
  listReportTitle: { fontSize:"14px", fontWeight:700, color:"#111" },
  listReportPct: { fontSize:"14px", fontWeight:900 },
  listReportBar: { height:"5px", background:"#f0f0f0", borderRadius:"99px", overflow:"hidden", marginBottom:"6px" },
  listReportFill: { height:"100%", borderRadius:"99px", transition:"width 0.4s ease" },
  listReportMeta: { display:"flex", gap:"8px", fontSize:"12px", color:"#888", flexWrap:"wrap" },
  trendCard: { background:"#fff", borderRadius:"14px", padding:"14px 16px", marginBottom:"10px", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" },
  trendCardHeader: { display:"flex", alignItems:"center", gap:"10px", marginBottom:"8px" },
  trendDot: { width:"12px", height:"12px", borderRadius:"50%", flexShrink:0 },
  trendLabel: { flex:1, fontSize:"14px", fontWeight:700, color:"#111" },
  trendCount: { fontSize:"13px", fontWeight:800 },
  trendBarTrack: { height:"8px", background:"#f0f0f0", borderRadius:"99px", overflow:"hidden", marginBottom:"4px" },
  trendBarFill: { height:"100%", borderRadius:"99px", transition:"width 0.4s ease" },
  trendPct: { fontSize:"11px", color:"#aaa", marginBottom:"10px" },
  trendNoteList: { display:"flex", flexDirection:"column", gap:"6px" },
  trendNoteRow: { background:"#fafafa", borderRadius:"8px", padding:"8px 10px" },
  trendNoteQuote: { display:"block", fontSize:"13px", color:"#222", fontStyle:"italic", lineHeight:"1.4", marginBottom:"3px" },
  trendNoteMeta: { fontSize:"11px", color:"#aaa" },
  trendMore: { fontSize:"12px", color:"#aaa", fontStyle:"italic", marginTop:"4px" },
  trendsEmpty: { textAlign:"center", padding:"40px 20px", color:"#aaa" },
  workerTrendCard: { background:"#fff", borderRadius:"14px", padding:"14px 16px", marginBottom:"10px", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" },
  workerThemeBreakdown: { display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"10px" },
  workerThemeChip: { borderRadius:"8px", padding:"4px 10px", fontSize:"11px", fontWeight:700 },

  // Activity
  activityScroll: { flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"10px" },
  activityItem: { background:"#fff", borderRadius:"14px", display:"flex", gap:"12px", padding:"12px 14px", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" },
  actAvatar: { width:"36px", height:"36px", borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:"13px" },
  actBody: { flex:1 },
  actMsg: { fontSize:"14px", color:"#222", lineHeight:"1.4" },
  actTime: { fontSize:"11px", color:"#aaa", marginTop:"3px" },
};
