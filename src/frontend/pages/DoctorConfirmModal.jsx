import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const API_BASE = "http://localhost:5001";

// ---------- helpers ----------
function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 判斷時段是否為上午 (支援 "AM" 或 "09:30")
function isMorning(slot) {
  if (!slot) return false;
  if (slot === "AM") return true;
  if (slot === "PM") return false;
  // 如果是具體時間 "09:30"
  if (slot.includes(":")) {
    const hour = parseInt(slot.split(":")[0], 10);
    return hour < 12; // 12點以前算上午
  }
  return true; // Default fallback
}

// 將後端 Appointment 轉為 UI 格式
function toViewModelFromAppt(appt) {
  const rawTime = appt.time || "";
  // 格式可能是 "2025-12-14 AM" 或 "2025-12-14 09:30"
  const parts = rawTime.split(" ");
  const date = parts[0] || "";
  let slot = parts[1] || "";

  if (!slot && rawTime.includes("T")) {
    slot = rawTime.split("T")[1].slice(0, 5);
  }

  return {
    id: appt.id, 
    type: "APPOINTMENT", 
    status: appt.status,
    date: date,
    timeSlot: slot, 
    subject: appt.subject,
    priority: appt.priority || 99,
    
    patientId: appt.patientId,
    patientName: appt.patientName,
    address: appt.address || appt.location || "—",
    symptoms: appt.symptoms || "",
    duration: appt.duration || 30, // 確保有 duration
    
    eta: (slot.includes(":") ? slot : null), // 如果已經是時間格式，直接當作 ETA
    travelMinutes: appt.travelMinutes || 0,
    lat: appt.lat,
    lng: appt.lng
  };
}

function toViewModelFromReq(row) {
  return {
    id: row.id, 
    type: "REQUEST",
    status: row.status || "PENDING",
    date: row.date || "",          
    timeSlot: row.timeSlot || "",  
    subject: row.subject || "",
    symptoms: row.symptoms || "", 
    
    patientId: row.id_card_number || row.patientId || "",
    patientName: row.name || row.patientName || "Unknown",
    address: row.address || row.location || "—",
    lat: row.lat, 
    lng: row.lng,
    duration: 30
  };
}

// ---------- DnD helpers ----------
function setDrag(e, payload) {
  e.dataTransfer.setData("text/plain", JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}
function getDrag(e) {
  try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; }
}
function allowDrop(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

// ---------- component ----------
export default function DoctorConfirmModal({
  open,
  doctorName = "Doctor",
  doctorId = "",      
  doctorSubject = "", 
  onClose,
  onAcceptToBackend,  
}) {
  // 預設日期
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [loading, setLoading] = useState(false);
  
  const [allPending, setAllPending] = useState([]);
  const [scheduleAM, setScheduleAM] = useState([]);
  const [schedulePM, setSchedulePM] = useState([]);

  // 1. 讀取 Pending
  useEffect(() => {
    if (!open) return;
    fetchPending();
  }, [open, doctorSubject]);

  // 2. 當日期改變時，先清空 Schedule，再讀取新的 (解決圖一日期不符問題)
  useEffect(() => {
    if (!open || !doctorId) return;
    
    // 清空舊資料，避免視覺殘留
    setScheduleAM([]);
    setSchedulePM([]);
    
    fetchExistingSchedule();
  }, [open, doctorId, selectedDate]);

  async function fetchPending() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/appointment-requests?status=PENDING`);
      const rows = await res.json();
      const filtered = Array.isArray(rows) 
        ? rows.map(toViewModelFromReq).filter(x => doctorSubject ? x.subject === doctorSubject : true)
        : [];
      setAllPending(filtered);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }

  async function fetchExistingSchedule() {
    try {
      const res = await fetch(`${API_BASE}/api/appointments?doctorId=${doctorId}&date=${selectedDate}`);
      const data = await res.json();
      
      const am = [];
      const pm = [];

      data.forEach(a => {
        const vm = toViewModelFromAppt(a);
        // 雙重檢查：確保日期真的符合 (以防後端回傳多餘資料)
        if (vm.date !== selectedDate) return;

        if (isMorning(vm.timeSlot)) am.push(vm);
        else pm.push(vm);
      });

      // 排序
      const sorter = (a, b) => {
        if (a.timeSlot.includes(":") && b.timeSlot.includes(":")) {
          return a.timeSlot.localeCompare(b.timeSlot);
        }
        return (a.priority - b.priority);
      };

      setScheduleAM(am.sort(sorter));
      setSchedulePM(pm.sort(sorter));
    } catch(e) { console.error(e); }
  }

  // 🔥 核心功能: 呼叫後端重新計算時間 (Auto-Update Time)
  async function requestRecalculation(items, slotType) {
     if (items.length === 0) return items;

     // 鎖定 UI 顯示 Loading 狀態 (可選)
     // setLoading(true); 
     try {
        const startTime = slotType === "AM" ? "09:00" : "13:00";
        const res = await fetch(`${API_BASE}/api/recalculate-timings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items, startTime, date: selectedDate })
        });
        const updated = await res.json();
        return updated.map(item => ({
            ...item,
            // 確保回傳的 eta 是具體時間，這樣 Save 後就會是 09:30 而不是 AM
            timeSlot: item.eta 
        }));
     } catch(e) {
        console.error("Recalc failed", e);
        return items;
     } finally {
        // setLoading(false);
     }
  }

  // --- Drag & Drop Logic ---
  
  // 為了方便操作，我們將「更新 State」與「觸發重算」包在一起
  const updateListAndRecalculate = async (targetSlot, newList) => {
      // 1. 先更新 UI (讓使用者覺得很快)
      if (targetSlot === "AM") setScheduleAM(newList);
      else setSchedulePM(newList);

      // 2. 背景呼叫後端重算時間
      const recalculated = await requestRecalculation(newList, targetSlot);
      
      // 3. 更新 UI 為精確時間
      if (targetSlot === "AM") setScheduleAM(recalculated);
      else setSchedulePM(recalculated);
  };

  function findInLists(id) {
    const inPending = allPending.find((x) => x.id === id); 
    const inAM = scheduleAM.find((x) => x.id === id);
    const inPM = schedulePM.find((x) => x.id === id);
    return { inPending, inAM, inPM };
  }

  function removeFrom(from, id) {
    if (from === "AM") setScheduleAM(prev => prev.filter(x => x.id !== id));
    if (from === "PM") setSchedulePM(prev => prev.filter(x => x.id !== id));
  }

  async function onDropToRow(e, to, targetIndex) {
    e.preventDefault();
    e.stopPropagation();
    const payload = getDrag(e);
    if (!payload?.id) return;
    const { id, from } = payload;

    // 先找出被拖曳的物件
    let draggingItem = allPending.find(x => x.id === id);
    if (!draggingItem) {
        draggingItem = scheduleAM.find(x => x.id === id) || schedulePM.find(x => x.id === id);
    }

    // ✅ 新增檢查：通用 AM/PM 欄位限制 (無論是 REQUEST 還是 APPOINTMENT)
    if (draggingItem) {
        const isItemAM = isMorning(draggingItem.timeSlot);
        const isTargetAM = (to === "AM");

        // 試圖把原本 AM 的項目 (Request=AM 或 Appt=09:30) 拖到 PM
        if (isItemAM && !isTargetAM) {
            alert("⚠️ 該病患指定/原定 [上午 AM] 看診，無法拖曳至下午時段。");
            return;
        }
        // 試圖把原本 PM 的項目 拖到 AM
        if (!isItemAM && isTargetAM) {
            alert("⚠️ 該病患指定/原定 [下午 PM] 看診，無法拖曳至上午時段。");
            return;
        }
    }

    let item;
    let newPending = [...allPending];
    let sourceList = from === "AM" ? [...scheduleAM] : (from === "PM" ? [...schedulePM] : null);

    // 1. 找出 Item 並從來源移除
    if (from === "PENDING") {
      item = allPending.find(x => x.id === id);
      newPending = allPending.filter(x => x.id !== id);
      setAllPending(newPending);
    } else {
      item = sourceList.find(x => x.id === id);
      if (from === to) {
         // 同列表移動：先移除，稍後插入新位置
         sourceList = sourceList.filter(x => x.id !== id);
      } else {
         // 跨列表：從舊列表移除
         removeFrom(from, id);
      }
    }

    if (!item) return;

    // 2. 插入新列表
    let targetList = to === "AM" ? [...scheduleAM] : [...schedulePM];
    if (from === to) targetList = sourceList; // 如果是同列表，使用剛剛 filter 過的 list

    // 修正 Index 邊界
    const idx = targetIndex === null ? targetList.length : Math.max(0, Math.min(targetList.length, targetIndex));
    targetList.splice(idx, 0, item);

    // 3. 觸發更新與重算
    await updateListAndRecalculate(to, targetList);
  }

  // 這是處理 Drop 到空白處 (append 到最後)
  const onDropToList = (e, to) => onDropToRow(e, to, null);

  // --- Save Logic ---
  async function handleAccept() {
    // 合併兩個列表
    const all = [...scheduleAM, ...schedulePM];

    const newItems = all.filter(x => x.type === "REQUEST");
    const existingItems = all.filter(x => x.type === "APPOINTMENT");

    // 重點：使用 eta (09:30) 當作 timeSlot，如果沒有 eta 則退回 slot (AM)
    const getRealTime = (item) => item.eta || item.timeSlot;

    const payload = {
      date: selectedDate,
      newItems: newItems.map((x, i) => ({
        requestId: x.id,
        priority: i + 1, // 根據目前順序給予 priority
        timeSlot: getRealTime(x),
        date: selectedDate 
      })),
      existingItems: existingItems.map((x, i) => ({
        id: x.id,
        priority: i + 1,
        timeSlot: getRealTime(x),
        date: selectedDate 
      }))
    };

    if (onAcceptToBackend) {
      await onAcceptToBackend(payload);
    }
    onClose();
  }
  
  // ✅ 4. Auto Optimize 功能
  async function handleOptimize() {
    if (!selectedDate || !doctorId) {
        alert("Missing Date or Doctor ID");
        return;
    }
    
    const confirmOpt = window.confirm(
      `Start Auto-Optimization?\n\nThis will:\n1. Fetch lat/lon for all patients.\n2. Calculate route based on REAL TRAFFIC.\n3. Re-assign slots automatically (Strict AM/PM).`
    );
    if (!confirmOpt) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/optimize-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          doctorId: doctorId,
          subject: doctorSubject 
        })
      });

      if (!res.ok) throw new Error("Optimization failed: " + res.statusText);
      
      const { AM, PM } = await res.json();

      if (AM.length === 0 && PM.length === 0) {
        alert("No pending requests found for this subject/date to optimize.");
        setLoading(false);
        return;
      }
      
      // Mapping
      const mapToVM = (item) => ({
        id: item.id,
        type: item.type,      
        status: 'OPTIMIZED',  
        date: selectedDate,
        timeSlot: item.timeSlot, 
        subject: doctorSubject,
        priority: item.priority,
        patientId: item.patientId,
        patientName: item.name,
        address: item.address,
        symptoms: item.symptoms,
        eta: item.eta, 
        travelMinutes: item.travelMinutes,
        lat: item.lat,
        lng: item.lng
      });

      setScheduleAM(AM.map(mapToVM));
      setSchedulePM(PM.map(mapToVM));
      setAllPending([]); 

    } catch (e) {
      console.error(e);
      alert("最佳化失敗: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  // Filter pending view by date
  const pendingView = allPending.filter(a => a.date === selectedDate);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 999999, background: "rgba(0,0,0,0.55)",
        display: "flex", justifyContent: "center", alignItems: "center", padding: 18
      }}
    >
      <div style={{
          width: "min(1400px, 95vw)", height: "min(86vh, 920px)",
          background: "white", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          overflow: "hidden", display: "flex", flexDirection: "column"
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {doctorName}’s Scheduler · {doctorSubject}
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{fontWeight: 'bold'}}>Date:</label>
            {/* 日期選擇器 */}
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{padding: 5, borderRadius: 5, border: '1px solid #ccc'}}
            />

            {/* ✅ 補回 Auto Optimize 按鈕 */}
            <button 
                onClick={handleOptimize}
                style={{ 
                    border: "1px solid #1976D2", background: "#E3F2FD", color: "#1976D2", 
                    padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 5, marginLeft: 10
                }}
            >
                Auto Optimize Route
            </button>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ border: "none", background: "#eee", padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 800 }}>
              ✕ Close
            </button>
            <button onClick={handleAccept} style={{ border: "none", background: "#2E7D32", color: "white", padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 900 }}>
              SAVE CHANGES
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "350px 1fr", overflow: "hidden" }}>
          
          {/* Left: Pending */}
          <div style={{ borderRight: "1px solid #eee", overflow: "hidden", display: "flex", flexDirection: "column", background: "#fafafa" }}>
            <div style={{ padding: 14, borderBottom: "1px solid #eee", fontWeight: 900, background: "white" }}>
               Pending ({selectedDate})
            </div>
            <div 
              onDragOver={allowDrop}
              style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
            >
              {pendingView.length === 0 ? (
                <div style={{color: '#999'}}>No pending requests for this date.</div>
              ) : (
                pendingView.map(a => (
                  <Card key={a.id} appt={a} badgeRight="New" draggable onDragStart={(e) => setDrag(e, {from: 'PENDING', id: a.id})} />
                ))
              )}
            </div>
          </div>

          {/* Right: Schedule */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
             <div style={{ padding: 14, borderBottom: "1px solid #eee", fontWeight: 900 }}>
               Schedule for {selectedDate}
             </div>
             <div style={{ flex: 1, overflow: "auto", padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
               <ScheduleColumn title="Morning (AM)" slot="AM" items={scheduleAM} onDropToList={onDropToList} onDropToRow={onDropToRow} />
               <ScheduleColumn title="Afternoon (PM)" slot="PM" items={schedulePM} onDropToList={onDropToList} onDropToRow={onDropToRow} />
             </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Sub-components
function ScheduleColumn({ title, slot, items, onDropToList, onDropToRow }) {
  return (
    <div
      onDragOver={allowDrop}
      onDrop={(e) => onDropToList(e, slot)}
      style={{ 
        border: "1px solid #ddd", 
        borderRadius: 14, 
        background: "white", 
        display: "flex", 
        flexDirection: "column", 
        height: "100%"
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 800, background: "#f5f5f5" }}>
        {title} ({items.length})
      </div>
      {/* 列表容器：加入 overflow-y: auto */}
      <div style={{ 
          padding: 10, 
          display: "flex", 
          flexDirection: "column", 
          gap: 8, 
          flex: 1, 
          overflowY: "auto", // ✅ 加入垂直滾動
          minHeight: 0       // ✅ Flexbox 滾動修復技巧
      }}>
        {items.map((a, idx) => (
           <div key={a.id} onDragOver={allowDrop} onDrop={(e) => onDropToRow(e, slot, idx)}>
             <Card 
               appt={a} 
               badgeRight={a.type === "APPOINTMENT" ? "Existing" : "New"}
               badgeColor={a.type === "APPOINTMENT" ? "#E3F2FD" : "#E8F5E9"}
               textColor={a.type === "APPOINTMENT" ? "#1565C0" : "#2E7D32"}
               draggable 
               onDragStart={(e) => setDrag(e, {from: slot, id: a.id})} 
             />
           </div>
        ))}
        {/* Drop zone at bottom */}
        <div style={{flex: 1, minHeight: 30}} onDragOver={allowDrop} onDrop={(e) => onDropToRow(e, slot, items.length)} />
      </div>
    </div>
  );
}

function Card({ appt, badgeRight, badgeColor, textColor, draggable, onDragStart }) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        border: "1px solid #ddd", borderRadius: 10, padding: 12, background: "white",
        boxShadow: "0 2px 5px rgba(0,0,0,0.05)", cursor: draggable ? "grab" : "default",
        position: "relative"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{appt.patientName}</div>
        <div style={{ fontSize: 11, background: badgeColor || "#eee", color: textColor || "#333", padding: "2px 6px", borderRadius: 4, height: "fit-content" }}>
          {badgeRight}
        </div>
      </div>
      
      <div style={{ fontSize: 13, color: "#444", lineHeight: 1.4 }}>
         <div><b>Loc:</b> {appt.address || "—"}</div>
         <div><b>Sym:</b> {appt.symptoms || "—"}</div>
      </div>

      {/* 顯示計算後的精確時間 (ETA) */}
      {appt.eta && (
        <div style={{ 
            marginTop: 8, padding: "6px", background: "#E3F2FD", borderRadius: 6, 
            fontSize: 13, color: "#0D47A1", fontWeight: "bold", display: "flex", gap: 6
        }}>
           {appt.travelMinutes > 0 && <span>🚗 {appt.travelMinutes} min ➔</span>}
           <span>{appt.eta}</span>
        </div>
      )}

      <div style={{ fontSize: 11, color: "#999", marginTop: 8, paddingTop: 6, borderTop: "1px dashed #eee", display: 'flex', justifyContent: 'space-between' }}>
        <span>ID: {appt.id}</span>
        <span>{appt.date} · {appt.eta || appt.timeSlot}</span>
      </div>
    </div>
  );
}