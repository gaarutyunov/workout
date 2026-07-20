import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DatabaseProvider } from './context/DatabaseContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { BodyMapPage } from './pages/BodyMapPage';
import { CalendarPage } from './pages/CalendarPage';
import { NutritionPage } from './pages/NutritionPage';
import { PlanPage } from './pages/PlanPage';
import { HistoryPage } from './pages/HistoryPage';
import { ChatPage } from './pages/ChatPage';
import { ChatHistoryPage } from './pages/ChatHistoryPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';

// HashRouter so deep links don't 404 on GitHub Pages (§2/§10).
export function App() {
  return (
    <DatabaseProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/body" element={<BodyMapPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/nutrition" element={<NutritionPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chats" element={<ChatHistoryPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </DatabaseProvider>
  );
}
