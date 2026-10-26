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
const Passport = lazy(() => import("./lab/pages/Passport"));
const RepPhone = lazy(() => import("./lab/pages/RepPhone"));
const Discover = lazy(() => import("./lab/pages/Discover"));
const VerifiedFans = lazy(() => import("./lab/pages/VerifiedFans"));
// The venue screen is full-viewport and sits outside the lab shell, so it can cover the whole display.
const VenueScreen = lazy(() => import("./lab/pages/VenueScreen"));

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
            <Route path="passport" element={<Passport />} />
            <Route path="rep" element={<RepPhone />} />
            <Route path="discover" element={<Discover />} />
            <Route path="artist" element={<VerifiedFans />} />
          </Route>
          <Route path="/app/live" element={<VenueScreen />} />
          <Route path="/app/rewards" element={<Navigate to="/app/rep" replace />} />
        </Route>
        <Route path="/dashboard" element={<Navigate to="/welcome" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
