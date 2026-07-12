import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import { api } from "../services/api";

const C = { orange: "#F28C28", orangeDark: "#E57200", gray: "#C8CDD6" };

// ── اليوم / الشهر / السنة selector, kept local to this file ──
// Requirement: the PDF dialog's date pickers must show Arabic day/month/year
// fields instead of the browser's default <input type="date"> formatting.
const AR_MONTHS = ["يناير", "فبراير", "مارس", "إبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - i);

function toIsoDate({ day, month, year }) {
  if (!day || !month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ArabicDateField({ label, value, onChange }) {
  const { day, month, year } = value;
  const update = (patch) => onChange({ day, month, year, ...patch });

  return (
    <Stack spacing={0.75}>
      <Typography variant="caption" sx={{ color: C.gray, fontWeight: 600 }}>{label}</Typography>
      <Stack direction="row" spacing={1}>
        <FormControl size="small" sx={{ flex: 1, minWidth: 72 }}>
          <InputLabel sx={{ color: C.gray }}>اليوم</InputLabel>
          <Select value={day} label="اليوم" onChange={(e) => update({ day: e.target.value })} sx={{ color: "#fff" }}>
            <MenuItem value="">—</MenuItem>
            {DAY_OPTIONS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: 1.5, minWidth: 108 }}>
          <InputLabel sx={{ color: C.gray }}>الشهر</InputLabel>
          <Select value={month} label="الشهر" onChange={(e) => update({ month: e.target.value })} sx={{ color: "#fff" }}>
            <MenuItem value="">—</MenuItem>
            {AR_MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: 1, minWidth: 90 }}>
          <InputLabel sx={{ color: C.gray }}>السنة</InputLabel>
          <Select value={year} label="السنة" onChange={(e) => update({ year: e.target.value })} sx={{ color: "#fff" }}>
            <MenuItem value="">—</MenuItem>
            {YEAR_OPTIONS.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
    </Stack>
  );
}

const EMPTY_DATE = { day: "", month: "", year: "" };

export default function PdfReportModal({ open, onClose, governorateOptions = [] }) {
  const [governorate, setGovernorate] = useState("");
  const [fromDate, setFromDate] = useState(EMPTY_DATE);
  const [toDate, setToDate] = useState(EMPTY_DATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClose = () => {
    if (loading) return;
    setError(null);
    onClose();
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.downloadReportsPdf({
        governorate: governorate || undefined,
        fromDate: toIsoDate(fromDate) || undefined,
        toDate: toIsoDate(toDate) || undefined,
      });
      onClose();
    } catch (e) {
      setError(e.message || "تعذر توليد التقرير، حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth
      PaperProps={{
        sx: {
          background: "linear-gradient(160deg, rgba(23,50,90,.55) 0%, #0d1f35 60%)",
          color: "#fff",
          borderRadius: 4,
          border: "1px solid rgba(242,140,40,.18)",
          boxShadow: "0 30px 70px rgba(2,8,23,.5)",
        },
      }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.25, pt: 3, px: 3, pb: 1.5 }}>
        <PictureAsPdfRoundedIcon sx={{ color: C.orange, fontSize: 26 }} />
        <Typography sx={{ fontWeight: 800, fontSize: 17 }}>تحميل تقرير PDF للتحليلات</Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 3, pb: 1 }}>
        <Typography variant="body2" sx={{ color: C.gray, mb: 2.5, lineHeight: 1.7 }}>
          اختر نطاق البيانات المطلوب، وسيتم توليد تقرير احترافي يشمل الإحصائيات والرسوم البيانية والتوصيات.
        </Typography>

        <Stack spacing={2.25} dir="rtl">
          <FormControl size="small" fullWidth>
            <InputLabel id="pdf-gov-select" sx={{ color: C.gray }}>المحافظة</InputLabel>
            <Select
              labelId="pdf-gov-select"
              value={governorate}
              label="المحافظة"
              onChange={(e) => setGovernorate(e.target.value)}
              sx={{ color: "#fff" }}
            >
              <MenuItem value="">كل المحافظات</MenuItem>
              {governorateOptions.map((gov) => (
                <MenuItem key={gov} value={gov}>{gov}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <ArabicDateField label="من تاريخ" value={fromDate} onChange={setFromDate} />
          <ArabicDateField label="إلى تاريخ" value={toDate} onChange={setToDate} />

          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, gap: 1 }}>
        <Button onClick={handleClose} disabled={loading} sx={{ color: C.gray, fontWeight: 600 }}>إلغاء</Button>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} sx={{ color: "#1a1103" }} /> : <PictureAsPdfRoundedIcon />}
          sx={{
            background: `linear-gradient(135deg, ${C.orange}, ${C.orangeDark})`,
            color: "#1a1103",
            fontWeight: 700,
            borderRadius: 2.5,
            px: 2.5,
            boxShadow: "0 12px 28px rgba(242,140,40,.28)",
            "&:hover": { background: `linear-gradient(135deg, ${C.orangeDark}, ${C.orange})` },
          }}
        >
          {loading ? "جارٍ التوليد..." : "توليد وتحميل التقرير"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
