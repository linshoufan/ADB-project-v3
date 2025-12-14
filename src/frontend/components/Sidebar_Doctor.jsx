// src/frontend/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

import dashboardIcon from "../asset/image/icon/dashboard.png";
import teamIcon from "../asset/image/icon/team.png";
import webIcon from "../asset/image/icon/web.png";
import pinIcon from "../asset/image/icon/pin.png";
// import scheduleIcon from "../asset/image/icon/schedule.png";
import equipmentIcon from "../asset/image/icon/equipment.png";

export default function SidebarDoctor({ brand = "MediCare" }) {
  return (
    <div id="leftSideBar">
      <p style={{ fontWeight: "bold", fontSize: 24, marginBottom: 20 }}>
        {brand}
      </p>

      {/* 你的首頁在 App.js 是 "/" */}
      <SideNavItem to="/" icon={dashboardIcon} label="Dashboard" />
      
      {/* 若你尚未建立 TeamInfo 頁面，這個連結點了會沒反應，建議之後將組員的 TeamInfo.jsx 也搬過來 */}
      <SideNavItem to="/team" icon={teamIcon} label="TeamInfo" />
      
      {/* 這是你的 DoctorConfirmModal 或 Scheduler */}
      {/*<SideNavItem to="/scheduler" icon={scheduleIcon} label="Scheduler" />*/}
      
      <SideNavItem to="/equipment" icon={equipmentIcon} label="Equipment" />

      <SideExternalItem
        href="https://www.facebook.com/p/%E9%A1%A7%E8%80%B3%E9%BC%BB%E5%96%89%E7%A7%91%E8%A8%BA%E6%89%80-100083083313210/?locale=zh_TW"
        icon={webIcon}
        label="Facebook"
      />

      <SideExternalItem
        href="https://maps.app.goo.gl/XKSvXYP5oUg7KtdT8"
        icon={pinIcon}
        label="Google Map"
      />
    </div>
  );
}

function SideNavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        ...sideItemStyle,
        background: isActive ? "#E9ECEF" : "transparent",
      })}
    >
      <img src={icon} alt="" style={sideIconStyle} />
      <span style={sideTextStyle}>{label}</span>
    </NavLink>
  );
}

function SideExternalItem({ href, icon, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={sideItemStyle}>
      <img src={icon} alt="" style={sideIconStyle} />
      <span style={sideTextStyle}>{label}</span>
    </a>
  );
}

const sideItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px",
  borderRadius: 14,
  textDecoration: "none",
  color: "#222",
  fontWeight: 800,
  marginBottom: 10,
};

const sideIconStyle = {
  width: 22,
  height: 22,
  objectFit: "contain",
};

const sideTextStyle = {
  fontSize: 16,
};