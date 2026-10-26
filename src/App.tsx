import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth } from "./auth/guards";
import Home from "./pages/Home";

// Auth pages load on demand so the home page stays small.
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Welcome = lazy(() => import("./pages/Welcome"));
const NotFound = lazy(() => import("./pages/NotFound"));

// The design lab (front-end-only demo screens). Each page is its own chunk, and the shared shell and
// its styles load only when someone opens /app.
const LabLayout = lazy(() => import("./lab/LabLayout"));
const LabHub = lazy(() => import("./lab/pages/Hub"));
const ShowPass = lazy(() => import("./lab/pages/ShowPass"));
const LiveShow = lazy(() => import("./lab/pages/LiveShow"));
const Passport = lazy(() => import("./lab/pages/Passport"));
const Rewards = lazy(() => import("./lab/pages/Rewards"));
const Discover = lazy(() => import("./lab/pages/Discover"));
const VerifiedFans = lazy(() => import("./lab/pages/VerifiedFans"));

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="splash" aria-busy="true" />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route element={<GuestOnly />}>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/app" element={<LabLayout />}>
            <Route index element={<LabHub />} />
            <Route path="pass" element={<ShowPass />} />
            <Route path="live" element={<LiveShow />} />
            <Route path="passport" element={<Passport />} />
            <Route path="rewards" element={<Rewards />} />
            <Route path="discover" element={<Discover />} />
            <Route path="artist" element={<VerifiedFans />} />
          </Route>
        </Route>
        <Route path="/dashboard" element={<Navigate to="/welcome" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
