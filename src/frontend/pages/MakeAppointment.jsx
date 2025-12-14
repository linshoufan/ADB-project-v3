import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppointments } from "../state/AppointmentContext";

const SUBJECT_OPTIONS = ["眼科", "耳鼻喉科", "胸腔科", "神經外科", "泌尿科"];
const SLOT_OPTIONS = [
  { value: "AM", label: "上午 (09:00–12:00)", start: "09:00", end: "12:00" },
  { value: "PM", label: "下午 (13:00–17:00)", start: "13:00", end: "17:00" },
];

function normalizePid(value) {
  return value.toUpperCase();
}

function isValidTWId(id) {
  return /^[A-Z][0-9]{9}$/.test(id);
}

function todayDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function combineDateSlot(dateStr, slot) {
  if (!dateStr || !slot) return "";
  const label = slot === "AM" ? "上午" : "下午";
  return `${dateStr} ${label}`;
}

export default function MakeAppointment({ onSubmitAppointment }) {
  const navigate = useNavigate();
  const { addPending } = useAppointments();

  const [form, setForm] = useState({
    name: "",             // 原 patientName，對應 User 需求改為 name
    id_card_number: "",   // 原 patientId
    age: "",
    gender: "",           // 新增
    blood_type: "",       // 原 bloodType
    RH_type: "",          // 原 rhesus
    phone: "",            // 原 contact
    address: "",          // 原 location
    date: "",
    slot: "",
    subject: "",
    symptoms: "",
  });

  const [touched, setTouched] = useState({});
  const [submitStatus, setSubmitStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false); // 用於 API 呼叫時顯示狀態

  const apptDateSlot = useMemo(
    () => combineDateSlot(form.date, form.slot),
    [form.date, form.slot]
  );

  const errors = useMemo(() => {
    const e = {};
    if (!form.name.trim()) e.name = "必填：病人姓名";
    if (!form.id_card_number.trim()) e.id_card_number = "必填：身分證字號";
    else if (!isValidTWId(form.id_card_number.trim())) e.id_card_number = "格式錯誤 (1英文+9數字)";
    
    if (!form.age) e.age = "必填：年齡";
    if (!form.gender) e.gender = "必填：性別"; // 新增檢核
    if (!form.blood_type) e.blood_type = "必填：血型";
    if (!form.RH_type) e.RH_type = "必填：Rh";
    if (!form.phone) e.phone = "必填：電話";
    if (!form.address) e.address = "必填：地址";

    if (!form.date) e.date = "必填：日期";
    if (!form.slot) e.slot = "必填：時段";
    if (!form.subject) e.subject = "必填：科別";
    if (!form.symptoms.trim()) e.symptoms = "必填：症狀";

    return e;
  }, [form]);

  const isFormValid = Object.keys(errors).length === 0;
  const fieldError = (key) => (touched[key] ? errors[key] : "");

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === "id_card_number") {
      updateField(name, normalizePid(value));
      return;
    }
    updateField(name, value);
  }

  // 自動帶入資料
  function handleBlur(e) {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    // 這裡不再呼叫後端查詢病人資料
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({
        name: true, id_card_number: true, age: true, gender: true,
        blood_type: true, RH_type: true, phone: true, address: true, 
        date: true, slot: true, subject: true, symptoms: true,
    });

    if (!isFormValid) {
      setSubmitStatus({ type: "error", message: "表單有欄位未完成或格式錯誤。" });
      return;
    }

    setLoading(true);

    try {
        // 準備送給後端的資料
        const apiPayload = {
            id_card_number: form.id_card_number,
            name: form.name,
            age: form.age,
            gender: form.gender, // 新增
            blood_type: form.blood_type,
            RH_type: form.RH_type,
            address: form.address,
            phone: form.phone,
            
            date: form.date,
            timeSlot: form.slot,
            subject: form.subject,
            symptoms: form.symptoms,
        };

        // 呼叫後端 API
        const response = await fetch("http://localhost:5001/api/appointment-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiPayload)
        });

        if (!response.ok) {
            throw new Error("預約請求失敗");
        }
        
        const result = await response.json();
        console.log("Backend response:", result);

        // 更新前端 Context (為了即時顯示在 UI，不一定需要重整)
        const slotMeta = SLOT_OPTIONS.find((s) => s.value === form.slot);
        const contextPayload = {
            appointment: {
                status: "PENDING",
                subject: form.subject,
                date: form.date,
                scheduledAt: form.date,
                timeSlot: form.slot,
                slotStart: slotMeta?.start,
                slotEnd: slotMeta?.end,
                symptoms: form.symptoms.trim(),
            },
            patient: {
                id: form.id_card_number, // 對應 context 顯示習慣
                name: form.name,
                gender: form.gender,
                age: form.age,
                phone: form.phone,
                address: form.address
            },
        };
        const apptId = addPending(contextPayload);

        setSubmitStatus({ type: "success", message: "預約成功！資料已儲存。" });
        
        // 稍作延遲後跳轉或重置
        setTimeout(() => {
             navigate("/patient/confirm", { state: { ...contextPayload, _localApptId: apptId } });
        }, 1000);

    } catch (error) {
        setSubmitStatus({ type: "error", message: "連線錯誤: " + error.message });
    } finally {
        setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {/* 左：表單 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ marginBottom: 12 }}>新增預約</h2>

        {submitStatus.message ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
              background: submitStatus.type === "success" ? "#E8F5E9" : "#FFEBEE",
            }}
          >
            {submitStatus.message}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          {/* 1. 病人姓名 */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
                <FieldRow label="身分證字號" required error={fieldError("id_card_number")}>
                    <input
                    name="id_card_number"
                    value={form.id_card_number}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="B123456789"
                    style={inputStyle}
                    />
                </FieldRow>
            </div>
            <div style={{ flex: 1 }}>
                <FieldRow label="病人姓名" required error={fieldError("name")}>
                    <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="例如：張藝興"
                    style={inputStyle}
                    />
                </FieldRow>
            </div>
          </div>

          {/* 第二排：年齡 & 性別 & 血型 & Rh */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: "80px" }}>
                <FieldRow label="年齡" required error={fieldError("age")}>
                    <input type="number" name="age" value={form.age} onChange={handleChange} onBlur={handleBlur} style={inputStyle} />
                </FieldRow>
            </div>
            <div style={{ width: "90px" }}>
                 {/* 新增性別欄位 */}
                <FieldRow label="性別" required error={fieldError("gender")}>
                    <select name="gender" value={form.gender} onChange={handleChange} onBlur={handleBlur} style={inputStyle}>
                        <option value="">選</option>
                        <option value="M">男</option>
                        <option value="F">女</option>
                        <option value="O">其他</option>
                    </select>
                </FieldRow>
            </div>
            <div style={{ flex: 1 }}>
                <FieldRow label="血型" required error={fieldError("blood_type")}>
                    <select name="blood_type" value={form.blood_type} onChange={handleChange} onBlur={handleBlur} style={inputStyle}>
                        <option value="">請選擇</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="O">O</option>
                        <option value="AB">AB</option>
                    </select>
                </FieldRow>
            </div>
            <div style={{ flex: 1 }}>
                <FieldRow label="Rh" required error={fieldError("RH_type")}>
                    <select name="RH_type" value={form.RH_type} onChange={handleChange} onBlur={handleBlur} style={inputStyle}>
                        <option value="">請選擇</option>
                        <option value="+">+</option>
                        <option value="-">-</option>
                    </select>
                </FieldRow>
            </div>
          </div>

          {/* 第三排：電話 & 地址 */}
          <FieldRow label="聯絡電話" required error={fieldError("phone")}>
             <input name="phone" value={form.phone} onChange={handleChange} onBlur={handleBlur} placeholder="例如：0912-345-678" style={inputStyle} />
          </FieldRow>
          
          <FieldRow label="居住地址" required error={fieldError("address")}>
             <input name="address" value={form.address} onChange={handleChange} onBlur={handleBlur} placeholder="例如：新竹市東區..." style={inputStyle} />
          </FieldRow>

          <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #eee" }} />

          {/* 第四排：日期 & 時段 */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldRow label="預約日期" required error={fieldError("date")}>
                <input type="date" name="date" value={form.date} min={todayDateString()} onChange={handleChange} onBlur={handleBlur} style={inputStyle} />
              </FieldRow>
            </div>
            <div style={{ flex: 1 }}>
              <FieldRow label="看診時段" required error={fieldError("slot")}>
                <select name="slot" value={form.slot} onChange={handleChange} onBlur={handleBlur} style={inputStyle}>
                  <option value="">請選擇</option>
                  {SLOT_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </FieldRow>
            </div>
          </div>

          <FieldRow label="預約科別" required error={fieldError("subject")}>
            <select name="subject" value={form.subject} onChange={handleChange} onBlur={handleBlur} style={inputStyle}>
              <option value="">請選擇</option>
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="症狀描述" required error={fieldError("symptoms")}>
            <textarea
              name="symptoms"
              value={form.symptoms}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="請描述主要症狀..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </FieldRow>

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button type="submit" disabled={!isFormValid || loading} style={buttonStyle}>
              {loading ? "處理中..." : "送出預約"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm({
                  name: "", id_card_number: "", age: "", gender: "", blood_type: "", RH_type: "",
                  phone: "", address: "", date: "", slot: "", subject: "", symptoms: "",
                });
                setTouched({});
                setSubmitStatus({ type: "", message: "" });
              }}
              style={{ ...buttonStyle, background: "#eee" }}
            >
              清空
            </button>
          </div>
        </form>
      </div>

      {/* 右：即時預覽 */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <h3 style={{ marginBottom: 12 }}>預覽</h3>
        <div style={previewCardStyle}>
          <Line label="病人" value={`${form.name || "—"} (${form.id_card_number || "—"})`} />
          <Line label="基本資料" value={form.age ? `${form.age}歲 / ${form.gender} / ${form.blood_type}${form.RH_type}` : "—"} />
          <Line label="聯絡" value={form.phone || "—"} />
          <Line label="地址" value={form.address || "—"} />
          <Line label="時段" value={apptDateSlot || "—"} />
          <Line label="科別" value={form.subject || "—"} />
          <Line label="症狀" value={form.symptoms?.trim() ? form.symptoms : "—"} />
        </div>
      </div>
    </div>
  );
}

// Helper Components 
function FieldRow({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontWeight: 600, fontSize: 14 }}>
          {label} {required ? <span style={{ color: "#C62828" }}>*</span> : null}
        </label>
        {error ? <span style={{ color: "#C62828", fontSize: 12 }}>{error}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid #ccc", fontSize: 14, outline: "none", boxSizing: "border-box",
};

const buttonStyle = {
  padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
};

const previewCardStyle = {
  padding: 14, borderRadius: 14, border: "1px solid #ddd", background: "#fff",
};