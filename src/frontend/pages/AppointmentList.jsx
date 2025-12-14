import { useState } from "react";

function slotLabel(slot) {
  if (slot === "AM") return "Morning (09:00–12:00)";
  if (slot === "PM") return "Afternoon (13:00–17:00)";
  return slot || "—";
}

const MOCK_APPOINTMENTS = [
  // {
  //   id: "APP001",
  //   patientId: "B123456789",
  //   doctorName: "Dr. Chen",
  //   date: "2025-12-15",
  //   timeSlot: "AM",
  //   subject: "眼科",
  //   symptoms: "視力模糊",
  //   status: "CONFIRMED",
  // },
  // {
  //   id: "APP002",
  //   patientId: "B123456789",
  //   doctorName: "Dr. Wang",
  //   date: "2025-12-20",
  //   timeSlot: "PM",
  //   subject: "胸腔科",
  //   symptoms: "咳嗽三天",
  //   status: "PENDING",
  // },
];

export default function AppointmentList({viewResults}) {

  return (
    <div>
      <h2>我的預約</h2>

      {viewResults.length === 0 ? (
        <p style={{ color: "#777" }}>目前沒有任何預約。</p>
      ) : (
        viewResults.map((a) => (
          <div
            key={a.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>
                {a.subject} · {a.doctorName}
              </div>

              <div style={{ fontSize: 14, marginTop: 4 }}>
                {a.date || "—"} · {slotLabel(a.timeSlot)}
              </div>

           
              <div style={{ fontSize: 13, color: "#444", marginTop: 6, overflowWrap: "anywhere" }}>
                <b>Location:</b> {a.location}
              </div>
      

              <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                Status: {a.status}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}