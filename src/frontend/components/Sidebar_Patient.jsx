import React from "react";
import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import dashboardIcon from "../asset/image/icon/dashboard.png";
import teamIcon from "../asset/image/icon/team.png";
import webIcon from "../asset/image/icon/web.png";
import pinIcon from "../asset/image/icon/pin.png";
import queryIcon from "../asset/image/icon/query.png";

export default function Sidebar({ brand = 'GoooodEar', dashboardTo = "/patient" }) {
  const navigate = useNavigate();
  const [clickCount, setClickCount] = useState(0);

  // 監聽 clickCount，若使用者停止點擊超過 1 秒，則重置計數
  useEffect(() => {
    if (clickCount === 0) return;
    
    const timer = setTimeout(() => {
      setClickCount(0);
    }, 1000);

    return () => clearTimeout(timer);
  }, [clickCount]);

  const handleSecretClick = () => {
    setClickCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        // 連續點擊 5 次，跳轉至醫生後台 (App.js 中設定的路徑為 "/")
        navigate("/"); 
        return 0;
      }
      return next;
    });
  };
  return (
    <div id="leftSideBar">
      {/*<p style={{ fontWeight: "bold", fontSize: 24, marginBottom: 20 }}>{brand}</p> */}
      {/* 增加 onClick 事件處理秘密通道
          cursor: "pointer" 讓使用者知道這裡可以點（可依需求拿掉以增加隱密性）
          userSelect: "none" 防止連續點擊時選取文字反白 
      */}
      <p 
        onClick={handleSecretClick}
        style={{ 
          fontWeight: "bold", 
          fontSize: 24, 
          marginBottom: 20, 
          cursor: "pointer", 
          userSelect: "none" 
        }}
      >
        {brand}
      </p>

      <SideNavItem to="/patient" icon={dashboardIcon} label="Make Appointment" end/>
      <SideNavItem to="/patient/query" icon={queryIcon} label="Query Appointment" />
      <SideNavItem to="/patient/team" icon={teamIcon} label="TeamInfo" />
      
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

function SideNavItem({ to, icon, label , end}) {
  return (
    <NavLink
      to={to}
      end={end} // <--- 關鍵：將 end 屬性傳遞給 NavLink
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
  padding: "12px 12px",
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
  flexShrink: 0,
  opacity: 0.9,
};

const sideTextStyle = {
  fontSize: 16,
  lineHeight: 1,
};