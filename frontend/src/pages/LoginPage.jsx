import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../services/AuthContext";

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const googleBtnRef = useRef(null);

  // ── NEW: Google Sign-In button (Task 3) ──
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const renderButton = () => {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 360,
        locale: "ar",
      });
    };

    if (window.google) {
      renderButton();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = renderButton;
      document.body.appendChild(script);
    }
  }, []);

  const handleGoogleCredential = async (response) => {
    setError("");
    setLoading(true);
    try {
      const data = await loginWithGoogle(response.credential);
      if (data.requiresPasswordSetup) {
        const params = new URLSearchParams({ ticket: data.ticket, email: data.email || "" });
        navigate(`/set-google-password?${params.toString()}`);
        return;
      }
      navigate(data.role === "Admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err.message || "تعذر تسجيل الدخول عبر Google");
    } finally {
      setLoading(false);
    }
  };

  const handle = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      navigate(data.role === "Admin" ? "/admin" : "/dashboard");
    } catch (err) {
      if (err?.needsVerification) {
        navigate("/verify-otp", {
          state: {
            userId: err.userId,
            email: form.email,
          },
        });
        return;
      }
      setError(err.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  // simulated field reports pinging on the radar — same language as the register page
  const pings = [
    { top: "14%", left: "12%", delay: "0s" },
    { top: "78%", left: "18%", delay: "1.4s" },
    { top: "22%", left: "82%", delay: "2.6s" },
    { top: "68%", left: "86%", delay: "0.7s" },
    { top: "48%", left: "6%", delay: "3.4s" },
  ];

  return (
    <div className="raqib-auth">
      <style>{`
        .raqib-auth {
          --navy-primary: #17325A;
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
            radial-gradient(circle at 15% 10%, rgba(242,140,40,0.10), transparent 45%),
            radial-gradient(circle at 85% 90%, rgba(39,68,110,0.55), transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(39,68,110,0.25), transparent 60%),
            linear-gradient(160deg, var(--navy-primary) 0%, #0d1f35 55%, #081527 100%);
          background-size: 140% 140%, 140% 140%, 200% 200%, 100% 100%;
          animation: aurora-drift 18s ease-in-out infinite;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        @keyframes aurora-drift {
          0%   { background-position: 0% 0%, 100% 100%, 50% 50%, 0 0; }
          50%  { background-position: 10% 5%, 90% 95%, 55% 45%, 0 0; }
          100% { background-position: 0% 0%, 100% 100%, 50% 50%, 0 0; }
        }

        /* survey grid, drifting slowly like a live scan area */
        .raqib-auth::before {
          content: "";
          position: absolute; inset: -42px;
          background:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px) 0 0 / 42px 42px,
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0 / 42px 42px;
          animation: grid-drift 26s linear infinite;
          pointer-events: none;
        }
        @keyframes grid-drift {
          0%   { transform: translate(0, 0); }
          100% { transform: translate(42px, 42px); }
        }

        /* rotating radar sweep, centered on the whole viewport */
        .radar-sweep {
          position: absolute;
          top: 50%; left: 50%;
          width: 1400px; height: 1400px;
          margin: -700px 0 0 -700px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, rgba(242,140,40,0.16), transparent 22%, transparent 100%);
          animation: sweep-rotate 7s linear infinite;
          pointer-events: none;
          mix-blend-mode: screen;
        }
        @keyframes sweep-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* faint concentric radar rings across the whole background */
        .radar-rings {
          position: absolute;
          top: 50%; left: 50%;
          width: 900px; height: 900px;
          margin: -450px 0 0 -450px;
          border-radius: 50%;
          pointer-events: none;
        }
        .radar-rings span {
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(242,140,40,0.10);
        }
        .radar-rings span:nth-child(1) { inset: 30%; }
        .radar-rings span:nth-child(2) { inset: 15%; }
        .radar-rings span:nth-child(3) { inset: 0%; }

        /* field-report pings scattered on the map, like incoming reports */
        .ping-wrap { position: absolute; width: 6px; height: 6px; pointer-events: none; }
        .ping-dot { position: absolute; inset: 0; border-radius: 50%; background: var(--orange); }
        .ping-ring {
          position: absolute; inset: 0;
          border-radius: 50%;
          border: 1.5px solid var(--orange);
          animation: ping-out 3.2s ease-out infinite;
        }
        @keyframes ping-out {
          0%   { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(6); opacity: 0; }
        }

        .auth-wrap { position: relative; width: 100%; max-width: 420px; z-index: 1; }

        .brand-row {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; margin-bottom: 10px;
        }
        .brand-dot {
          position: relative;
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--orange);
          box-shadow: 0 0 10px var(--orange);
          animation: dot-breathe 2.4s ease-in-out infinite;
        }
        @keyframes dot-breathe {
          0%, 100% { box-shadow: 0 0 6px var(--orange); transform: scale(1); }
          50%      { box-shadow: 0 0 16px var(--orange); transform: scale(1.25); }
        }

        .brand-name {
          font-size: 26px; font-weight: 800; letter-spacing: 2px;
          background: linear-gradient(90deg, var(--off-white) 0%, var(--off-white) 40%, var(--orange) 50%, var(--off-white) 60%, var(--off-white) 100%);
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: name-sheen 5s ease-in-out infinite;
        }
        @keyframes name-sheen {
          0%   { background-position: 200% 0; }
          60%  { background-position: -20% 0; }
          100% { background-position: -20% 0; }
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

        .card-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 1.5px;
          color: var(--orange);
          margin-bottom: 6px;
        }
        .card-title {
          font-size: 21px; font-weight: 700;
          color: var(--white);
          margin: 0 0 4px;
        }
        .card-sub {
          font-size: 13px;
          color: var(--gray);
          margin: 0 0 26px;
        }

        .field { margin-bottom: 18px; }
        .field label {
          display: block;
          font-size: 13px;
          color: var(--gray);
          margin-bottom: 7px;
          font-weight: 500;
        }
        .field input {
          width: 100%;
          padding: 13px 16px;
          border-radius: 10px;
          border: 1px solid rgba(200, 205, 214, 0.2);
          background: rgba(13, 31, 53, 0.6);
          color: var(--off-white);
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-sizing: border-box;
        }
        .field input::placeholder { color: rgba(200, 205, 214, 0.45); }
        .field input:focus {
          border-color: var(--orange);
          box-shadow: 0 0 0 3px rgba(242, 140, 40, 0.15);
        }
        .field-underline {
          height: 2px;
          background: var(--orange);
          border-radius: 2px;
          transform: scaleX(0);
          transform-origin: right;
          transition: transform 0.25s ease;
          margin-top: 2px;
        }
        .field-underline.active { transform: scaleX(1); }

        .error-box {
          background: rgba(229, 114, 0, 0.12);
          border: 1px solid rgba(229, 114, 0, 0.35);
          color: #ffcb9b;
          font-size: 13px;
          padding: 11px 14px;
          border-radius: 10px;
          margin-bottom: 18px;
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
        .submit-btn:disabled { opacity: 0.60; cursor: not-allowed; }

        .switch-line {
          text-align: center;
          margin-top: 22px;
          font-size: 13.5px;
          color: var(--gray);
        }
        .switch-line a {
          color: var(--orange);
          font-weight: 600;
          text-decoration: none;
        }
        .switch-line a:hover { text-decoration: underline; }

        @media (prefers-reduced-motion: reduce) {
          .raqib-auth, .raqib-auth::before, .radar-sweep, .brand-dot, .brand-name, .ping-ring {
            animation: none !important;
          }
        }
      `}</style>

      <div className="radar-sweep" />
      <div className="radar-rings">
        <span /><span /><span />
      </div>
      {pings.map((p, i) => (
        <span key={i} className="ping-wrap" style={{ top: p.top, left: p.left }}>
          <span className="ping-dot" />
          <span className="ping-ring" style={{ animationDelay: p.delay }} />
        </span>
      ))}

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
            <div className="card-eyebrow">SESSION_ACCESS</div>
            <h2 className="card-title">تسجيل الدخول</h2>
            <p className="card-sub">أدخل بياناتك للمتابعة</p>

            <form onSubmit={handle}>
              <div className="field">
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="example@email.com"
                />
                <div className={`field-underline ${focused === "email" ? "active" : ""}`} />
              </div>

              <div className="field">
                <label>كلمة المرور</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                />
                <div className={`field-underline ${focused === "password" ? "active" : ""}`} />
              </div>

              {error && <div className="error-box">{error}</div>}

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? "جارٍ التحقق..." : "دخول"}
              </button>
            </form>

            {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(200,205,214,0.2)" }} />
                  <span style={{ fontSize: 12, color: "var(--gray)" }}>أو</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(200,205,214,0.2)" }} />
                </div>
                <div ref={googleBtnRef} style={{ display: "flex", justifyContent: "center" }} />
              </>
            )}

            <p className="switch-line">
              ليس لديك حساب؟ <Link to="/register">إنشاء حساب جديد</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}