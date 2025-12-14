//
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppointments } from "../state/AppointmentContext";

export default function DoctorConfirmAppointments() {
  const nav = useNavigate();
  const { pending, confirmAppointment, deleteAppointment, setDoctorFilter, refresh } = useAppointments();

  // 定義這個頁面代表的醫生資訊 (你可以改成從登入資訊取得)
  // 假設這裡是 "眼科" 醫生
  const myDoctorProfile = {
    id: "D001",
    name: "Dr. Chen",
    subject: "眼科" // 這裡必須跟資料庫存的 subject 一模一樣
  };

  // 一進來就設定過濾器並更新資料
  useEffect(() => {
    setDoctorFilter(myDoctorProfile.subject, myDoctorProfile.id);
    refresh(myDoctorProfile.subject);
  }, []);

  const sortedPending = useMemo(() => {
    // 確保 scheduledAt 存在才 sort
    return [...pending].sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")));
  }, [pending]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Confirm Appointments ({myDoctorProfile.subject})</h2>
        <button onClick={() => nav("/")} style={btnLight}>Back to Main</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Doctor:</div>
        {/* 顯示唯讀，因為這應該是登入者的身分 */}
        <input value={myDoctorProfile.name} disabled style={{ ...input, background: "#f5f5f5" }} />
        <div style={{ color: "#666" }}>Pending: <b>{sortedPending.length}</b></div>
      </div>

      <div style={{ marginTop: 16 }}>
        {sortedPending.length === 0 ? (
          <p style={{ color: "#666" }}>No pending appointments for {myDoctorProfile.subject}.</p>
        ) : (
          sortedPending.map((a) => (
            <PendingCard
              key={a.id}
              appt={a}
              doctorName={myDoctorProfile.name}
              onConfirm={(priority) => confirmAppointment({ id: a.id, priority, doctorName: myDoctorProfile.name })}
              onDelete={() => deleteAppointment(a.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// PendingCard 組件保持不變，或根據需要微調
function PendingCard({ appt, doctorName, onConfirm, onDelete }) {
  const [priority, setPriority] = useState("3");

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>
          {appt.patientName} ({appt.patientId}) · {appt.subject}
        </div>
        <div style={{ fontWeight: 800, color: "#b71c1c" }}>PENDING</div>
      </div>

      <div style={{ marginTop: 8, color: "#333" }}>
        <div><b>Time:</b> {appt.scheduledAt}</div>
        <div><b>Symptoms:</b> {appt.symptoms}</div>
        <div><b>Location:</b> {appt.location}</div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontWeight: 700 }}>Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={input}>
          <option value="1">1 (Most urgent)</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5 (Least urgent)</option>
        </select>

        <button onClick={() => onConfirm(priority)} style={btnPrimary}>Accept & Add to Schedule</button>
        <button onClick={onDelete} style={btnDanger}>Reject</button>
      </div>
    </div>
  );
}

const card = { border: "1px solid #ddd", borderRadius: 12, padding: 14, background: "white", marginBottom: 12 };
const input = { padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc" };
const btnPrimary = { padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "#2E7D32", color: "white", fontWeight: 800 };
const btnDanger = { padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "#C62828", color: "white", fontWeight: 800 };
const btnLight = { padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "white", fontWeight: 800 };