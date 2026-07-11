import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MapContainer, TileLayer, CircleMarker, Popup,
  useMapEvents, useMap, Marker
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../services/api";
import { useSignalR } from "../services/useSignalR";
import { useAuth } from "../services/AuthContext";
import NotificationBell from "../components/NotificationBell";

// ── Brand tokens ─────────────────────────────────────────────
const C = {
  navyPrimary: "#17325A", navySecondary: "#27446E",
  orange: "#F28C28", orangeDark: "#E57200",
  white: "#FFFFFF", offWhite: "#FCFDFF",
  lightGray: "#EAEBEC", gray: "#C8CDD6", critical: "#D1453B",
};

const SEV_COLOR = { 0: C.navySecondary, 1: C.orange, 2: C.orangeDark, 3: C.critical };
const SEV_ICON  = { 0: "✅", 1: "🟡", 2: "🟠", 3: "🔴" };
const CLASS_AR  = {
  "Damaged Road": "طريق تالف", "Normal Road": "طريق سليم",
  "Damaged Home": "مبنى متضرر", "Normal Building": "مباني سليمة",
  "Big Trash": "نفايات كبيرة", "Small Trash": "نفايات صغيرة",
  // legacy keys
  "BIG TRASH": "نفايات كبيرة", "SMALL TRASH": "نفايات صغيرة",
  "NORMAL ROAD": "طريق سليم", "DAMAGED ROAD": "طريق تالف",
  "NORMAL BUILDINGS": "مباني سليمة", "DAMAGED HOME": "مبنى متضرر",
};

const EGYPT_GOVERNORATES = [
  "القاهرة","الجيزة","الإسكندرية","الدقهلية","البحر الأحمر","البحيرة",
  "الفيوم","الغربية","الإسماعيلية","المنوفية","المنيا","القليوبية",
  "الوادي الجديد","السويس","أسوان","أسيوط","بني سويف","بورسعيد",
  "دمياط","الشرقية","جنوب سيناء","كفر الشيخ","مطروح","الأقصر",
  "قنا","شمال سيناء","سوهاج",
];

// ── Custom pin icon ───────────────────────────────────────────
const pinIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${C.orange};
          border:2px solid white;box-shadow:0 0 8px ${C.orange}88"></div>`,
  className: "", iconAnchor: [7, 7],
});

function LocationPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lng], 14, { duration: 1.2 }); }, [target, map]);
  return null;
}

// ── Geocoding helpers ─────────────────────────────────────────

// صندوق إحداثيات يغطي جمهورية مصر العربية بالكامل (left, top, right, bottom)
// بيتستخدم مع bounded=1 عشان نتايج البحث تتقيد بمصر فعلياً بدل ما تشتت
// لنتايج بعيدة، وده بيحسّن دقة الترتيب (relevance) للنتايج القريبة.
const EGYPT_VIEWBOX = "24.6,31.9,37.0,21.9";

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "ar" } }
    );
    const data = await res.json();
    const a = data.address || {};
    return {
      governorate: a.state || a.county || "",
      area: a.suburb || a.city_district || a.town || a.village || a.city || "",
      street: a.road || "",
    };
  } catch { return {}; }
}

// بحث نصي (forward geocoding) بتغطية أفضل لمصر:
// Nominatim (OpenStreetMap) بيبقى ناقص بيانات لشوارع كتير في مصر لأنه
// مصدره بيانات تطوعية (crowd-sourced)، ده حد من حدود مصدر البيانات نفسه
// مش حاجة نقدر نصلّحها بالكامل من الكود. اللي بنقدر نعمله هو نحسّن طريقة
// البحث عشان نلتقط أكبر عدد ممكن من النتايج المتاحة فعلاً:
// 1) بحث عادي بالعربي + "مصر" + تقييد بصندوق إحداثيات مصر.
// 2) لو مفيش نتايج، نجرب من غير "مصر" (بعض الأماكن مسجلة من غيرها).
// 3) لو لسه مفيش نتايج، نجرب بالإنجليزي - كتير من شوارع مصر في
//    OpenStreetMap متسجلة بالإنجليزي بس من غير اسم عربي.
async function forwardGeocode(query) {
  const baseParams =
    `format=json&addressdetails=1&limit=8&countrycodes=eg` +
    `&viewbox=${EGYPT_VIEWBOX}&bounded=1`;

  const tryFetch = async (q, lang) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${baseParams}&q=${encodeURIComponent(q)}&accept-language=${lang}`,
        { headers: { "Accept-Language": lang } }
      );
      return await res.json();
    } catch { return []; }
  };

  let results = await tryFetch(`${query} مصر`, "ar");
  if (!results.length) results = await tryFetch(query, "ar");
  if (!results.length) results = await tryFetch(`${query}, Egypt`, "en");

  return results;
}

export default function UserDashboard() {
  const { user, logout } = useAuth();

  const [messages, setMessages]     = useState([]);
  const [mapPoints, setMapPoints]   = useState([]);
  const [history, setHistory]       = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);

  const [image, setImage]           = useState(null);
  const [imagePreview, setPreview]  = useState(null);
  const [message, setMessage]       = useState("");
  const [chatInput, setChatInput]   = useState("");

  const [locationInfo, setLocInfo]  = useState({ governorate: "", area: "", street: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [pin, setPin]               = useState(null);
  const [flyTarget, setFlyTarget]   = useState(null);
  const [locating, setLocating]     = useState(false);

  const [loading, setLoading]       = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [hasChatted, setHasChatted] = useState(false);
  const [activeTab, setActiveTab]   = useState("report");

  // ── Notifications (bell) ──────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const chatEndRef  = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    api.getMapPoints().then(setMapPoints).catch(() => {});
    api.getMyReports().then(setHistory).catch(() => {});
    api.getNotifications().then(setNotifications).catch(() => {});
    api.getUnreadNotificationCount().then((r) => setUnreadCount(r.count)).catch(() => {});
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── SignalR ───────────────────────────────────────────────
  const onAiReply = useCallback((payload) => {
    setMessages(p => [...p, {
      role: "ai", text: payload.aiReply,
      class: payload.predictedClass,
      severity: payload.severityLabel,
      severityScore: payload.severityScore,
      confidence: payload.confidence,
      damagePercentage: payload.damagePercentage,
      imagePath: payload.imagePath,
    }]);
    setActiveReportId(payload.reportId);
    setLoading(false);
    setHasChatted(true);
    setActiveTab("chat");
    // reload history list
    api.getMyReports().then(setHistory).catch(() => {});
  }, []);

  const onMapUpdate = useCallback((point) => {
    // خريطة اليوزر خاصة: البلاغات الجاية عن طريق البرودكاست بتوصل لكل
    // اليوزرز المتصلين، فلازم نتأكد إن البلاغ ده بتاع اليوزر الحالي بس
    // قبل ما نضيفه للخريطة عنده (الباك إند بيبعت الـ userId مع كل بلاغ جديد)
    if (point.userId && point.userId !== user?.id) return;
    setMapPoints(p => [...p, point]);
  }, [user]);

  const onNewReport = useCallback(() => {}, []);

  // ── NEW: real-time notification (e.g. "report resolved") ──
  const onNotification = useCallback((payload) => {
    setNotifications(p => [payload, ...p]);
    setUnreadCount(p => p + 1);
    // refresh history so the resolved status shows up immediately
    api.getMyReports().then(setHistory).catch(() => {});
  }, []);

  useSignalR(onAiReply, onMapUpdate, onNewReport, onNotification);

  const markNotificationRead = useCallback(async (id) => {
    setNotifications(p => p.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount(p => Math.max(0, p - 1));
    try { await api.markNotificationRead(id); } catch {}
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications(p => p.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try { await api.markAllNotificationsRead(); } catch {}
  }, []);

  // ── Location search (debounced) ────────────────────────────
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    if (val.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await forwardGeocode(val);
      setSearchResults(results);
      setSearching(false);
    }, 500);
  };

  const selectSearchResult = (r) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    setPin({ lat, lng });
    setFlyTarget({ lat, lng });
    setSearchQuery(r.display_name);
    setSearchResults([]);
    reverseGeocode(lat, lng).then(info => setLocInfo(prev => ({ ...prev, ...info })));
  };

  // ── Map click ─────────────────────────────────────────────
  const handlePick = (latlng) => {
    setPin(latlng);
    reverseGeocode(latlng.lat, latlng.lng).then(info => setLocInfo(prev => ({ ...prev, ...info })));
  };

  // ── GPS ───────────────────────────────────────────────────
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPin({ lat, lng });
        setFlyTarget({ lat, lng });
        reverseGeocode(lat, lng).then(info => setLocInfo(prev => ({ ...prev, ...info })));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const locationLabel = [locationInfo.street, locationInfo.area, locationInfo.governorate]
    .filter(Boolean).join("، ");

  const canSubmit = image && pin && locationInfo.governorate;

  // ── Submit report ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (!image || !pin || !locationInfo.governorate) return;
    const fd = new FormData();
    fd.append("image", image);
    fd.append("Message", message || "لا يوجد وصف");
    fd.append("Latitude", pin.lat);
    fd.append("Longitude", pin.lng);
    fd.append("Governorate", locationInfo.governorate);
    fd.append("Area", locationInfo.area || "");
    fd.append("Street", locationInfo.street || "");

    setLoading(true);
    setMessages(p => [...p, {
      role: "user", text: message || "لا يوجد وصف",
      image: imagePreview, location: locationLabel,
    }]);
    setImage(null); setPreview(null); setMessage("");

    try {
      await api.createReport(fd);
    } catch {
      setMessages(p => [...p, { role: "ai", text: "⚠️ حدث خطأ أثناء الإرسال." }]);
      setLoading(false);
    }
  };

  // ── Chat with AI agent ────────────────────────────────────
  const handleChatSend = async () => {
    if (!chatInput.trim() || !activeReportId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages(p => [...p, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await api.sendChat(activeReportId, userMsg);
      setMessages(p => [...p, { role: "ai", text: res.reply }]);
    } catch {
      setMessages(p => [...p, { role: "ai", text: "معلش، حصل خطأ. جرب تاني." }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Switch to report's chat history ──────────────────────
  const openReportChat = async (reportId) => {
    try {
      const chatHistory = await api.getChatHistory(reportId);
      setMessages(chatHistory.map(h => ({
        role: h.role === "assistant" ? "ai" : "user",
        text: h.content,
      })));
      setActiveReportId(reportId);
      setHasChatted(true);
      setActiveTab("chat");
    } catch {}
  };

  return (
    <div className="raqib-dash">
      <style>{`
        .raqib-dash {
          --navy: #17325A; --orange: #F28C28; --orange-d: #E57200;
          --white: #fff; --off: #FCFDFF; --gray: #C8CDD6; --red: #D1453B;
          background: #0b1c33; height: 100vh; display: flex;
          flex-direction: column; font-family: Cairo, sans-serif; box-sizing: border-box;
        }
        .raqib-dash *, .raqib-dash *::before, .raqib-dash *::after { box-sizing: border-box; }

        .logo-mark { position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center; }
        .logo-ring { position:absolute;border-radius:50%;border:1.4px solid var(--orange);opacity:0;animation:lp 2.6s ease-out infinite; }
        .logo-ring.l1{width:30px;height:30px;animation-delay:0s}.logo-ring.l2{width:30px;height:30px;animation-delay:1.3s}
        @keyframes lp{0%{transform:scale(.35);opacity:.9}100%{transform:scale(1.8);opacity:0}}
        .logo-core{width:8px;height:8px;border-radius:50%;background:var(--orange-d,#E57200);z-index:1}
        .brand-name{font-weight:800;letter-spacing:2px;font-size:20px;background:linear-gradient(90deg,var(--off) 0%,var(--off) 40%,var(--orange) 50%,var(--off) 60%,var(--off) 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:sheen 6s ease-in-out infinite}
        @keyframes sheen{0%{background-position:200% 0}65%,100%{background-position:-20% 0}}
        .brand-dot{width:7px;height:7px;border-radius:50%;background:var(--orange);box-shadow:0 0 8px var(--orange);animation:breathe 2.4s ease-in-out infinite}
        @keyframes breathe{0%,100%{box-shadow:0 0 6px var(--orange);transform:scale(1)}50%{box-shadow:0 0 14px var(--orange);transform:scale(1.2)}}

        .rq-nav{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid rgba(200,205,214,.15);background:#0d1f35}
        .rq-nav-l,.rq-nav-r{display:flex;align-items:center;gap:12px}
        .rq-btn-out{font-size:13px;padding:6px 12px;border-radius:8px;background:rgba(200,205,214,.1);color:var(--gray);border:none;cursor:pointer;font-family:inherit}
        .rq-btn-out:hover{opacity:.8}

        .rq-main{flex:1;display:flex;overflow:hidden}
        .rq-left{width:100%;display:flex;flex-direction:column;border-right:1px solid rgba(200,205,214,.15)}
        @media(min-width:1024px){.rq-left{width:40%}}

        .rq-tabs{display:flex;border-bottom:1px solid rgba(200,205,214,.15)}
        .rq-tab{color:var(--gray);border:none;background:none;border-bottom:2px solid transparent;flex:1;padding:12px 0;font-size:14px;font-weight:500;transition:all .15s;cursor:pointer;font-family:inherit}
        .rq-tab.on{color:var(--orange);border-bottom:2px solid var(--orange)}
        .rq-tab:disabled{opacity:.35;cursor:not-allowed}

        .rq-scroll{flex:1;overflow-y:auto;padding:16px}
        .rq-card{background:rgba(39,68,110,.28);border:1px solid rgba(200,205,214,.15);border-radius:16px;padding:16px;margin-bottom:16px}
        .rq-eyebrow{font-size:10.5px;letter-spacing:1.5px;color:var(--orange);margin-bottom:4px}
        .rq-title{font-weight:700;color:var(--white);margin:0 0 12px}
        .rq-label{display:block;font-size:12px;margin-bottom:6px;color:var(--gray)}
        .rq-input,.rq-select,.rq-textarea{width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(200,205,214,.2);background:rgba(13,31,53,.6);color:var(--off);font-size:13.5px;outline:none;transition:border-color .15s;font-family:inherit}
        .rq-input:focus,.rq-select:focus,.rq-textarea:focus{border-color:var(--orange);box-shadow:0 0 0 3px rgba(242,140,40,.15)}
        .rq-input::placeholder,.rq-textarea::placeholder{color:rgba(200,205,214,.45)}
        .rq-select option{color:#000}
        .rq-textarea{resize:vertical}
        .rq-field{margin-bottom:12px}

        .rq-search-wrap{position:relative}
        .rq-search-results{position:absolute;top:100%;right:0;left:0;z-index:2000;background:#0d1f35;border:1px solid rgba(242,140,40,.3);border-radius:10px;max-height:200px;overflow-y:auto;margin-top:4px}
        .rq-search-item{padding:10px 14px;font-size:13px;color:var(--off);cursor:pointer;border-bottom:1px solid rgba(200,205,214,.1);direction:rtl}
        .rq-search-item:hover{background:rgba(242,140,40,.1);color:var(--orange)}
        .rq-search-item:last-child{border-bottom:none}

        .rq-ghost{border:1px solid rgba(242,140,40,.35);border-radius:10px;color:var(--orange);background:rgba(242,140,40,.08);transition:background .15s;cursor:pointer;font-family:inherit;padding:10px 0;width:100%;font-size:14px}
        .rq-ghost:hover{background:rgba(242,140,40,.16)}
        .rq-ghost:disabled{opacity:.45;cursor:not-allowed}

        .rq-pin-chip{font-size:12px;padding:8px 12px;border-radius:10px;display:flex;align-items:center;gap:8px;background:rgba(242,140,40,.08);border:1px solid rgba(242,140,40,.25);color:var(--orange);margin-bottom:12px}

        .rq-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;border-radius:12px;padding:32px 0;margin-bottom:12px;border:1.5px dashed rgba(242,140,40,.4);background:rgba(13,31,53,.4)}
        .rq-hidden{display:none}
        .rq-img-wrap{position:relative;width:100%;margin-bottom:12px}
        .rq-img-wrap img{width:100%;height:176px;object-fit:cover;border-radius:12px;display:block}
        .rq-img-rm{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;font-size:12px;display:flex;align-items:center;justify-content:center;background:var(--red);color:white;border:none;cursor:pointer}

        .rq-primary{border:none;border-radius:10px;font-weight:700;color:#1a1103;background:linear-gradient(135deg,var(--orange),var(--orange-d,#E57200));box-shadow:0 8px 18px rgba(242,140,40,.22);transition:transform .12s;cursor:pointer;font-family:inherit;width:100%;padding:12px 0;font-size:14px}
        .rq-primary:hover:not(:disabled){transform:translateY(-1px)}
        .rq-primary:disabled{opacity:.45;cursor:not-allowed}

        .chat-scroll{display:flex;flex-direction:column;gap:10px}
        .rq-msg{display:flex}.rq-msg.u{justify-content:flex-end}.rq-msg.a{justify-content:flex-start}
        .rq-bubble{max-width:320px;border-radius:18px;padding:12px;font-size:14px;color:var(--off)}
        .rq-bubble.u{background:rgba(200,205,214,.12)}
        .rq-bubble.a{background:rgba(13,31,53,.7);border:1px solid rgba(200,205,214,.15)}
        .rq-bubble.res{border:1px solid rgba(242,140,40,.3);background:linear-gradient(135deg,rgba(242,140,40,.08),rgba(39,68,110,.35));animation:reveal .45s ease-out both}
        @keyframes reveal{0%{opacity:0;transform:translateY(8px) scale(.98)}100%{opacity:1;transform:none}}
        .rq-res-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(200,205,214,.15)}
        .rq-res-class{font-weight:700;font-size:12px}.rq-res-conf{font-size:12px;margin-right:auto;color:var(--gray)}
        .rq-msg-img{border-radius:12px;margin-bottom:8px;width:100%;object-fit:cover;max-height:160px;display:block}
        .rq-msg-loc{font-size:12px;margin-bottom:4px;color:var(--gray)}
        .rq-msg-txt{white-space:pre-line;line-height:1.6;margin:0}
        .rq-dots-row{display:flex;justify-content:flex-start}
        .rq-dots{border-radius:18px;padding:12px 20px;background:rgba(13,31,53,.7);border:1px solid rgba(200,205,214,.15);display:flex;gap:6px}
        .rq-dot{width:8px;height:8px;border-radius:50%;background:var(--orange);animation:bounce 1.1s infinite}
        @keyframes bounce{0%,80%,100%{transform:translateY(0);opacity:.6}40%{transform:translateY(-6px);opacity:1}}

        .rq-composer{padding:14px;display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(200,205,214,.15)}
        .rq-composer-row{display:flex;gap:8px}
        .rq-attach{flex-shrink:0;cursor:pointer;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(200,205,214,.1)}
        .rq-send{flex-shrink:0;width:40px;height:40px;border:none;border-radius:10px;font-size:16px;cursor:pointer;background:linear-gradient(135deg,var(--orange),var(--orange-d,#E57200));display:flex;align-items:center;justify-content:center}
        .rq-send:disabled{opacity:.35;cursor:not-allowed}

        .rq-hist-empty{text-align:center;padding:48px 0;color:var(--gray)}
        .rq-hist-card{border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;background:rgba(39,68,110,.28);border:1px solid rgba(200,205,214,.15);margin-bottom:10px;cursor:pointer;transition:border-color .15s}
        .rq-hist-card:hover{border-color:rgba(242,140,40,.4)}
        .rq-hist-top{display:flex;align-items:center;justify-content:space-between}
        .rq-hist-class{font-size:12px;font-weight:700}
        .rq-hist-status{font-size:12px;padding:2px 8px;border-radius:999px;background:rgba(200,205,214,.12);color:var(--gray)}
        .rq-hist-loc{font-size:12px;color:var(--orange);margin:0}
        .rq-hist-msg{font-size:14px;color:var(--gray);margin:0}
        .rq-hist-date{font-size:12px;color:rgba(200,205,214,.5);margin:0}
        .rq-hist-chat-btn{font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid rgba(242,140,40,.35);color:var(--orange);background:rgba(242,140,40,.08);cursor:pointer;font-family:inherit}

        .rq-map{display:none;flex:1;position:relative}
        @media(min-width:1024px){.rq-map{display:block}}
        .rq-legend{position:absolute;bottom:24px;right:24px;z-index:1000;border-radius:12px;padding:14px;background:rgba(13,31,53,.88);border:1px solid rgba(200,205,214,.15);backdrop-filter:blur(8px)}
        .rq-leg-title{font-size:12px;font-weight:700;margin:0 0 8px;color:var(--gray)}
        .rq-leg-row{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .rq-leg-dot{width:11px;height:11px;border-radius:50%}
        .rq-leg-label{font-size:12px;color:var(--gray)}
        .rq-map-badge{position:absolute;top:16px;right:16px;z-index:1000;background:rgba(13,31,53,.88);border:1px solid rgba(242,140,40,.3);border-radius:10px;padding:6px 12px}
        .rq-eyebrow-sm{font-size:10px;letter-spacing:1.5px;color:var(--orange)}
        .leaflet-popup-content-wrapper{background:#0d1f35!important;border:1px solid #1e3a5f!important;color:#e2e8f0!important;border-radius:12px!important}
        .leaflet-popup-tip{background:#0d1f35!important}
      `}</style>

      {/* ── Navbar ── */}
      <nav className="rq-nav">
        <div className="rq-nav-l">
          <div className="logo-mark">
            <span className="logo-ring l1"/><span className="logo-ring l2"/>
            <span className="logo-core"/>
          </div>
          <span className="brand-name">RAQIB</span>
        </div>
        <div className="rq-nav-r" dir="rtl">
          <span style={{ display:"flex",alignItems:"center",gap:8,fontSize:14,color:C.gray }}>
            <span className="brand-dot"/> أهلاً، {user?.fullName}
          </span>
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />
          <button onClick={logout} className="rq-btn-out">خروج</button>
        </div>
      </nav>

      <div className="rq-main">
        {/* ── Left panel ── */}
        <div className="rq-left">
          <div className="rq-tabs">
            <button onClick={() => setActiveTab("report")} className={`rq-tab ${activeTab==="report"?"on":""}`}>بلاغ جديد</button>
            <button onClick={() => hasChatted && setActiveTab("chat")} disabled={!hasChatted}
                    className={`rq-tab ${activeTab==="chat"?"on":""}`}>المحادثة</button>
            <button onClick={() => setActiveTab("history")} className={`rq-tab ${activeTab==="history"?"on":""}`}>السجل</button>
          </div>

          {/* ── Report wizard ── */}
          {activeTab === "report" && (
            <div className="rq-scroll" dir="rtl">
              <div className="rq-card">
                <div className="rq-eyebrow">LOCATION_DATA</div>
                <h3 className="rq-title">موقع المشكلة</h3>

                {/* Search box */}
                <div className="rq-field rq-search-wrap">
                  <label className="rq-label">ابحث عن موقع</label>
                  <input className="rq-input" value={searchQuery}
                         onChange={e => handleSearchChange(e.target.value)}
                         placeholder="اكتب اسم المدينة أو الشارع..." />
                  {searching && <div style={{fontSize:12,color:C.gray,marginTop:4}}>جارٍ البحث...</div>}
                  {searchResults.length > 0 && (
                    <div className="rq-search-results">
                      {searchResults.map((r,i) => (
                        <div key={i} className="rq-search-item" onClick={() => selectSearchResult(r)}>
                          {r.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rq-field">
                  <label className="rq-label">المحافظة</label>
                  <select className="rq-select" value={locationInfo.governorate}
                          onChange={e => setLocInfo(p => ({...p, governorate: e.target.value}))}>
                    <option value="">اختر المحافظة</option>
                    {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="rq-field">
                  <label className="rq-label">المنطقة / الحي</label>
                  <input className="rq-input" value={locationInfo.area}
                         onChange={e => setLocInfo(p => ({...p, area: e.target.value}))}
                         placeholder="مثال: مدينة نصر" />
                </div>
                <div className="rq-field">
                  <label className="rq-label">الشارع</label>
                  <input className="rq-input" value={locationInfo.street}
                         onChange={e => setLocInfo(p => ({...p, street: e.target.value}))}
                         placeholder="مثال: شارع مصطفى النحاس" />
                </div>

                <button onClick={useMyLocation} disabled={locating} className="rq-ghost" style={{marginBottom:12}}>
                  {locating ? "جارٍ تحديد موقعك..." : "📍 استخدم موقعي الحالي"}
                </button>

                {pin && (
                  <div className="rq-pin-chip">
                    <span>📍</span>
                    <span>{locationLabel || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}</span>
                  </div>
                )}
                <p style={{fontSize:12,color:C.gray,margin:0}}>أو انقر على الخريطة لتثبيت الموقع بدقة.</p>
              </div>

              <div className="rq-card">
                <div className="rq-eyebrow">IMAGE_ANALYSIS</div>
                <h3 className="rq-title">صورة المشكلة</h3>

                {imagePreview ? (
                  <div className="rq-img-wrap">
                    <img src={imagePreview} alt="preview"/>
                    <button onClick={() => {setImage(null);setPreview(null);}} className="rq-img-rm">✕</button>
                  </div>
                ) : (
                  <label className="rq-dropzone">
                    <span style={{fontSize:24}}>📷</span>
                    <span style={{fontSize:14,color:C.gray}}>اضغط لرفع صورة المشكلة</span>
                    <input type="file" accept="image/*" className="rq-hidden"
                           onChange={e => { const f=e.target.files[0]; if(f){setImage(f);setPreview(URL.createObjectURL(f));} }} />
                  </label>
                )}

                <textarea className="rq-textarea" rows={2} value={message}
                          onChange={e => setMessage(e.target.value)}
                          placeholder="اكتب وصفاً مختصراً للمشكلة (اختياري)"
                          style={{marginBottom:12}}/>

                <button onClick={handleSubmit} disabled={loading || !canSubmit} className="rq-primary">
                  {loading ? "جارٍ تحليل الصورة..." : "إرسال البلاغ للتحليل"}
                </button>
                {!canSubmit && !loading && (
                  <p style={{fontSize:12,textAlign:"center",marginTop:8,color:C.gray}}>
                    حدد المحافظة والموقع وارفع صورة أولاً
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Chat ── */}
          {activeTab === "chat" && (
            <>
              <div className="rq-scroll chat-scroll">
                {messages.map((m,i) => {
                  const isRes = m.role==="ai" && m.class;
                  return (
                    <div key={i} className={`rq-msg ${m.role==="user"?"u":"a"}`} dir="rtl">
                      <div className={`rq-bubble ${m.role==="user"?"u":"a"} ${isRes?"res":""}`}>
                        {m.image && <img src={m.image} alt="" className="rq-msg-img"/>}
                        {m.location && <p className="rq-msg-loc">📍 {m.location}</p>}
                        {isRes && (
                          <div className="rq-res-hdr">
                            <span>{SEV_ICON[m.severityScore]}</span>
                            <span className="rq-res-class" style={{color:SEV_COLOR[m.severityScore]}}>
                              {CLASS_AR[m.class] || m.class}
                            </span>
                            <span className="rq-res-conf">{(m.confidence*100).toFixed(0)}% ثقة</span>
                          </div>
                        )}
                        <p className="rq-msg-txt">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
                {(loading || chatLoading) && (
                  <div className="rq-dots-row" dir="rtl">
                    <div className="rq-dots">
                      {[0,1,2].map(i=><div key={i} className="rq-dot" style={{animationDelay:`${i*.15}s`}}/>)}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef}/>
              </div>

              <div className="rq-composer" dir="rtl">
                <div className="rq-composer-row">
                  <label className="rq-attach">
                    📷
                    <input type="file" accept="image/*" className="rq-hidden"
                           onChange={e => { const f=e.target.files[0]; if(f){setImage(f);setPreview(URL.createObjectURL(f));setActiveTab("report");} }} />
                  </label>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                         placeholder="اسأل الـ AI عن البلاغ..."
                         className="rq-input" style={{flex:1}}
                         onKeyDown={e => e.key==="Enter" && handleChatSend()} />
                  <button onClick={handleChatSend}
                          disabled={chatLoading || !chatInput.trim() || !activeReportId}
                          className="rq-send">➤</button>
                </div>
              </div>
            </>
          )}

          {/* ── History ── */}
          {activeTab === "history" && (
            <div className="rq-scroll" dir="rtl">
              {history.length === 0 && <p className="rq-hist-empty">لا توجد بلاغات بعد</p>}
              {history.map(r => (
                <div key={r.id} className="rq-hist-card" onClick={() => openReportChat(r.id)}>
                  <div className="rq-hist-top">
                    <span className="rq-hist-class" style={{color:SEV_COLOR[r.severityScore]}}>
                      {SEV_ICON[r.severityScore]} {CLASS_AR[r.predictedClass] || r.predictedClass || "—"}
                    </span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span className="rq-hist-status">{r.status}</span>
                      <span className="rq-hist-chat-btn">فتح المحادثة 💬</span>
                    </div>
                  </div>
                  {(r.governorate || r.area || r.street) && (
                    <p className="rq-hist-loc">
                      📍 {[r.street, r.area, r.governorate].filter(Boolean).join("، ")}
                    </p>
                  )}
                  <p className="rq-hist-msg">{r.message}</p>
                  <p className="rq-hist-date">
                    {new Date(r.createdAt).toLocaleDateString("ar-EG", {dateStyle:"medium"})}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Map panel ── */}
        <div className="rq-map">
          <MapContainer center={[26.8, 30.8]} zoom={6}
                        style={{height:"100%",width:"100%",background:"#0b1c33"}}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <LocationPicker onPick={handlePick}/>
            <FlyTo target={flyTarget}/>

            {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon}><Popup>موقع البلاغ المحدد</Popup></Marker>}

            {mapPoints.map((p,i) => (
              <CircleMarker key={i} center={[p.latitude, p.longitude]}
                            radius={8 + (p.countInArea||0)*3}
                            pathOptions={{color:SEV_COLOR[p.severityScore],fillColor:SEV_COLOR[p.severityScore],fillOpacity:.4,weight:2}}>
                <Popup>
                  <div dir="rtl">
                    <p style={{fontWeight:700,margin:0}}>{CLASS_AR[p.predictedClass]||p.predictedClass}</p>
                    <p style={{margin:"2px 0 0"}}>الخطورة: {p.severityLabel}</p>
                    {p.governorate && <p style={{margin:"2px 0 0"}}>المحافظة: {p.governorate}</p>}
                    {p.area && <p style={{margin:"2px 0 0"}}>المنطقة: {p.area}</p>}
                    <p style={{margin:"2px 0 0"}}>عدد البلاغات في المنطقة: {p.countInArea}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          <div className="rq-map-badge"><span className="rq-eyebrow-sm">LIVE_MAP</span></div>

          <div className="rq-legend" dir="rtl">
            <p className="rq-leg-title">مستوى الخطورة</p>
            {[{l:"منعدمة",c:SEV_COLOR[0]},{l:"منخفضة",c:SEV_COLOR[1]},{l:"متوسطة",c:SEV_COLOR[2]},{l:"عالية",c:SEV_COLOR[3]}].map(x=>(
              <div key={x.l} className="rq-leg-row">
                <div className="rq-leg-dot" style={{background:x.c}}/>
                <span className="rq-leg-label">{x.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
