import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Main from "./frontend/main";
import PatientMain from "./frontend/pages/PatientMain";
import MakeAppointment from "./frontend/pages/MakeAppointment";
import AppointmentConfirmation from "./frontend/pages/AppointmentConfirmation";
import DoctorConfirmAppointments from "./frontend/pages/DoctorConfirmAppointments";
import { AppointmentProvider } from "./frontend/state/AppointmentContext";
import DoctorSchedulerPage from "./frontend/pages/DoctorSchedulerPage";
import TeamInfo from "./frontend/pages/TeamInfo";
import QueryAppointment from "./frontend/pages/QueryAppointment";

export default function App() {
  return (
    <AppointmentProvider>
      <BrowserRouter>
        <Routes>
          {/* 醫生端 */}
          <Route path="/" element={<Main />} />
          <Route
            path="appointments/new"
            element={<MakeAppointment />}
          />

          {/* 獨立的排程頁面 */}
          <Route path="/scheduler" element={<DoctorSchedulerPage />} />

          {/* variant="doctor" 讓 TeamInfo 知道要顯示醫生版 Sidebar */}
          <Route path="/team" element={<TeamInfo variant="doctor" />} />

          {/* 病人端 */}
          <Route path="/patient" element={<PatientMain />} />
          <Route path="/patient/team" element={<TeamInfo variant="patient" />} />
          <Route path="/patient/confirm" element={<AppointmentConfirmation />} />
          <Route path="/patient/query" element={<QueryAppointment />} />

          {/* 醫生確認預約 */}
          <Route path="/confirm" element={<DoctorConfirmAppointments />} />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppointmentProvider>
  );
}