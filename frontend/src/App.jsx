import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./services/AuthContext";
import LoginPage             from "./pages/LoginPage";
import RegisterPage          from "./pages/RegisterPage";
import VerifyOtpPage         from "./pages/VerifyOtpPage";
import SetGooglePasswordPage from "./pages/SetGooglePasswordPage";
import UserDashboard         from "./pages/UserDashboard";
import AdminDashboard        from "./pages/AdminDashboard";

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user, isAdmin } = useAuth();
  return (
    <Routes>
      <Route path="/login"                element={user ? <Navigate to={isAdmin ? "/admin" : "/dashboard"} /> : <LoginPage />} />
      <Route path="/register"             element={user ? <Navigate to="/dashboard" /> : <RegisterPage />} />
      <Route path="/verify-otp"           element={<VerifyOtpPage />} />
      <Route path="/set-google-password"  element={<SetGooglePasswordPage />} />
      <Route path="/dashboard"            element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/admin"                element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="*"                     element={<Navigate to={user ? (isAdmin ? "/admin" : "/dashboard") : "/login"} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
