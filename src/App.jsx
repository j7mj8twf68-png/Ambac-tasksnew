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
const parseDueMins = (dueTime) => {
  if (!dueTime || dueTime==="-") return 9999;
  const m = dueTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 9999;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase()==="PM" && h!==12) h+=12;
  if (m[3].toUpperCase()==="AM" && h===12) h=0;
  return h*60+parseInt(m[2]);
};

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

  // ── Auto-refresh from Supabase every 5 minutes ───────────────────────────
  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    const iv = setInterval(() => {
      Promise.all([
        sbFetch("workers?order=created_at.asc"),
        sbFetch("lists?order=created_at.desc"),
        sbFetch("tasks?order=created_at.asc"),
      ]).then(([dbWorkers, dbLists, dbTasks]) => {
        if (dbWorkers.length > 0) {
          setWorkers(dbWorkers.map(w => ({ id:w.id, name:w.name, role:w.role, position:w.position, avatar:w.avatar, pin:w.pin })));
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
        }
      }).catch(e => console.warn("Auto-refresh failed:", e));
    }, 1 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);
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
    const checkRollover = async () => {
      const today = new Date().toDateString();
      const lastLocal = LS.get("wh_last_rollover", null);
      if (lastLocal === today) return;

      // Also check Supabase to avoid duplicate rollovers across devices
      if (CLOUD_ENABLED) {
        const state = await sbFetch("app_state?key=eq.last_rollover");
        if (state && state.length > 0 && state[0].value === today) {
          LS.set("wh_last_rollover", today);
          return;
        }
      }

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

        // Save rollover lists to Supabase
        if (CLOUD_ENABLED) {
          rolloverLists.forEach(l => {
            sbUpsert("lists", { id:l.id, title:l.title, due_time:l.dueTime, color:l.color,
              is_rollover:true, created_by:"mgr", assigned_to:l.assignedTo,
              schedule_mode:"always", schedule_days:[], schedule_date:null });
            l.tasks.forEach((t,i) => sbUpsert("tasks", { id:t.id, list_id:l.id, text:t.text,
              priority:t.priority||"none", task_assignees:t.taskAssignees||[],
              schedule_mode:"always", days:[], start_date:null,
              done_by:null, done_at:null, note:t.note||null, note_by:t.noteBy||null,
              note_at:t.noteAt||null, original_due_date:t.originalDueDate||null,
              from_list:t._fromList||null, sort_order:i }));
          });
          // Save rollover date to Supabase app_state
          sbUpsert("app_state", { key:"last_rollover", value:today });
        }

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
    const resetRecurring = async () => {
      const today = new Date().toDateString();
      if (LS.get("wh_last_task_reset",null) === today) return;
      // Check Supabase too
      if (CLOUD_ENABLED) {
        const state = await sbFetch("app_state?key=eq.last_task_reset");
        if (state && state.length > 0 && state[0].value === today) {
          LS.set("wh_last_task_reset", today);
          return;
        }
      }
      setLists(prev => {
        const updated = prev.map(l => {
          // Reset task-level recurring tasks
          const taskReset = l.tasks.map(t => t.days && t.days.length > 0 && t.doneBy ? {...t, doneBy:null, doneAt:null} : t);
          // Reset all tasks in list-level recurring lists
          const listIsRecurring = l.scheduleMode === "recurring" && l.scheduleDays && l.scheduleDays.length > 0;
          if (listIsRecurring) {
            const resetTasks = taskReset.map(t => t.doneBy ? {...t, doneBy:null, doneAt:null} : t);
            // Sync resets to Supabase
            if (CLOUD_ENABLED) resetTasks.forEach(t => sbUpsert("tasks", { id:t.id, list_id:l.id, text:t.text, priority:t.priority||"none", task_assignees:t.taskAssignees||[], schedule_mode:t.scheduleMode||"always", days:t.days||[], done_by:null, done_at:null }));
            return { ...l, tasks: resetTasks };
          }
          return { ...l, tasks: taskReset };
        });
        return updated;
      });
      LS.set("wh_last_task_reset", today);
      if (CLOUD_ENABLED) sbUpsert("app_state", { key:"last_task_reset", value:today });
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
              <div style={s.logoBox}>A</div>
              <div style={s.logoText}>AMBAC</div>
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
  const isListScheduledToday = (list) => {
    if (!list.scheduleMode || list.scheduleMode === "always") return true;
    if (list.scheduleMode === "recurring") return list.scheduleDays && list.scheduleDays.includes(todayIdx());
    if (list.scheduleMode === "oneTime") return list.scheduleDate && new Date(list.scheduleDate+"T00:00:00").toDateString() === new Date().toDateString();
    return true;
  };
  const visibleLists = lists.filter(l => (isManager || l.assignedTo.includes(currentUser?.id)) && (isManager || l.isRollover || isListScheduledToday(l)));
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
            <div style={s.logoSmall}>A</div>
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
    try {
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
      // Check if this list is overdue today (due time passed and scheduled today)
      const dueMins = parseDueMins(list.dueTime);
      const nowMins2 = new Date().getHours()*60 + new Date().getMinutes();
      const isScheduledToday2 = !list.scheduleMode || list.scheduleMode === "always" ||
        (list.scheduleMode === "recurring" && list.scheduleDays && list.scheduleDays.includes(todayIdx())) ||
        (list.scheduleMode === "oneTime" && list.scheduleDate && new Date(list.scheduleDate+"T00:00:00").toDateString() === new Date().toDateString());
      const listOverdueToday = dueMins > 0 && nowMins2 > dueMins && isScheduledToday2 && !list.isRollover;

      list.tasks.forEach(task => {
        const owners = (task.taskAssignees&&task.taskAssignees.length>0) ? task.taskAssignees : list.assignedTo;
        owners.forEach(wId => {
          if (!workerReport[wId]) return;
          const r = workerReport[wId];
          r.totalAssigned++;
          // Overdue from originalDueDate (rollover tasks)
          if (task.originalDueDate && !task.doneBy) {
            const days = daysOverdue(task.originalDueDate);
            if (days > 0) {
              const norm = task.text.trim().toLowerCase().replace(/\s+/g," ");
              const finishedElsewhere = (workerCompletedTexts[wId]||[]).some(t => t===norm);
              const alreadyCounted = r.overdueTasks.some(o => o.task.text.trim().toLowerCase().replace(/\s+/g," ")===norm);
              if (!finishedElsewhere && !alreadyCounted) r.overdueTasks.push({ task, list, days });
            }
          }
          // Overdue from list due time passing today
          if (listOverdueToday && !task.doneBy && !task.originalDueDate) {
            const norm = task.text.trim().toLowerCase().replace(/\s+/g," ");
            const alreadyCounted = r.overdueTasks.some(o => o.task.text.trim().toLowerCase().replace(/\s+/g," ")===norm);
            if (!alreadyCounted) r.overdueTasks.push({ task, list, days: 0, todayOverdue: true });
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
      const lines = [
        "AMBAC Materials Department - Task Report",
        dateStr,
        "",
        "SUMMARY",
        "Overdue: " + totalOverdue,
        "Pending: " + totalPending,
        "Done Today: " + totalCompletedToday,
        "Completed Late: " + totalCompletedLate,
        "",
        "WORKER BREAKDOWN",
      ];
      workers.forEach(w => {
        const r = workerReport[w.id];
        lines.push(w.name + " (" + (w.position||"Worker") + ")");
        lines.push("  Overdue: " + r.overdueTasks.length + "  Done Today: " + r.completedToday.length + "  Late: " + r.completedLate.length);
        r.overdueTasks.forEach(({task,list,days,todayOverdue}) => {
          lines.push("  - " + task.text + " [" + (list?list.title:"") + "] " + (todayOverdue ? "Due today" : days + "d overdue"));
        });
      });
      lines.push("");
      lines.push("LIST COMPLETION");
      lists.filter(l=>!l.isRollover).forEach(list => {
        const pct = progress(list);
        lines.push(list.title + ": " + pct + "% (" + list.tasks.filter(t=>t.doneBy).length + "/" + list.tasks.length + " tasks) - " + list.dueTime);
      });
      const text = lines.join("\n");
      const win = window.open("", "_blank");
      if (win) {
        win.document.write("<pre style=\"font-family:Arial,sans-serif;padding:32px;font-size:14px;max-width:800px;margin:0 auto;\">" + text + "</pre>");
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
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
                        {r.overdueTasks.sort((a,b)=>b.days-a.days).map(({task,list,days,todayOverdue}) => (
                          <div key={task.id} style={s.reportTaskRow}>
                            <div style={{...s.reportTaskAccent, background:getPriority(task.priority||"none").color}} />
                            <div style={s.reportTaskInfo}>
                              <div style={s.reportTaskText}>{task.text||"(unknown)"}</div>
                              <div style={s.reportTaskMeta}>
                                <span style={s.reportTaskList}>{list?list.title:"(removed)"}</span>
                                <span style={{...s.reportDaysBadge, background:days>=3?"#FEE2E2":days>=2?"#FEF3C7":"#FFF7ED", color:days>=3?"#C41230":days>=2?"#B45309":"#C2410C"}}>
                                  {todayOverdue ? "Due today" : days + " day" + (days!==1?"s":"") + " overdue"}
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
  // ── ACTIVITY VIEW ─────────────────────────────────────────────────────────
    } catch(err) {
      return (
        <Shell>
          <div style={{flex:1,background:"#F2F2F0",padding:"40px 20px"}}>
            <button onClick={() => setView("dashboard")} style={{background:"none",border:"none",color:"#C41230",fontSize:"14px",cursor:"pointer",marginBottom:"20px"}}>Back</button>
            <div style={{background:"#FEE2E2",borderRadius:"14px",padding:"20px",color:"#C41230"}}>
              <div style={{fontSize:"16px",fontWeight:700,marginBottom:"8px"}}>Report Error</div>
              <div style={{fontSize:"13px"}}>{err.message}</div>
            </div>
          </div>
        </Shell>
      );
    }
  }
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
