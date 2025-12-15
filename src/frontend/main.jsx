import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from "react-leaflet";
import L from "leaflet";
import RoutingMachine from "./RoutingMachine";
import "./main.css";
import SidebarDoctor from "./components/Sidebar_Doctor";

import DoctorInboxWidget from "./pages/DoctorInboxWidget";
import DoctorConfirmModal from "./pages/DoctorConfirmModal";
import { useAppointments } from "./state/AppointmentContext";

// Leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

// 定義起始點 (救護車位置)
const START_LOC = { lat: 24.12954082292789, lng: 120.68203882648923 };

// 定義救護車 Icon
const ambulanceIcon = new L.Icon({
  iconUrl: "/ambulance.png", 
  iconSize: [50, 50],
  iconAnchor: [25, 25],
  popupAnchor: [0, -25]
});

export default function Main() {
  const apptCtx = useAppointments() || {};

  const allPending = useMemo(
    () => (Array.isArray(apptCtx.pending) ? apptCtx.pending : []),
    [apptCtx.pending]
  );

  const confirmed = useMemo(
    () => (Array.isArray(apptCtx.confirmed) ? apptCtx.confirmed : []),
    [apptCtx.confirmed]
  );
  const confirmAppointment = apptCtx.confirmAppointment;
  const deleteAppointment = apptCtx.deleteAppointment;

  // UI state
  const [activePanel, setActivePanel] = useState("dashboard"); 
  const [confirmTarget, setConfirmTarget] = useState(null); 

  // Backend states
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]); 
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [routePath, setRoutePath] = useState([]);

  // Modals
  const [showDocModal, setShowDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ name: "", id: "", subject: "眼科" }); 
  const [editingDocId, setEditingDocId] = useState(null);
  const [showConfirmWorkspace, setShowConfirmWorkspace] = useState(false);

  // Schedule 的日期篩選狀態 (預設今天)
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);

  const pending = useMemo(() => {
    if (!selectedDoctor) return allPending;
    return allPending.filter(appt => appt.subject === selectedDoctor.subject);
  }, [allPending, selectedDoctor]);

  const [pendingCnt, setPendingCnt] = useState(pending.length);

  useEffect(() => {
    const eventSource = new EventSource("http://localhost:5001/events");

    eventSource.addEventListener("new-appointment", () => {
      setPendingCnt((prev) => prev + 1);
    });

    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // API Calls
  const fetchDoctors = async () => {
    try {
      const res = await fetch("http://localhost:5001/api/doctors");
      setDoctors(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetch("http://localhost:5001/api/appointments");
      setAppointments(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRoute = async (doctorId, date) => {
    try {
      // 2. 將 date 帶入 URL query
      // 如果 date 是 undefined，就會變成 "undefined" 字串或不帶，建議確保 scheduleDate 有預設值
      const url = `http://localhost:5001/api/route/${doctorId}?date=${date}`;
      const res = await fetch(url);
      const data = await res.json();
      setRoutePath(data);
    } catch (e) {
      console.error("路徑抓取失敗", e);
    }
  };

  useEffect(() => {
    fetchDoctors();
    fetchAppointments();
  }, []);

  useEffect(() => {
    if (selectedDoctor) {
        // 呼叫時傳入當前選擇的日期
        fetchRoute(selectedDoctor.id, scheduleDate);
    } else {
        setRoutePath([]);
    }
  }, [selectedDoctor, scheduleDate]); // 當「醫生」或「日期」改變時，都會重新抓取路徑

  // Doctor CRUD
  const openDocModal = (doc = null) => {
    if (doc) {
      setDocForm({ name: doc.name, id: doc.id, subject: doc.subject || "眼科" });
      setEditingDocId(doc.id);
    } else {
      setDocForm({ name: "", id: "", subject: "眼科" });
      setEditingDocId(null);
    }
    setShowDocModal(true);
  };

    // 醫療用品
  const [supplies, setSupplies] = useState([
      { name: 'Insulin (胰島素)', quantity: 20, unit: '支' },
      { name: 'Antibiotics (抗生素)', quantity: 15, unit: '盒' },
      { name: 'Glucagon (升糖素)', quantity: 5, unit: '支' },
      { name: 'Glucose Meter (血糖機)', quantity: 3, unit: '台' },
      { name: 'BP Monitor (血壓機)', quantity: 4, unit: '台' },
      { name: 'Thermometer (耳溫槍)', quantity: 6, unit: '支' }
  ]);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [supplyForm, setSupplyForm] = useState({ itemName: '', requestQty: 1 });

  const handleSupplyRequest = () => {
        const { itemName, requestQty } = supplyForm;
        if (!itemName || requestQty <= 0) return alert("Please select an item and valid quantity.");

        const targetItem = supplies.find(item => item.name === itemName);
        if (targetItem && parseInt(requestQty) > targetItem.quantity) {
            return alert(`Error: Request quantity exceeds available stock.`);
        }
        const updatedSupplies = supplies.map(item => {
            if (item.name === itemName) return { ...item, quantity: item.quantity - parseInt(requestQty) };
            return item;
        }).filter(item => item.quantity > 0);

        setSupplies(updatedSupplies);
        setShowSupplyModal(false);
        setSupplyForm({ itemName: updatedSupplies[0]?.name || '', requestQty: 1 });
    };

    const openSupplyModal = () => {
        if (supplies.length > 0) setSupplyForm({ itemName: supplies[0].name, requestQty: 1 });
        setShowSupplyModal(true);
    };

  const handleDocSubmit = async () => {
    if (!docForm.name || !docForm.id) return alert("請輸入完整資料");
    const url = editingDocId
      ? `http://localhost:5001/api/doctors/${editingDocId}`
      : "http://localhost:5001/api/doctors";
    const method = editingDocId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docForm),
      });
      if (res.ok) {
        alert((await res.json()).message);
        setShowDocModal(false);
        fetchDoctors();
      }
    } catch (e) {
      alert("操作失敗");
    }
  };

  const handleDeleteDoc = async (targetId, e) => {
    e.stopPropagation();
    if (!window.confirm(`確定刪除?`)) return;
    await fetch(`http://localhost:5001/api/doctors/${targetId}`, { method: "DELETE" });
    fetchDoctors();
  };

  const handleDeleteBackendAppointment = async (apptId) => {
    if (!window.confirm(`確定刪除預約 ${apptId}?`)) return;
    try {
      const res = await fetch(`http://localhost:5001/api/appointments/${apptId}`, { method: "DELETE" });
      if (res.ok) {
        fetchAppointments();
        if (selectedDoctor) fetchRoute(selectedDoctor.id);
      }
    } catch (e) {
      alert("刪除失敗");
    }
  };

  const confirmedAsSchedule = useMemo(() => {
    return confirmed.map((a) => ({
      id: a.id,
      patientName: a.patientName,
      patientId: a.patientId,
      doctorId: null,
      doctorName: a.doctorName || selectedDoctor?.name || "Doctor",
      time: a.scheduledAt,
      scheduledAt: a.scheduledAt,
      location: a.location || "—",
      status: "Confirmed",
    }));
  }, [confirmed, selectedDoctor]);

  const displayedAppointments = useMemo(() => {
    const list = [...appointments, ...confirmedAsSchedule];
    return list.filter((app) => {
      const matchDoctor = selectedDoctor 
          ? (app.doctorId === selectedDoctor.id || app.doctorName === selectedDoctor.name)
          : true;
      const appTimeStr = app.time || app.scheduledAt || "";
      const matchDate = appTimeStr.startsWith(scheduleDate);
      return matchDoctor && matchDate;
    });
  }, [appointments, confirmedAsSchedule, selectedDoctor, scheduleDate]);

  return (
    <div className="main">
      {showConfirmWorkspace && (
        <DoctorConfirmModal
            open={showConfirmWorkspace}
            doctorName={selectedDoctor?.name || "Doctor"}
            doctorId={selectedDoctor?.id || ""}
            doctorSubject={selectedDoctor?.subject || ""} 
            onClose={() => setShowConfirmWorkspace(false)}
            onAcceptToBackend={async (payload) => {
                if (!selectedDoctor) return;
                const { newItems, existingItems } = payload;
                try {
                    for (const item of newItems) {
                        await fetch("http://localhost:5001/api/appointments/confirm", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                requestId: item.requestId,
                                doctorId: selectedDoctor.id,
                                priority: item.priority,
                                date: item.date,
                                timeSlot: item.timeSlot
                            })
                        });
                    }
                    if (existingItems.length > 0) {
                        await fetch("http://localhost:5001/api/appointments/batch-update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ updates: existingItems })
                        });
                    }
                    alert("排程已更新！ (Schedule Updated)");
                    fetchAppointments(); 
                    if (selectedDoctor) fetchRoute(selectedDoctor.id); 
                    if (apptCtx.refresh) apptCtx.refresh(selectedDoctor.subject);
                } catch (e) {
                    console.error(e);
                    alert("更新失敗: " + e.message);
                }
            }}
        />
      )}

      {showDocModal && (
        <Overlay onClose={() => setShowDocModal(false)}>
          <div style={{ ...overlayCardStyle, width: 320 }}>
            <h3 style={{ marginTop: 0 }}>{editingDocId ? "Edit Doctor" : "Add New Doctor"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} placeholder="Name" style={{ padding: 8 }} />
              <input value={docForm.id} onChange={(e) => setDocForm({ ...docForm, id: e.target.value })} placeholder="ID" style={{ padding: 8 }} />
              <select value={docForm.subject} onChange={(e) => setDocForm({ ...docForm, subject: e.target.value })} style={{ padding: 8 }}>
                <option value="眼科">眼科</option>
                <option value="耳鼻喉科">耳鼻喉科</option>
                <option value="胸腔科">胸腔科</option>
                <option value="神經外科">神經外科</option>
                <option value="泌尿科">泌尿科</option>
              </select>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button onClick={() => setShowDocModal(false)}>Cancel</button>
                <button onClick={handleDocSubmit} style={{ background: "#2E7D32", color: "white", border: "none", padding: "8px 10px", borderRadius: 8 }}>Confirm</button>
              </div>
            </div>
          </div>
        </Overlay>
      )}

      <div className="flex-container" id="mainDisplay">
        <SidebarDoctor  />

        {/* Mid Display */}
        <div className="flex-container-vertical" id="midDisplay">
          <div id="midTopDisplay">
            <div className="flex-container">
              
              {/* Column 1 (Left Top & Bottom) */}
              <div className="flex-container-vertical">
                {/* 1. Doctor Status (Moved to Left Top) */}
                <div id="doctorStats" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 15, position: "relative", flex: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: "bold", fontSize: "1.2em" }}>Doctor List:</div>
                      <button onClick={() => openDocModal()} style={{ padding: "4px 8px", backgroundColor: "#2E7D32", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.9em" }}>+ Add</button>
                    </div>

                    <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #ccc", padding: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.8)" }}>
                      {doctors.map((doc, index) => (
                        <div key={index} onClick={() => setSelectedDoctor(doc)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: 8, borderRadius: 6, cursor: "pointer", fontSize: "1.1em", backgroundColor: selectedDoctor?.id === doc.id ? "#c8e6c9" : "transparent", border: selectedDoctor?.id === doc.id ? "2px solid #2E7D32" : "1px solid transparent" }}>
                          <span>{doc.name} <small style={{ fontSize: "0.8em", marginLeft: 5, color: "gray" }}> ({doc.subject || "No Subject"}) </small></span>
                          <div>
                            <button onClick={(e) => { e.stopPropagation(); openDocModal(doc); }} style={{ marginRight: 5, cursor: "pointer", fontSize: "0.9em", padding: "4px 8px" }}>Edit</button>
                            <button onClick={(e) => handleDeleteDoc(doc.id, e)} style={{ color: "red", cursor: "pointer", fontSize: "0.9em", padding: "4px 8px" }}>Del</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedDoctor && (
                      <div style={{ fontSize: "1em", color: "#2E7D32" }}>
                        Viewing Route: <b>{selectedDoctor.name}</b>
                        <button onClick={() => setSelectedDoctor(null)} style={{ marginLeft: 10, cursor: "pointer", padding: "2px 5px" }}>Clear</button>
                      </div>
                    )}
                </div>

                {/* Medical Supplies */}
                  {showSupplyModal && (
                      <div style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                          <div style={{backgroundColor: 'white', padding: '20px', borderRadius: '10px', width: '300px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)'}}>
                              <h3 style={{marginTop: 0, color: '#3D0C02'}}>Request Supplies</h3>
                              <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                  <select value={supplyForm.itemName} onChange={(e) => setSupplyForm({...supplyForm, itemName: e.target.value})} style={{width:'100%', padding:'5px'}}>
                                      {supplies.map((item, i) => (
                                          <option key={i} value={item.name}>{item.name} (剩餘: {item.quantity})</option>
                                      ))}
                                  </select>
                                  <input type="number" min="1" value={supplyForm.requestQty} onChange={(e) => setSupplyForm({...supplyForm, requestQty: e.target.value})} style={{width:'100%', padding:'5px'}} />
                                  <div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                                      <button onClick={() => setShowSupplyModal(false)}>Cancel</button>
                                      <button onClick={handleSupplyRequest} style={{backgroundColor:'#2E7D32', color:'white', border:'none', borderRadius:'5px', padding:'5px 15px'}}>Confirm</button>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}
                  <div className="flex-container" style={{}}>
                    <div id='medicalSupplies' style={{
                        flex: 1, 
                        padding: '15px', 
                        backgroundColor: '#FDFFF5', 
                        borderRadius: '20px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        borderLeft: '5px solid #3AA8C1'
                    }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '2px solid #eee', paddingBottom:'5px' }}>
                            <p style={{fontWeight:'bold', fontSize:'1.1em', margin:0}}>Medical Supplies</p>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', marginTop: '10px', paddingRight: '5px' }}>
                            {supplies.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #ccc', fontSize: '0.95em' }}>
                                    <span>{item.name}</span>
                                    <span style={{ fontWeight: 'bold', color: '#e65100' }}>{item.quantity} {item.unit}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '10px', display:'flex', justifyContent:'flex-end' }}>
                            <button onClick={openSupplyModal} style={{cursor:'pointer', backgroundColor:'#ff9800', color:'white', border:'none', borderRadius:'5px', padding:'6px 12px', fontSize:'0.9em', fontWeight:'bold'}}>+ Request</button>
                        </div>
                    </div>
                  </div>
              </div>

              {/* Column 2 (Right Top & Bottom) */}
              <div className="flex-container-vertical">
                  {/* 3. Inbox Widget (Moved to Right Top) */}
                  <div style={{ flex: 1 }}>
                     <DoctorInboxWidget
                        pendingCount={pendingCnt}
                        scheduledCount={confirmed.length}
                        onClickPending={() => {
                            if (!selectedDoctor) {
                                alert("請先在下方列表中選擇一位醫生 (Select a doctor first)");
                                return;
                            }
                            setShowConfirmWorkspace(true);
                        }}
                     />
                     {activePanel === "confirm" && (
                        <ConfirmPanel
                          pending={pending}
                          onBack={() => setActivePanel("dashboard")}
                          onSelect={(appt) => setConfirmTarget(appt)}
                          onDelete={(id) => { if (typeof deleteAppointment === "function") deleteAppointment(id); }}
                        />
                     )}
                  </div>

                  {/* 4. Next Patient Info (Right Bottom - Replaces Blank Area 2) */}
                  <div style={{ 
                      flex: 2, 
                      backgroundColor: "white", 
                      borderRadius: "20px", 
                      padding: "20px", 
                      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                      overflowY: "auto",
                      border: "1px solid #ddd",
                      borderLeft: "5px solid #2E7D32" // ✅ 修改: 左側綠色線條
                  }}>
                      <NextPatientWidget nextPatient={routePath.length > 0 ? routePath[0] : null} />
                  </div>
              </div>

            </div>
          </div>

          {/* Map */}
          <div id="trafficInfo" style={{ padding: 0, overflow: "hidden" }}>
            <MapContainer center={[24.137, 120.686]} zoom={13} style={{ height: "100%", width: "100%" }}>
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Google Streets">
                  <TileLayer url="http://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" attribution="&copy; Google Maps" />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Google Satellite">
                  <TileLayer url="http://mt0.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}" attribution="&copy; Google Maps" />
                </LayersControl.BaseLayer>
              </LayersControl>

              {/* 加入救護車 (起始點) Marker */}
              <Marker position={[START_LOC.lat, START_LOC.lng]} icon={ambulanceIcon}>
                <Popup>
                  <b>Ambulance Start Point</b>
                </Popup>
              </Marker>

              {routePath.map((stop, idx) => (
                <Marker key={idx} position={[stop.lat, stop.lng]}>
                  <Popup>
                    <b>{stop.name}</b><br />Time: {stop.time}
                  </Popup>
                </Marker>
              ))}

              {/* (A) 紅色線：只有「救護車 -> 第 1 個病人」 */}
              {routePath.length > 0 && (
                <RoutingMachine 
                    routePoints={[START_LOC, routePath[0]]} 
                    color="red" 
                />
              )}

              {/* (B) 藍色線：原本的邏輯，「第 1 個病人 -> 第 2 -> ... -> 最後」 */}
              {/* 只有當病人數大於 1 位時才需要畫這段，否則沒有第 2 個點可以連 */}
              {routePath.length > 1 && (
                 <RoutingMachine 
                    routePoints={routePath} 
                    color="#6FA1EC" 
                 />
              )}
            </MapContainer>
          </div>
        </div>

        {/* Right schedule */}
        <div id="appointInfo" style={{ display: "flex", flexDirection: "column" }}>
          
          <div style={{ marginBottom: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: 22, fontWeight: "bold", margin: 0 }}>
                  {selectedDoctor ? `${selectedDoctor.name}'s Schedule` : "All Schedule"}
                </p>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                     onClick={() => {
                        if (!selectedDoctor) {
                            alert("Please select a doctor first.");
                            return;
                        }
                        setShowConfirmWorkspace(true);
                     }}
                     style={{ padding: "6px 12px", backgroundColor: "#1976D2", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: "bold", fontSize: 14 }}
                  >
                    Adjust
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <label style={{ fontSize: 14, color: '#666', fontWeight: 600 }}>Filter Date:</label>
                 <input 
                    type="date" 
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
                 />
                 <span style={{ fontSize: 12, color: '#999' }}>({displayedAppointments.length} items)</span>
              </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", paddingRight: 5 }}>
            {displayedAppointments.length === 0 ? (
              <p style={{ color: "gray", textAlign: 'center', marginTop: 20 }}>No appointments for {scheduleDate}.</p>
            ) : (
              displayedAppointments.map((appt, i) => {
                const timeText = appt.time || appt.scheduledAt || "";
                let timeShort = timeText;
                if (timeText.includes("T")) {
                    timeShort = timeText.split("T")[1].slice(0, 5); 
                } else if (timeText.includes(" ")) {
                    timeShort = timeText.split(" ")[1]; 
                }
                const isPending = String(appt.status || "").toLowerCase().includes("pending");
                const isLocalCtx = String(appt.id || "").startsWith("APP_");

                return (
                  <div key={i} style={{ display: "flex", marginBottom: 15, position: "relative" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: 10, width: 50 }}>
                      <div style={{ fontSize: 14, fontWeight: "bold" }}>{timeShort}</div>
                      <div style={{ width: 2, flex: 1, backgroundColor: "#333", marginTop: 5 }} />
                      <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: isPending ? "orange" : "#2E7D32", position: "absolute", top: 5, left: 46 }} />
                    </div>
                    <div style={{ flex: 1, border: "2px solid #333", borderRadius: 5, padding: 10, backgroundColor: "white", boxShadow: "2px 2px 0px #333", position: "relative" }}>
                      <div style={{ position: "absolute", top: 5, right: 5 }}>
                        <button
                          onClick={() => {
                            if (isLocalCtx) {
                              if (window.confirm("Delete this appointment?") && typeof deleteAppointment === "function") deleteAppointment(appt.id);
                            } else {
                              handleDeleteBackendAppointment(appt.id);
                            }
                          }}
                          style={{ background: "transparent", border: "none", color: "red", fontWeight: "bold", cursor: "pointer" }}
                        >X</button>
                      </div>
                      <div style={{ fontWeight: "bold", fontSize: 18, borderBottom: "2px solid #333", paddingBottom: 5, marginBottom: 5 }}>
                        {appt.patientName || "Unknown Patient"}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}><b>Sym:</b> {appt.symptoms || "無症狀"}</div>
                        <div><b>Loc:</b> {appt.address || appt.location || "—"}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>ID: {appt.id}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// New Component: Next Patient Info
function NextPatientWidget({ nextPatient }) {
    if (!nextPatient) {
        return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#888" }}>
                <h3 style={{ color: '#333' }}>Next Patient Info</h3>
                <p>No upcoming patient selected.</p>
                <small>Select a doctor to view route.</small>
            </div>
        );
    }

    const { name, patientId, symptoms, blood_type, RH_type, age, phone, gender, time } = nextPatient;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <h3 style={{ marginTop: 0, marginBottom: 15, borderBottom: "2px solid #ccc", paddingBottom: 5, color: "#333" }}>
                Next Patient Info
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "1.1em" }}>
                <InfoRow label="Name" value={name || "—"} />
                <InfoRow label="ID" value={patientId || "—"} />
                <InfoRow label="Gender" value={gender === "M" ? "男" : gender === "F" ? "女" : gender || "—"} /> 
                <InfoRow label="Age" value={age || "—"} />
                <InfoRow label="Blood Type" value={blood_type ? `${blood_type} ${RH_type || ''}` : "—"} />
                <InfoRow label="Symptoms" value={symptoms || "—"} />
                <InfoRow label="Phone" value={phone || "—"} />
                <InfoRow label="ETA" value={time ? time.split(" ")[1] || time : "—"} />
            </div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #eee", paddingBottom: 4 }}>
            <span style={{ fontWeight: "bold", color: "#555" }}>{label}:</span>
            <span style={{ fontWeight: "normal", color: "#333" }}>{value}</span>
        </div>
    );
}

// ... ConfirmPanel, ConfirmRow, Overlay 等元件維持不變 ...
function ConfirmPanel({ pending, onBack, onSelect, onDelete }) {
  const sorted = [...pending].sort((a, b) =>
    String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || ""))
  );

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 900 }}>Confirm Appointments</div>
        <button onClick={onBack}>Back</button>
      </div>

      {sorted.length === 0 ? (
        <div style={{ color: "#777" }}>No pending appointments.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 220, overflowY: "auto" }}>
          {sorted.map((a) => (
            <ConfirmRow key={a.id} appt={a} onReview={() => onSelect(a)} onDelete={() => { if (window.confirm("Delete this appointment?")) onDelete(a.id); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmRow({ appt, onReview, onDelete }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>{appt.patientName} ({appt.patientId}) · {appt.subject}</div>
        <div style={{ fontWeight: 800, color: "#b71c1c" }}>PENDING</div>
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#333" }}>
        <div><b>Time:</b> {String(appt.scheduledAt || "").replace("T", " ")}</div>
        <div><b>Loc:</b> {appt.location || "—"}</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onReview} style={{ padding: "6px 10px", background: "#1565C0", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>Review & Confirm</button>
        <button onClick={onDelete} style={{ padding: "6px 10px", background: "#C62828", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>Delete</button>
      </div>
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

const overlayCardStyle = {
  background: "white", padding: 20, borderRadius: 12, width: 420, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};