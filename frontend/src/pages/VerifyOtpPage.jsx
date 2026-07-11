import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../services/api";

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = location.state?.userId || "";
  const email = location.state?.email || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setTimer] = useState(60);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setTimer((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);
// useEffect(() => {
//   if (!userId) navigate("/register");
// }, [userId, navigate]);
  const handleChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0)
      inputRefs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length === 6) {
      setOtp(paste.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length < 6) return setError("أدخل الكود كاملاً");
    setError("");
    setLoading(true);
    try {
      await api.verifyOtp(userId, code);
      setSuccess("تم التأكيد بنجاح! جارٍ التحويل...");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message || "الكود غير صحيح");
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      await api.resendOtp(email);
      setTimer(60);
      setError("");
      setSuccess("تم إرسال كود جديد");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="raqib-auth">
      <style>{`
        .raqib-auth {
          --navy-primary: #11294e;
          --navy-secondary: #27446E;
          --orange: #ec6666ec;
          --orange-dark: #E57200;
          --white: #FFFFFF;
          --off-white: #FCFDFF;
          --light-gray: #EAEBEC;
          --gray: #C8CDD6;

          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 15% 10%, rgba(242,140,40,0.08), transparent 45%),
            radial-gradient(circle at 85% 90%, rgba(39,68,110,0.5), transparent 50%),
            linear-gradient(160deg, var(--navy-primary) 0%, #0d1f35 100%);
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .raqib-auth::before {
          content: "";
          position: absolute; inset: 0;
          background:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 42px 42px,
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 42px 42px;
          pointer-events: none;
        }

        .auth-wrap { position: relative; width: 100%; max-width: 420px; }

        .brand-row {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; margin-bottom: 10px;
        }
        .brand-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--orange);
          box-shadow: 0 0 10px var(--orange);
        }
        .brand-name {
          font-size: 26px; font-weight: 800; letter-spacing: 2px;
          color: var(--off-white);
        }
        .brand-tag {
          text-align: center;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--gray);
          margin-bottom: 34px;
        }

        .card-frame { position: relative; padding: 14px; }
        .corner {
          position: absolute; width: 22px; height: 22px;
          border: 2px solid var(--orange);
          opacity: 0.9;
        }
        .corner.tl { top: 0; left: 0; border-right: none; border-bottom: none; border-radius: 4px 0 0 0; }
        .corner.tr { top: 0; right: 0; border-left: none; border-bottom: none; border-radius: 0 4px 0 0; }
        .corner.bl { bottom: 0; left: 0; border-right: none; border-top: none; border-radius: 0 0 0 4px; }
        .corner.br { bottom: 0; right: 0; border-left: none; border-top: none; border-radius: 0 0 4px 0; }

        .card {
          background: rgba(39, 68, 110, 0.35);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(200, 205, 214, 0.15);
          border-radius: 16px;
          padding: 34px 30px;
        }

        .otp-icon-wrap {
          width: 56px; height: 56px;
          margin: 0 auto 16px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(242, 140, 40, 0.12);
          border: 1px solid rgba(242, 140, 40, 0.3);
        }
        .otp-icon { font-size: 24px; }

        .card-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 1.5px;
          color: var(--orange);
          text-align: center;
          margin-bottom: 6px;
        }
        .card-title {
          font-size: 20px; font-weight: 700;
          color: var(--white);
          margin: 0 0 8px;
          text-align: center;
        }
        .card-sub {
          font-size: 13px;
          color: var(--gray);
          text-align: center;
          margin: 0;
          line-height: 1.6;
        }
        .card-email {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--orange);
          text-align: center;
          margin: 2px 0 26px;
        }

        .otp-row {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 24px;
          /* Keep the code boxes left-to-right even though the page around
             them is RTL — a verification code is always read/typed LTR. */
          direction: ltr;
          unicode-bidi: isolate;
        }
        .otp-input {
          width: 46px;
          height: 56px;
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          border-radius: 12px;
          background: rgba(13, 31, 53, 0.6);
          border: 1px solid rgba(200, 205, 214, 0.2);
          color: var(--orange);
          caret-color: var(--orange);
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-sizing: border-box;
          direction: ltr;
          unicode-bidi: plaintext;
        }
        .otp-input.filled {
          border-color: var(--orange);
          box-shadow: 0 0 0 3px rgba(242, 140, 40, 0.15);
        }

        .error-box {
          background: rgba(209, 69, 59, 0.12);
          border: 1px solid rgba(209, 69, 59, 0.35);
          color: #ffb4ae;
          font-size: 13px;
          padding: 11px 14px;
          border-radius: 10px;
          margin-bottom: 18px;
          text-align: center;
        }
        .success-box {
          background: rgba(79, 178, 134, 0.12);
          border: 1px solid rgba(79, 178, 134, 0.35);
          color: #a8e6c9;
          font-size: 13px;
          padding: 11px 14px;
          border-radius: 10px;
          margin-bottom: 18px;
          text-align: center;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          font-size: 15px;
          color: #1a1103;
          background: linear-gradient(135deg, var(--orange), var(--orange-dark));
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.2s ease;
          box-shadow: 0 8px 20px rgba(242, 140, 40, 0.22);
        }
        .submit-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .resend-line {
          text-align: center;
          margin-top: 22px;
          font-size: 13.5px;
          color: var(--gray);
        }
        .resend-btn {
          background: none;
          border: none;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          font-size: 13.5px;
        }
      `}</style>

      <div className="auth-wrap">
        <div className="brand-row">
          <span className="brand-dot" />
          <span className="brand-name">RAQIB</span>
        </div>
        <div className="brand-tag">AI FIELD SURVEY CONSOLE</div>

        <div className="card-frame">
          <div className="corner tl" />
          <div className="corner tr" />
          <div className="corner bl" />
          <div className="corner br" />

          <div className="card" dir="rtl">
            <div className="otp-icon-wrap">
              <span className="otp-icon">@</span>
            </div>

            <div className="card-eyebrow">EMAIL_VERIFICATION</div>
            <h2 className="card-title">تأكيد البريد الإلكتروني</h2>
            <p className="card-sub">أدخل الكود المكون من 6 أرقام الذي أرسلناه إلى</p>
            <p className="card-email">{email}</p>

            <div className="otp-row" dir="ltr" onPaste={handlePaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`otp-input ${digit ? "filled" : ""}`}
                />
              ))}
            </div>

            {error && <div className="error-box">{error}</div>}
            {success && <div className="success-box">{success}</div>}

            <button
              onClick={handleVerify}
              disabled={loading || otp.join("").length < 6}
              className="submit-btn"
            >
              {loading ? "جارٍ التحقق..." : "تأكيد الكود"}
            </button>

            <div className="resend-line">
              لم يصلك الكود؟{" "}
              <button
                onClick={handleResend}
                disabled={resendTimer > 0}
                className="resend-btn"
                style={{
                  color: resendTimer > 0 ? "rgba(200,205,214,0.4)" : "#F28C28",
                  cursor: resendTimer > 0 ? "default" : "pointer",
                }}
              >
                {resendTimer > 0 ? `إعادة الإرسال (${resendTimer}s)` : "إعادة الإرسال"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}