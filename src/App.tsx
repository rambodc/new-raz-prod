import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const Home = lazy(() => import("./pages/Home").then((module) => ({ default: module.Home })));

export default function App() {
  return (
    <Suspense fallback={<main className="route-loading">Opening Razzberry…</main>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<Home initialAuthMode="signup" />} />
        <Route path="/signin" element={<Home initialAuthMode="signin" />} />
        <Route path="/forgot-password" element={<Home initialAuthMode="reset" />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
