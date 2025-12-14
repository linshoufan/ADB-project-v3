//
import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";

const AppointmentContext = createContext(null);

export function AppointmentProvider({ children }) {
  const [pendingAppointments, setPendingAppointments] = useState([]);
  const [confirmedAppointments, setConfirmedAppointments] = useState([]);

  // 模擬當前登入的醫生 (實務上應從 AuthContext 取得)
  // 假設目前的醫生是眼科，你可以根據需要修改這裡或由外部傳入
  const [currentDoctorSubject, setCurrentDoctorSubject] = useState("眼科"); 
  const [currentDoctorId, setCurrentDoctorId] = useState("D001"); // 假設醫生 ID

  // 1. 從後端撈取 "Pending" 資料 (根據 Subject 過濾)
  const fetchPending = useCallback(async (subject) => {
    try {
      // 若沒傳 subject，就用預設的
      const subjParams = subject || currentDoctorSubject; 
      const res = await fetch(`http://localhost:5001/api/appointment-requests?status=PENDING&subject=${subjParams}`);
      const data = await res.json();
      setPendingAppointments(data);
    } catch (err) {
      console.error("Error fetching pending:", err);
    }
  }, [currentDoctorSubject]);

  // 初始化時撈取一次
  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // 2. 醫生確認預約 (呼叫後端 API)
  const confirmAppointment = async (params) => {
    // 支援物件解構傳參
    const { id, priority, doctorName, scheduledAt } = params; 

    // 找出原始資料以取得 date 和 timeSlot
    const target = pendingAppointments.find(a => a.id === id);
    if(!target) return;

    // 解析 date 和 timeSlot (假設 scheduledAt 格式為 "YYYY-MM-DD HH:mm")
    const [date, time] = target.scheduledAt.split(" "); 

    try {
      const res = await fetch("http://localhost:5001/api/appointments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: id,
          doctorId: currentDoctorId, // 使用當前醫生 ID
          priority: priority,
          date: date,
          timeSlot: time
        })
      });

      if (res.ok) {
        // 成功後，重新撈取資料以更新畫面
        await fetchPending();
        alert("Appointment Confirmed Successfully!");
      } else {
        alert("Failed to confirm.");
      }
    } catch (err) {
      console.error(err);
      alert("Error confirming appointment.");
    }
  };

  const deleteAppointment = async (id) => {
    if(!window.confirm("Are you sure?")) return;
    try {
        await fetch(`http://localhost:5001/api/appointment-requests/${id}`, { method: 'DELETE' });
        // 刪除後更新列表
        setPendingAppointments(prev => prev.filter(a => a.id !== id));
    } catch (e) {
        console.error(e);
    }
  };

  // 提供設定當前醫生科別的方法，讓 UI 可以切換
  const setDoctorFilter = (subject, doctorId) => {
    setCurrentDoctorSubject(subject);
    setCurrentDoctorId(doctorId);
  };

  const value = useMemo(
    () => ({
      pendingAppointments,
      confirmedAppointments, 
      pending: pendingAppointments, // Alias
      addPending: () => {}, // 前端不需要 addPending 了，由病人端透過 API 新增
      confirmAppointment,
      deleteAppointment,
      setDoctorFilter, // 讓頁面可以設定現在是哪個醫生
      refresh: fetchPending
    }),
    [pendingAppointments, confirmedAppointments, currentDoctorSubject, fetchPending]
  );

  return <AppointmentContext.Provider value={value}>{children}</AppointmentContext.Provider>;
}

export function useAppointments() {
  const ctx = useContext(AppointmentContext);
  if (!ctx) throw new Error("useAppointments must be used within AppointmentProvider");
  return ctx;
}