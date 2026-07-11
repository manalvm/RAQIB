export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5179";
export const BASE = `${BASE_URL}/api`;

const getToken = () => localStorage.getItem("raqib_token");

const headers = (isForm = false) => ({
  ...(!isForm && { "Content-Type": "application/json" }),
  ...(getToken() && { Authorization: `Bearer ${getToken()}` }),
});

// ── Arabic error localization (Task 4) ──────────────────────
// ASP.NET Identity returns its validation messages in English; our own
// business errors are already in Arabic. This normalizes everything the
// UI sees down to a single, friendly Arabic string.
const AR_ERROR_MAP = [
  [/already exists|is already taken/i, "هذا البريد الإلكتروني مستخدم بالفعل."],
  [/passwords must have at least one non alphanumeric/i, "يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل."],
  [/passwords must have at least one digit/i, "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل."],
  [/passwords must have at least one uppercase/i, "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل."],
  [/passwords must have at least one lowercase/i, "يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل."],
  [/passwords must be at least (\d+) characters/i, (m) => `يجب أن تتكون كلمة المرور من ${m[1]} أحرف على الأقل.`],
  [/invalid email/i, "البريد الإلكتروني غير صالح."],
  [/unauthorized/i, "بيانات الدخول غير صحيحة."],
];

function translateAuthError(msg) {
  if (!msg) return "حدث خطأ، حاول مرة أخرى.";
  // Already Arabic (most of our own business-logic errors are) — pass through as-is.
  if (/[\u0600-\u06FF]/.test(msg)) return msg;

  for (const [pattern, replacement] of AR_ERROR_MAP) {
    const match = msg.match(pattern);
    if (match) return typeof replacement === "function" ? replacement(match) : replacement;
  }
  return "حدث خطأ، حاول مرة أخرى.";
}

async function request(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: headers(opts.form),
    });
  } catch {
    const error = new Error("لا يمكن الاتصال بالخادم حالياً.");
    error.status = 0;
    throw error;
  }

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({ message: res.statusText }));
    const rawMessages = Array.isArray(errPayload)
      ? errPayload
      : typeof errPayload === "string"
        ? [errPayload] // ASP.NET's BadRequest("...")/Unauthorized("...") serializes as a bare JSON string
        : errPayload.errors // ASP.NET Core model-validation shape: { errors: { Field: ["msg"] } }
          ? Object.values(errPayload.errors).flat()
          : [errPayload.message || errPayload.title || "حدث خطأ، حاول مرة أخرى."];

    const message = rawMessages.map(translateAuthError).join("، ");

    const error = new Error(message);
    error.status = res.status;
    error.payload = errPayload;
    error.needsVerification = Boolean(errPayload.needsVerification);
    error.userId = errPayload.userId;
    throw error;
  }
  return res.json();
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────
  register:  (data) => request("/auth/register",  { method: "POST", body: JSON.stringify(data) }),
  login:     (data) => request("/auth/login",     { method: "POST", body: JSON.stringify(data) }),
  verifyOtp: (userId, otp) =>
    request("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ userId, otp }),
    }),
  resendOtp: (email) =>
    request("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  googleLogin: (idToken) =>
    request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  completeGoogleSignup: (ticket, password) =>
    request("/auth/google/complete-signup", {
      method: "POST",
      body: JSON.stringify({ ticket, password }),
    }),

  // ── Reports ───────────────────────────────────────────────
  createReport: (formData) =>
    fetch(`${BASE}/reports`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body:    formData,
    }).then(r => r.json()),

  getMyReports: () => request("/reports/my"),
  getMapPoints: () => request("/reports/map"),
  getReport:    (id) => request(`/reports/${id}`),
  sendChat:     (reportId, userMessage) =>
    request("/reports/chat", {
      method: "POST",
      body: JSON.stringify({ reportId, userMessage }),
    }),
  getChatHistory: (reportId) => request(`/reports/chat/${reportId}`),

  // ── Admin ─────────────────────────────────────────────────
  getDashboard: () => request("/admin/dashboard"),
  getAllReports: () => request("/admin/reports"),
  getAllUsers:   () => request("/admin/users"),
  updateStatus:  (id, status) =>
    request(`/reports/${id}/status`, { method: "PATCH", body: JSON.stringify(status) }),
  toggleUser:   (id) =>
    request(`/admin/users/${id}/toggle`, { method: "PATCH" }),

  // ── Notifications (NEW) ──────────────────────────────────
  getNotifications: () => request("/notifications"),
  getUnreadNotificationCount: () => request("/notifications/unread-count"),
  markNotificationRead: (id) =>
    request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    request("/notifications/read-all", { method: "PATCH" }),

  // ── Admin PDF analytics report (NEW) ─────────────────────
  // triggers a real browser download of the generated PDF
  downloadReportsPdf: async ({ governorate, fromDate, toDate } = {}) => {
    const qs = new URLSearchParams();
    if (governorate) qs.append("governorate", governorate);
    if (fromDate) qs.append("fromDate", fromDate);
    if (toDate) qs.append("toDate", toDate);

    const res = await fetch(`${BASE}/admin/reports/pdf?${qs.toString()}`, {
      headers: headers(),
    });
    if (!res.ok) {
      throw new Error("تعذر توليد تقرير الـ PDF");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RAQIB-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
