import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Box,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import EmergencyRoundedIcon from "@mui/icons-material/EmergencyRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import { api } from "../services/api";
import { useSignalR } from "../services/useSignalR";
import { useAuth } from "../services/AuthContext";
import DashboardCard from "../components/DashboardCard";
import PdfReportModal from "../components/PdfReportModal";
import {
  CategoryBarChart,
  GovernorateBarChart,
  InsightPill,
  SeverityPieChart,
  StatChip,
  TimelineChart,
} from "../components/AnalyticsCharts";

const C = { navySecondary: "#27446E", orange: "#F28C28", orangeDark: "#E57200", white: "#FFFFFF", offWhite: "#FCFDFF", gray: "#C8CDD6", critical: "#D1453B" };
const STATUS_AR = { Pending: "قيد الانتظار", InProgress: "قيد التنفيذ", Resolved: "تم الحل", Rejected: "مرفوض" };
const STATUS_ORDER = ["Pending", "InProgress", "Resolved", "Rejected"];
const SEV_COLOR = { 0: C.navySecondary, 1: C.orange, 2: C.orangeDark, 3: C.critical };
const CLASS_AR = { "Damaged Road": "طريق تالف", "Normal Road": "طريق سليم", "Damaged Home": "مبنى متضرر", "Normal Building": "مباني سليمة", "Big Trash": "نفايات كبيرة", "Small Trash": "نفايات صغيرة", "BIG TRASH": "نفايات كبيرة", "SMALL TRASH": "نفايات صغيرة", "NORMAL ROAD": "طريق سليم", "DAMAGED ROAD": "طريق تالف", "NORMAL BUILDINGS": "مباني سليمة", "DAMAGED HOME": "مبنى متضرر" };

const ZONE_COLOR = (cls) => {
  if (!cls) return C.navySecondary;
  const lc = cls.toLowerCase();
  if (lc.includes("trash")) return "#ef4444";
  if (lc.includes("road")) return "#3b82f6";
  if (lc.includes("home") || lc.includes("building")) return "#22c55e";
  return C.orange;
};

const sortReports = (list) => [...list].sort((a, b) => (b.severityScore ?? 0) - (a.severityScore ?? 0) || new Date(b.createdAt) - new Date(a.createdAt));
const formatNumber = (value) => (value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(value >= 10 ? 0 : 1));
const formatPercent = (value) => (value == null || Number.isNaN(value) ? "—" : `${Number(value).toFixed(1)}%`);

// ── RTL cache for Emotion (MUI's underlying CSS engine) ──
// theme.direction alone only flips *logic* (e.g. Menu anchor math). It does
// NOT flip the generated CSS itself, which is why the Select/TextField label
// notch was rendering on the wrong side and overlapping the date inputs.
// This cache makes Emotion actually mirror the CSS output for RTL.
const rtlCache = createCache({
  key: "muirtl",
  stylisPlugins: [prefixer, rtlPlugin],
});

// ── Dark RAQIB-themed MUI instance ──
// Without this, MUI falls back to its default *light* theme: Select/TextField/
// Menu render with near-black text and a white dropdown panel, which is
// unreadable against our navy background. This makes every MUI component in
// the tree (filters, table Select, PDF modal, charts' tooltips, etc.) pick up
// the brand palette automatically instead of overriding each one by hand.
const muiTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "dark",
    primary: { main: C.orange, dark: C.orangeDark, contrastText: "#1a1103" },
    background: { paper: "#0d1f35", default: "#0b1c33" },
    text: { primary: C.offWhite, secondary: C.gray },
    divider: "rgba(200,205,214,.18)",
  },
  typography: { fontFamily: "Cairo, sans-serif" },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none", backgroundColor: "#0d1f35" } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "#0d1f35",
          border: "1px solid rgba(200,205,214,.18)",
          boxShadow: "0 16px 32px rgba(2,8,23,.45)",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: C.offWhite,
          fontSize: 13.5,
          "&:hover": { backgroundColor: "rgba(242,140,40,.12)" },
          "&.Mui-selected": { backgroundColor: "rgba(242,140,40,.16)" },
          "&.Mui-selected:hover": { backgroundColor: "rgba(242,140,40,.22)" },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { color: C.offWhite, backgroundColor: "rgba(13,31,53,.55)" },
        notchedOutline: { borderColor: "rgba(200,205,214,.22)" },
      },
    },
    MuiInputBase: {
      styleOverrides: { input: { color: C.offWhite } },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: C.gray,
          backgroundColor: "transparent",
          "&.Mui-focused": { color: C.orange },
        },
      },
    },
    MuiSelect: {
      styleOverrides: { icon: { color: C.gray } },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: "rgba(200,205,214,.12)" } },
    },
    MuiChip: {
      styleOverrides: { root: { fontFamily: "Cairo, sans-serif" } },
    },
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: "rgba(39,68,110,.35)" } },
    },
  },
});

function StatCard({ icon, label, value, color }) {
  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3.5,
        p: { xs: 2.1, md: 2.4 },
        minHeight: 128,
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, rgba(39,68,110,.54) 0%, rgba(13,31,53,.84) 100%)",
        border: "1px solid rgba(200,205,214,.16)",
        boxShadow: "0 18px 40px rgba(2,8,23,.24)",
        transition: "transform 220ms ease, box-shadow 220ms ease",
        "&:hover": { transform: "translateY(-3px)", boxShadow: "0 24px 48px rgba(2,8,23,.32)" },
      }}
      dir="rtl"
    >
      <Box sx={{ position: "absolute", inset: 0, background: `radial-gradient(circle at top right, ${color}22 0%, transparent 45%)`, pointerEvents: "none" }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.4, position: "relative" }}>
        <Box sx={{ width: 44, height: 44, borderRadius: 2.4, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}1A`, border: `1px solid ${color}30`, color, boxShadow: `inset 0 1px 0 ${color}15` }}>
          {icon}
        </Box>
        <Box sx={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 0 6px ${color}20` }} />
      </Stack>
      <Box sx={{ position: "relative" }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: C.white, lineHeight: 1.1, mb: 0.45 }}>
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: C.gray }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [mapPoints, setMapPoints] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [alerts, setAlerts] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [highlightIds, setHighlightIds] = useState(() => new Set());
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ governorate: "", area: "", disasterType: "", severity: "", status: "", fromDate: "", toDate: "" });
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(() => new Set());
  const HIGHLIGHT_MS = 6000;

  const load = useCallback(async () => {
    setLoading(true);
    const [r, m] = await Promise.allSettled([api.getAllReports(), api.getMapPoints()]);
    if (r.status === "fulfilled") setReports(sortReports(r.value));
    if (m.status === "fulfilled") setMapPoints(m.value);
    const failed = [r, m].filter((x) => x.status === "rejected");
    if (failed.length) {
      setLoadError("تعذر تحميل بعض البيانات.");
    } else {
      setLoadError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismissToast = (id) => setToasts((p) => p.filter((t) => t.id !== id));
  const pushToast = useCallback((text) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((p) => [...p, { id, text }]);
    setTimeout(() => dismissToast(id), 6000);
  }, []);

  const onMapUpdate = useCallback((p) => {
    const stamped = { ...p, _key: `${Date.now()}-${Math.random()}`, _isNew: true };
    setMapPoints((prev) => [...prev, stamped]);
    setTimeout(() => setMapPoints((prev) => prev.map((pt) => (pt._key === stamped._key ? { ...pt, _isNew: false } : pt))), HIGHLIGHT_MS);
  }, []);

  const onNewReport = useCallback((p) => {
    setAlerts((prev) => [{ ...p, time: new Date() }, ...prev.slice(0, 9)]);
    const row = { id: p.reportId ?? p.id, userName: p.userName, governorate: p.governorate, area: p.area, street: p.street, latitude: p.latitude, longitude: p.longitude, predictedClass: p.predictedClass, severityScore: p.severityScore, severityLabel: p.severityLabel, status: p.status ?? "Pending", createdAt: p.createdAt ?? new Date().toISOString(), damagePercentage: p.damagePercentage, confidence: p.confidence };
    setReports((prev) => sortReports([row, ...prev.filter((r) => r.id !== row.id)]));
    setHighlightIds((prev) => {
      const n = new Set(prev);
      n.add(row.id);
      return n;
    });
    setTimeout(() => setHighlightIds((prev) => {
      const n = new Set(prev);
      n.delete(row.id);
      return n;
    }), HIGHLIGHT_MS);
    if ((p.severityScore ?? 0) >= 3) pushToast(`🚨 بلاغ حرج: ${CLASS_AR[p.predictedClass] || p.predictedClass} — ${p.userName || "مستخدم"}`);
    load();
  }, [load, pushToast]);

  useSignalR(() => {}, onMapUpdate, onNewReport);

  const tabs = [{ id: "overview", label: " نظرة عامة" }, { id: "map", label: " الخريطة" }, { id: "reports", label: " البلاغات" }];

  const filteredReports = useMemo(() => reports.filter((report) => {
    const createdAt = report.createdAt ? new Date(report.createdAt) : null;
    const from = filters.fromDate ? new Date(filters.fromDate) : null;
    const to = filters.toDate ? new Date(filters.toDate) : null;
    if (from && createdAt && createdAt < from) return false;
    if (to && createdAt) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      if (createdAt > endOfDay) return false;
    }
    if (filters.governorate && (report.governorate || "") !== filters.governorate) return false;
    if (filters.area && (report.area || "") !== filters.area) return false;
    if (filters.disasterType && (report.predictedClass || "") !== filters.disasterType) return false;
    if (filters.severity) {
      const selected = Number(filters.severity);
      if (Number(report.severityScore ?? 0) !== selected) return false;
    }
    if (filters.status && (report.status || "") !== filters.status) return false;
    return true;
  }), [filters, reports]);

  const governorateOptions = useMemo(() => [...new Set(reports.map((r) => r.governorate).filter(Boolean))].sort(), [reports]);
  const areaOptions = useMemo(() => [...new Set(reports.map((r) => r.area).filter(Boolean))].sort(), [reports]);
  const disasterTypeOptions = useMemo(() => [...new Set(reports.map((r) => r.predictedClass).filter(Boolean))].sort(), [reports]);
  const statusOptions = useMemo(() => [...new Set(reports.map((r) => r.status).filter(Boolean))].sort(), [reports]);

  const summary = useMemo(() => {
    const total = filteredReports.length;
    const active = filteredReports.filter((r) => !["Resolved", "Rejected"].includes(r.status || "")).length;
    const resolved = filteredReports.filter((r) => (r.status || "") === "Resolved").length;
    const highSeverity = filteredReports.filter((r) => Number(r.severityScore ?? 0) >= 3).length;
    const avgConfidence = total ? filteredReports.reduce((sum, r) => sum + Number(r.confidence ?? 0), 0) / total : 0;
    const avgDamage = total ? filteredReports.reduce((sum, r) => sum + Number(r.damagePercentage ?? 0), 0) / total : 0;
    const avgSeverity = total ? filteredReports.reduce((sum, r) => sum + Number(r.severityScore ?? 0), 0) / total : 0;
    const classCount = filteredReports.reduce((acc, r) => {
      const key = r.predictedClass || "غير محدد";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const mostCommonType = Object.entries(classCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const governorateCount = filteredReports.reduce((acc, r) => {
      const key = r.governorate || "غير محدد";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const highestRiskGovernorate = Object.entries(governorateCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const severityCount = filteredReports.reduce((acc, r) => {
      const key = Number(r.severityScore ?? 0) >= 3 ? "High" : Number(r.severityScore ?? 0) >= 2 ? "Medium" : Number(r.severityScore ?? 0) >= 1 ? "Low" : "None";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const timeline = Object.entries(filteredReports.reduce((acc, report) => {
      const day = report.createdAt ? new Date(report.createdAt).toISOString().slice(0, 10) : "غير محدد";
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ name: day.slice(5), value }));
    const governorates = Object.entries(governorateCount).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, value]) => ({ name, value }));
    const categories = Object.entries(classCount).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, value]) => ({ name, value }));
    const severitySeries = Object.entries(severityCount).map(([name, value]) => ({ name, value }));
    const topRiskAreas = Object.entries(filteredReports.reduce((acc, report) => {
      const key = `${report.governorate || "غير محدد"}::${report.area || "غير محدد"}`;
      if (!acc[key]) {
        acc[key] = { governorate: report.governorate || "غير محدد", area: report.area || "غير محدد", reports: 0, severity: 0, damage: 0 };
      }
      acc[key].reports += 1;
      acc[key].severity += Number(report.severityScore ?? 0);
      acc[key].damage += Number(report.damagePercentage ?? 0);
      return acc;
    }, {})).map(([, item]) => ({ ...item, averageSeverity: item.severity / item.reports, averageDamage: item.damage / item.reports })).sort((a, b) => b.reports - a.reports).slice(0, 8);
    const recentHighSeverity = filteredReports.filter((r) => Number(r.severityScore ?? 0) >= 3).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
    const insights = [];
    if (total) {
      if (highSeverity / total >= 0.35) insights.push({ label: "الخطورة", value: "نسبة البلاغات الحرجة مرتفعة", icon: "🚨" });
      if (mostCommonType !== "—") insights.push({ label: "الأكثر تكراراً", value: `${mostCommonType}`, icon: "🧭" });
      if (timeline.length > 1) {
        const last = timeline[timeline.length - 1]?.value ?? 0;
        const first = timeline[0]?.value ?? 0;
        if (last > first) insights.push({ label: "الاتجاه", value: "البلاغات تتزايد خلال آخر فترة", icon: "📈" });
      }
      if (highestRiskGovernorate !== "—") insights.push({ label: "المحافظة الأبرز", value: highestRiskGovernorate, icon: "📍" });
    }
    return { total, active, resolved, highSeverity, avgConfidence, avgDamage, avgSeverity, mostCommonType, highestRiskGovernorate, governorates, categories, severitySeries, timeline, topRiskAreas, recentHighSeverity, insights };
  }, [filteredReports]);

  const applyChartFilter = (type, value) => {
    setFilters((prev) => {
      if (type === "governorate") return { ...prev, governorate: prev.governorate === value ? "" : value };
      if (type === "severity") return { ...prev, severity: prev.severity === String(value) ? "" : String(value) };
      if (type === "disasterType") return { ...prev, disasterType: prev.disasterType === value ? "" : value };
      if (type === "date") {
        const same = prev.fromDate === value && prev.toDate === value;
        return { ...prev, fromDate: same ? "" : value, toDate: same ? "" : value };
      }
      return prev;
    });
  };

  const resetFilters = () => setFilters({ governorate: "", area: "", disasterType: "", severity: "", status: "", fromDate: "", toDate: "" });

  // ── NEW: change a report's status. Backend auto-notifies + emails the user when set to Resolved ──
  const handleStatusChange = async (reportId, newStatus) => {
    setStatusUpdating((prev) => new Set(prev).add(reportId));
    try {
      await api.updateStatus(reportId, newStatus);
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r)));
      if (newStatus === "Resolved") {
        pushToast(` تم حل البلاغ #${reportId} — تم إشعار المستخدم وإرسال إيميل تأكيد.`);
      } else {
        pushToast(`تم تحديث حالة البلاغ #${reportId} إلى "${STATUS_AR[newStatus] || newStatus}"`);
      }
    }
     catch (err) {
  console.error(err);

  if (err.response) {
    console.log(err.response.data);
    console.log(err.response.status);
  }

  pushToast(`تعذر تحديث حالة البلاغ #${reportId}`);
}
     finally {
      setStatusUpdating((prev) => {
        const n = new Set(prev);
        n.delete(reportId);
        return n;
      });
    }
  };

  return (
    <CacheProvider value={rtlCache}>
    <ThemeProvider theme={muiTheme}>
    <div className="raqib-admin">
      <style>{`
        .raqib-admin{--o:#F28C28;--od:#E57200;--gray:#C8CDD6;--off:#FCFDFF;--red:#D1453B;min-height:100vh;background:#0b1c33;font-family:Cairo,sans-serif;box-sizing:border-box}
        .raqib-admin *{box-sizing:border-box}
        @keyframes rqp{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes lp{0%{transform:scale(.35);opacity:.9}100%{transform:scale(1.8);opacity:0}}
        @keyframes sheen{0%{background-position:200% 0}65%,100%{background-position:-20% 0}}
        @keyframes toast-in{0%{opacity:0;transform:translateY(-8px)}100%{opacity:1;transform:none}}
        .logo-mark{position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center}
        .logo-ring{position:absolute;border-radius:50%;border:1.4px solid var(--o);opacity:0;animation:lp 2.6s ease-out infinite}
        .logo-ring.l1{width:30px;height:30px}.logo-ring.l2{width:30px;height:30px;animation-delay:1.3s}
        .logo-core{width:8px;height:8px;border-radius:50%;background:var(--od);z-index:1}
        .brand-name{font-weight:800;letter-spacing:2px;font-size:20px;background:linear-gradient(90deg,var(--off) 0%,var(--off) 40%,var(--o) 50%,var(--off) 60%,var(--off) 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:sheen 6s ease-in-out infinite}
        .rq-nav{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid rgba(200,205,214,.15);background:#0d1f35}
        .rq-nav-l,.rq-nav-r{display:flex;align-items:center;gap:12px}
        .rq-btn-out{font-size:13px;padding:6px 12px;border-radius:8px;background:rgba(200,205,214,.1);color:var(--gray);border:none;cursor:pointer;font-family:inherit}
        .rq-toast-stack{position:fixed;top:20px;left:20px;z-index:3000;display:flex;flex-direction:column;gap:10px;max-width:340px}
        .rq-toast{border-radius:12px;padding:12px 14px;font-size:13px;color:var(--off);background:rgba(13,31,53,.95);border:1px solid rgba(209,69,59,.5);box-shadow:0 10px 24px rgba(0,0,0,.35);display:flex;align-items:flex-start;gap:10px;animation:toast-in .25s ease-out both}
        .rq-toast-close{background:none;border:none;color:var(--gray);cursor:pointer;font-size:13px}
        .rq-content{max-width:1440px;margin:0 auto;padding:24px 24px 40px}
        .rq-tabs{display:flex;gap:8px;margin-bottom:24px;border-bottom:1px solid rgba(200,205,214,.15)}
        .rq-tab{padding:10px 16px;font-size:14px;font-weight:600;background:none;cursor:pointer;border:none;border-bottom:2px solid transparent;color:var(--gray);transition:all .2s ease;font-family:inherit;border-radius:999px 999px 0 0}
        .rq-tab:hover{color:var(--off);background:rgba(242,140,40,.08)}
        .rq-tab.on{color:var(--o);border-bottom-color:var(--o);background:rgba(242,140,40,.1)}
        .rq-section{display:flex;flex-direction:column;gap:22px}
        .rq-err-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:12px;margin-bottom:20px;font-size:13px;background:rgba(209,69,59,.12);border:1px solid rgba(209,69,59,.35);color:var(--off)}
        .rq-ghost{border:1px solid rgba(242,140,40,.35);border-radius:10px;color:var(--o);background:rgba(242,140,40,.08);transition:background .15s;cursor:pointer;font-family:inherit;padding:8px 16px;font-size:13px}
        .rq-alerts-card{border-radius:16px;padding:20px;background:rgba(39,68,110,.28);border:1px solid rgba(209,69,59,.3)}
        .rq-alert-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(200,205,214,.12)}
        .rq-alert-row:last-child{border-bottom:none}
        .rq-map-card{border-radius:16px;overflow:hidden;height:65vh;position:relative}
        .rq-map-legend{position:absolute;bottom:20px;right:20px;z-index:1000;border-radius:12px;padding:14px 16px;background:rgba(13,31,53,.88);border:1px solid rgba(200,205,214,.15);backdrop-filter:blur(8px)}
        .rq-map-leg-title{font-size:12px;font-weight:700;color:var(--gray);margin:0 0 8px}
        .rq-map-leg-row{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .rq-map-leg-dot{width:11px;height:11px;border-radius:50%}.rq-map-leg-label{font-size:12px;color:var(--gray)}
        .rq-table-card{border-radius:16px;overflow:hidden;border:1px solid rgba(200,205,214,.15)}
        .rq-table{width:100%;font-size:13px;border-collapse:collapse}
        .rq-table thead tr{background:rgba(13,31,53,.9);border-bottom:1px solid rgba(200,205,214,.15)}
        .rq-table th{padding:12px 14px;text-align:right;font-weight:500;color:var(--gray)}
        .rq-table td{padding:11px 14px;border-bottom:1px solid rgba(15,32,50,.7)}
        .rq-table tr.odd{background:rgba(8,14,28,.4)}.rq-table tr.even{background:transparent}
        .rq-table tr.hi{background:rgba(209,69,59,.16)!important;animation:flash 1.4s ease-in-out 3}
        @keyframes flash{0%,100%{background-color:rgba(209,69,59,.16)}50%{background-color:rgba(209,69,59,.32)}}
        .rq-pill{padding:2px 10px;border-radius:999px;font-size:12px}
        .rq-pill-sev{font-weight:700}.rq-pill-status{background:rgba(200,205,214,.14);color:var(--gray)}
        .rq-td-id{font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(200,205,214,.5)}
        .leaflet-popup-content-wrapper{background:#0d1f35!important;border:1px solid #1e3a5f!important;color:#e2e8f0!important;border-radius:12px!important}
        .leaflet-popup-tip{background:#0d1f35!important}
      `}</style>

      {toasts.length > 0 && (
        <div className="rq-toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className="rq-toast" dir="rtl">
              <span style={{ flex: 1, lineHeight: 1.5 }}>{t.text}</span>
              <button className="rq-toast-close" onClick={() => dismissToast(t.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <nav className="rq-nav">
        <div className="rq-nav-l">
          <div className="logo-mark"><span className="logo-ring l1" /><span className="logo-ring l2" /><span className="logo-core" /></div>
          <span className="brand-name">RAQIB Admin</span>
        </div>
        <div className="rq-nav-r" dir="rtl">
          {alerts.length > 0 && (
            <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setActiveTab("reports")}>
              <span style={{ fontSize: 20 }}>🔔</span>
              <span style={{ position: "absolute", top: -4, right: -6, width: 16, height: 16, borderRadius: "50%", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: C.critical, color: "white" }}>{alerts.length}</span>
            </div>
          )}
          <button onClick={() => setPdfModalOpen(true)} className="rq-btn-out" style={{ display: "flex", alignItems: "center", gap: 6, color: C.orange, border: "1px solid rgba(242,140,40,.3)", background: "rgba(242,140,40,.08)" }}>
            <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} /> تحميل تقرير PDF
          </button>
          <button onClick={logout} className="rq-btn-out">خروج</button>
        </div>
      </nav>

      <div className="rq-content">
        <div className="rq-tabs" dir="rtl">
          {tabs.map((t) => <button key={t.id} onClick={() => setActiveTab(t.id)} className={`rq-tab ${activeTab === t.id ? "on" : ""}`}>{t.label}</button>)}
        </div>

        {loadError && (
          <div className="rq-err-banner" dir="rtl">
            <span>{loadError}</span>
            <button className="rq-ghost" onClick={load}>إعادة المحاولة</button>
          </div>
        )}

        {activeTab === "overview" && (
          <div className="rq-section" dir="rtl">
            <Grid container spacing={2.2} alignItems="stretch">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <Skeleton variant="rectangular" height={128} sx={{ borderRadius: 3 }} />
                  </Grid>
                ))
              ) : (
                <>
                  <Grid item xs={12} sm={6} md={4} sx={{ display: "flex" }}><StatCard icon={<AnalyticsRoundedIcon />} label="إجمالي البلاغات" value={summary.total} color={C.navySecondary} /></Grid>
                  <Grid item xs={12} sm={6} md={4} sx={{ display: "flex" }}><StatCard icon={<TimelineRoundedIcon />} label="قيد التنفيذ" value={summary.active} color={C.orange} /></Grid>
                  <Grid item xs={12} sm={6} md={4} sx={{ display: "flex" }}><StatCard icon={<ShieldRoundedIcon />} label="تم الحل" value={summary.resolved} color={C.orangeDark} /></Grid>
                  <Grid item xs={12} sm={6} md={4} sx={{ display: "flex" }}><StatCard icon={<EmergencyRoundedIcon />} label="بلاغات عالية الخطورة" value={summary.highSeverity} color={C.critical} /></Grid>
                  <Grid item xs={12} sm={6} md={4} sx={{ display: "flex" }}><StatCard icon={<AutoAwesomeRoundedIcon />} label="متوسط ثقة الذكاء الاصطناعي" value={`${formatNumber(summary.avgConfidence)}%`} color="#4F8EF7" /></Grid>
                  <Grid item xs={12} sm={6} md={4} sx={{ display: "flex" }}><StatCard icon={<TrendingUpRoundedIcon />} label="متوسط نسبة الضرر" value={formatPercent(summary.avgDamage)} color="#34C759" /></Grid>
                </>
              )}
            </Grid>

            <DashboardCard title="مرشحات التحليل" subtitle="تصفية العرض حسب الموقع، النوع، الدرجة والحالة" icon={<FilterListRoundedIcon sx={{ color: C.orange }} />}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 1.2, pt: 1 }}>
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel id="gov-filter">المحافظة</InputLabel>
                  <Select labelId="gov-filter" value={filters.governorate} label="المحافظة" onChange={(e) => setFilters((p) => ({ ...p, governorate: e.target.value }))}>
                    <MenuItem value="">الكل</MenuItem>
                    {governorateOptions.map((gov) => <MenuItem key={gov} value={gov}>{gov}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel id="area-filter">المنطقة</InputLabel>
                  <Select labelId="area-filter" value={filters.area} label="المنطقة" onChange={(e) => setFilters((p) => ({ ...p, area: e.target.value }))}>
                    <MenuItem value="">الكل</MenuItem>
                    {areaOptions.map((area) => <MenuItem key={area} value={area}>{area}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel id="type-filter">نوع الكارثة</InputLabel>
                  <Select labelId="type-filter" value={filters.disasterType} label="نوع الكارثة" onChange={(e) => setFilters((p) => ({ ...p, disasterType: e.target.value }))}>
                    <MenuItem value="">الكل</MenuItem>
                    {disasterTypeOptions.map((type) => <MenuItem key={type} value={type}>{CLASS_AR[type] || type}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel id="severity-filter">الخطورة</InputLabel>
                  <Select labelId="severity-filter" value={filters.severity} label="الخطورة" onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))}>
                    <MenuItem value="">الكل</MenuItem>
                    <MenuItem value="3">عالية</MenuItem>
                    <MenuItem value="2">متوسطة</MenuItem>
                    <MenuItem value="1">منخفضة</MenuItem>
                    <MenuItem value="0">بدون</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel id="status-filter">الحالة</InputLabel>
                  <Select labelId="status-filter" value={filters.status} label="الحالة" onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                    <MenuItem value="">الكل</MenuItem>
                    {statusOptions.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap flexWrap="wrap">
                <TextField size="small" label="من تاريخ" type="date" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ flex: 1, minWidth: 180 }} />
                <TextField size="small" label="إلى تاريخ" type="date" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ flex: 1, minWidth: 180 }} />
                <Chip label="إعادة تعيين" icon={<RestartAltRoundedIcon />} onClick={resetFilters} sx={{ color: C.orange, borderColor: "rgba(242,140,40,.35)", border: "1px solid", background: "rgba(242,140,40,.08)", cursor: "pointer", height: 40 }} />
              </Stack>
            </DashboardCard>

            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap>
              <DashboardCard title="الاستنتاجات الذكية" subtitle="أهم الاتجاهات والتنبؤات المبنية على البيانات الحالية" icon={<InsightsRoundedIcon sx={{ color: C.orange }} />} sx={{ flex: 1 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} useFlexGap flexWrap="wrap">
                  {summary.insights.length ? summary.insights.map((item) => <InsightPill key={item.label} label={item.label} value={item.value} icon={item.icon} />) : <Typography variant="body2" sx={{ color: C.gray }}>لا توجد استنتاجات متاحة بعد التصفية الحالية.</Typography>}
                </Stack>
              </DashboardCard>
              <DashboardCard title="المقاييس الذكية" subtitle="تحليل AI ودرجة المخاطرة" icon={<AssessmentRoundedIcon sx={{ color: C.orange }} />} sx={{ flex: 1 }}>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} sm={6}><StatChip label="متوسط الثقة" value={`${formatNumber(summary.avgConfidence)}%`} color="#4F8EF7" /></Grid>
                  <Grid item xs={12} sm={6}><StatChip label="متوسط نسبة الضرر" value={formatPercent(summary.avgDamage)} color="#34C759" /></Grid>
                  <Grid item xs={12} sm={6}><StatChip label="متوسط درجة الخطورة" value={formatNumber(summary.avgSeverity)} color={C.orange} /></Grid>
                  <Grid item xs={12} sm={6}><StatChip label="أكثر نوع كارثة" value={summary.mostCommonType} color={C.critical} /></Grid>
                </Grid>
              </DashboardCard>
            </Stack>

            <Grid container spacing={2.2}>
              <Grid item xs={12} lg={6}><DashboardCard title="بلاغات حسب المحافظة" subtitle="انقر على العمود لتصفية المحافظة" icon={<TimelineRoundedIcon sx={{ color: C.orange }} />}><GovernorateBarChart data={summary.governorates} onBarClick={(value) => applyChartFilter("governorate", value)} /></DashboardCard></Grid>
              <Grid item xs={12} lg={6}><DashboardCard title="توزيع الخطورة" subtitle="انقر على القطاع لتصفية الدرجة" icon={<WarningAmberRoundedIcon sx={{ color: C.orange }} />}><SeverityPieChart data={summary.severitySeries} onSliceClick={(value) => applyChartFilter("severity", value === "High" ? 3 : value === "Medium" ? 2 : value === "Low" ? 1 : 0)} /></DashboardCard></Grid>
              <Grid item xs={12} lg={6}><DashboardCard title="اتجاه البلاغات عبر الزمن" subtitle="انقر على المنحنى لتصفية الفترة" icon={<TimelineRoundedIcon sx={{ color: C.orange }} />}><TimelineChart data={summary.timeline} onPointClick={(value) => applyChartFilter("date", value)} /></DashboardCard></Grid>
              <Grid item xs={12} lg={6}><DashboardCard title="الفئات الرئيسية" subtitle="انقر على الشريط لتصفية نوع الكارثة" icon={<AssessmentRoundedIcon sx={{ color: C.orange }} />}><CategoryBarChart data={summary.categories} onBarClick={(value) => applyChartFilter("disasterType", value)} /></DashboardCard></Grid>
            </Grid>

            <Grid container spacing={2.2}>
              <Grid item xs={12} xl={8}><DashboardCard title="خريطة تركيز البلاغات" subtitle="تمثيل بصري للكثافة حسب المحافظة" icon={<InsightsRoundedIcon sx={{ color: C.orange }} />}><Grid container spacing={1.25}>{summary.governorates.length ? summary.governorates.map((item) => <Grid item xs={6} sm={4} md={3} key={item.name}><Box sx={{ p: 1.5, borderRadius: 2.5, background: "rgba(13,31,53,0.72)", border: "1px solid rgba(200,205,214,0.12)", minHeight: 92 }}><Typography variant="caption" sx={{ color: C.gray, display: "block", mb: 0.6 }}>{item.name}</Typography><Box sx={{ width: "100%", height: 10, borderRadius: 999, background: `linear-gradient(90deg, ${C.orange} ${(item.value / Math.max(...summary.governorates.map((gov) => gov.value), 1)) * 100}%, rgba(255,255,255,0.08) 0%)`, mb: 1 }} /><Typography variant="body1" sx={{ color: "#fff", fontWeight: 700 }}>{item.value} بلاغ</Typography></Box></Grid>) : <Grid item xs={12}><Typography variant="body2" sx={{ color: C.gray }}>لا توجد بيانات لعرضها في هذه الفترة.</Typography></Grid>}</Grid></DashboardCard></Grid>
              <Grid item xs={12} xl={4}><DashboardCard title="أعلى المناطق خطورة" subtitle="أهم المناطق بناءً على عدد البلاغات والمتوسط" icon={<WarningAmberRoundedIcon sx={{ color: C.orange }} />}><TableContainer><Table size="small"><TableHead><TableRow><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>المحافظة</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>المنطقة</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>البلاغات</TableCell></TableRow></TableHead><TableBody>{summary.topRiskAreas.map((item) => <TableRow key={`${item.governorate}-${item.area}`}><TableCell sx={{ color: "#fff", borderBottom: "1px solid rgba(200,205,214,.08)" }}>{item.governorate}</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.08)" }}>{item.area}</TableCell><TableCell sx={{ color: C.orange, fontWeight: 700, borderBottom: "1px solid rgba(200,205,214,.08)" }}>{item.reports}</TableCell></TableRow>)}</TableBody></Table></TableContainer></DashboardCard></Grid>
            </Grid>

            <Grid container spacing={2.2}>
              <Grid item xs={12} xl={7}><DashboardCard title="أحدث البلاغات عالية الخطورة" subtitle="أحدث الحالات التي تتطلب متابعة سريعة" icon={<WarningAmberRoundedIcon sx={{ color: C.orange }} />}><TableContainer><Table size="small"><TableHead><TableRow><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>المحافظة</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>المنطقة</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>الخطورة</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.12)" }}>الحالة</TableCell></TableRow></TableHead><TableBody>{summary.recentHighSeverity.length ? summary.recentHighSeverity.map((report) => <TableRow key={report.id}><TableCell sx={{ color: "#fff", borderBottom: "1px solid rgba(200,205,214,.08)" }}>{report.governorate || "—"}</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.08)" }}>{report.area || "—"}</TableCell><TableCell sx={{ color: SEV_COLOR[report.severityScore] || C.critical, fontWeight: 700, borderBottom: "1px solid rgba(200,205,214,.08)" }}>{report.severityLabel || "High"}</TableCell><TableCell sx={{ color: C.gray, borderBottom: "1px solid rgba(200,205,214,.08)" }}>{report.status || "Pending"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} sx={{ color: C.gray, py: 2 }}>لا توجد تقارير عالية الخطورة ضمن التصفية.</TableCell></TableRow>}</TableBody></Table></TableContainer></DashboardCard></Grid>
              <Grid item xs={12} xl={5}><DashboardCard title="تنبيهات مباشرة" subtitle="أحدث البلاغات الواردة" icon={<WarningAmberRoundedIcon sx={{ color: C.orange }} />}>{alerts.length > 0 ? alerts.slice(0, 6).map((a, i) => <div key={i} className="rq-alert-row"><span style={{ color: SEV_COLOR[a.severityScore], fontSize: 14 }}>●</span><span style={{ fontSize: 14, color: "#fff" }}>{CLASS_AR[a.predictedClass] || a.predictedClass}</span>{a.governorate && <span style={{ fontSize: 12, color: C.orange }}>📍 {a.governorate}</span>}<span style={{ fontSize: 12, marginRight: "auto", color: C.gray }}>{a.time?.toLocaleTimeString("ar-EG")}</span></div>) : <Typography variant="body2" sx={{ color: C.gray }}>لا توجد تنبيهات جديدة الآن.</Typography>}</DashboardCard></Grid>
            </Grid>
          </div>
        )}

        {activeTab === "map" && (
          <div className="rq-map-card">
            <MapContainer center={[26.8, 30.8]} zoom={6} style={{ height: "100%", width: "100%" }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; CARTO" />
              {mapPoints.map((p, i) => {
                const zoneColor = ZONE_COLOR(p.predictedClass);
                return (
                  <CircleMarker key={p._key || i} center={[p.latitude, p.longitude]} radius={12 + (p.countInArea || 0) * 4} pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.35, weight: p._isNew ? 4 : 2 }}>
                    <Popup>
                      <div dir="rtl">
                        <p style={{ fontWeight: 700, margin: 0 }}>{CLASS_AR[p.predictedClass] || p.predictedClass}</p>
                        <p style={{ margin: "2px 0 0" }}>الخطورة: <span style={{ color: SEV_COLOR[p.severityScore] }}>{p.severityLabel}</span></p>
                        {p.governorate && <p style={{ margin: "2px 0 0" }}>المحافظة: {p.governorate}</p>}
                        {p.area && <p style={{ margin: "2px 0 0" }}>المنطقة: {p.area}</p>}
                        <p style={{ margin: "2px 0 0" }}>عدد البلاغات: {p.countInArea}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
            <div className="rq-map-legend" dir="rtl">
              <p className="rq-map-leg-title">نوع المشكلة</p>
              {[{ label: "نفايات (Red Zone)", color: "#ef4444" }, { label: "طرق (Blue Zone)", color: "#3b82f6" }, { label: "مباني (Green Zone)", color: "#22c55e" }].map((x) => (
                <div key={x.label} className="rq-map-leg-row">
                  <div className="rq-map-leg-dot" style={{ background: x.color }} /><span className="rq-map-leg-label">{x.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="rq-table-card" dir="rtl">
            <table className="rq-table">
              <thead>
                <tr>
                  {["#", "اليوزر", "المحافظة", "المنطقة", "الشارع", "المشكلة", "نسبة الضرر", "الخطورة", "الحالة", "التاريخ"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((r, i) => (
                  <tr key={r.id} className={`${i % 2 ? "odd" : "even"} ${highlightIds.has(r.id) ? "hi" : ""}`}>
                    <td className="rq-td-id">#{r.id}</td>
                    <td style={{ color: "#fff" }}>{r.userName || "—"}</td>
                    <td style={{ color: C.gray }}>{r.governorate || "—"}</td>
                    <td style={{ color: C.gray }}>{r.area || "—"}</td>
                    <td style={{ color: C.gray }}>{r.street || "—"}</td>
                    <td style={{ color: C.gray }}>{CLASS_AR[r.predictedClass] || r.predictedClass || "—"}</td>
                    <td style={{ color: C.gray }}>{r.damagePercentage != null ? `${r.damagePercentage.toFixed(1)}%` : "—"}</td>
                    <td><span className="rq-pill rq-pill-sev" style={{ background: `${SEV_COLOR[r.severityScore]}22`, color: SEV_COLOR[r.severityScore] }}>{r.severityLabel || "—"}</span></td>
                    <td>
                      <Select
                        size="small"
                        value={r.status || "Pending"}
                        disabled={statusUpdating.has(r.id)}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        sx={{
                          fontSize: 12.5,
                          color: "#fff",
                          minWidth: 128,
                          background: "rgba(200,205,214,.08)",
                          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(200,205,214,.2)" },
                          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(242,140,40,.4)" },
                        }}
                      >
                        {STATUS_ORDER.map((s) => (
                          <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{STATUS_AR[s]}</MenuItem>
                        ))}
                      </Select>
                    </td>
                    <td style={{ fontSize: 12, color: "rgba(200,205,214,.5)" }}>{new Date(r.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PdfReportModal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        governorateOptions={governorateOptions}
      />
    </div>
    </ThemeProvider>
    </CacheProvider>
  );
}