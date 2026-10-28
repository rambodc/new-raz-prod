import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth } from "./auth/guards";
import AppShell from "./app/AppShell";
import Home from "./pages/Home";

// Pages load on demand, so each screen only downloads what it needs.
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Welcome = lazy(() => import("./pages/Welcome"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ArtistPage = lazy(() => import("./pages/ArtistPage"));
const Admin = lazy(() => import("./pages/Admin"));
const LocationHelp = lazy(() => import("./pages/LocationHelp"));

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="splash" aria-busy="true" />}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/location-help" element={<LocationHelp />} />
          </Route>
        </Route>
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
