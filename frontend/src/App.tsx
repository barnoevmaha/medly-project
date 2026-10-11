import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionProvider } from "@/lib/session";
import { LanguageProvider } from "@/lib/i18n";
import { AiContextProvider } from "@/lib/ai-context";
import { ToastProvider } from "@/components/ui/toast";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Feed from "@/pages/Feed";
import Article from "@/pages/Article";
import Community from "@/pages/Community";
import CommunityRoom from "@/pages/CommunityRoom";
import Challenges from "@/pages/Challenges";
import ChallengeRun from "@/pages/ChallengeRun";
import Library from "@/pages/Library";
import Watch from "@/pages/Watch";
import Read from "@/pages/Read";
import VirtualPatient from "@/pages/VirtualPatient";
import VirtualPatientRun from "@/pages/VirtualPatientRun";
import Settings from "@/pages/Settings";
import Leaderboard from "@/pages/Leaderboard";
import Premium from "@/pages/Premium";
import Profile from "@/pages/Profile";
import Learn from "@/pages/Learn";
import Course from "@/pages/Course";
import Quiz from "@/pages/Quiz";
import Imaging from "@/pages/Imaging";
import Casebook from "@/pages/Casebook";
import CaseReference from "@/pages/CaseReference";
import Governance from "@/pages/Governance";
import Login from "@/pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <LanguageProvider>
        <AiContextProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/feed/:slug" element={<Article />} />
              <Route path="/community" element={<Community />} />
              <Route path="/community/:slug" element={<CommunityRoom />} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/challenges/:slug" element={<ChallengeRun />} />
              {/* Library is the catalogue of what exists; Saved is what this
                  user kept. Separate sections, separate routes. */}
              <Route path="/library" element={<Library />} />
              <Route path="/watch/:slug" element={<Watch />} />
              <Route path="/read/:slug" element={<Read />} />
              {/* Saved became a tab inside Library. Old links still resolve. */}
              <Route
                path="/saved"
                element={<Navigate to="/library?tab=saved" replace />}
              />
              {/* Virtual Patient. The session id in the URL is the server's
                  run, so a refresh resumes exactly where the engine says. */}
              <Route path="/virtual-patient" element={<VirtualPatient />} />
              <Route
                path="/virtual-patient/session/:sessionId"
                element={<VirtualPatientRun />}
              />
              <Route path="/settings" element={<Settings />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/premium" element={<Premium />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learn/:slug" element={<Course />} />
              <Route path="/quiz/:quizId" element={<Quiz />} />
              <Route path="/imaging" element={<Imaging />} />
              <Route path="/imaging/cases" element={<Casebook />} />
              <Route path="/imaging/cases/:id" element={<CaseReference />} />
              <Route path="/governance" element={<Governance />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
        </AiContextProvider>
        </LanguageProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
