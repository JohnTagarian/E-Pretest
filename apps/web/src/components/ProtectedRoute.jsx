import React from "react";
import { Navigate } from "react-router-dom";
import { getAccessToken } from "../lib_auth";

export default function ProtectedRoute({ children }) {
  const hasToken = Boolean(getAccessToken());
  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
