import { Navigate } from "react-router-dom";

export default function Index() {
  return <Navigate to="/auth/login" replace />;
}