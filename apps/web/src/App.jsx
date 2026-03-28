import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ProfilePage from "./pages/ProfilePage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import SubjectPage from "./pages/SubjectPage";
import ChapterExamEntryPage from "./pages/ChapterExamEntryPage";
import { getAccessToken } from "./lib_auth";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  const hasToken = Boolean(getAccessToken());

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/subjects"
        element={
          <ProtectedRoute>
            <SubjectPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chapter/:chapterId/exam"
        element={
          <ProtectedRoute>
            <ChapterExamEntryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/archive"
        element={
          <ProtectedRoute>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/archive" replace />} />
      <Route
        path="/me"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<Navigate to={hasToken ? "/archive" : "/login"} replace />} />
    </Routes>
  );
}
