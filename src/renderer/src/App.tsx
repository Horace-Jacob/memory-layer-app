import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicRoute } from './components/PublicRoute';

import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { AddMemoryPage } from './pages/AddMemoryPage';
import { LoginPage } from './pages/LoginPage';
import SettingsPage from './pages/SettingPage';
// import { MemoryRecallPage } from './pages/MemoryRecallPage';
import { OnBoardingPage } from './pages/OnboardingPage';
import { ThemeProvider } from './context/ThemeContext';

function App(): React.JSX.Element {
  return (
    // 1. Wrap entire app in AuthProvider to provide session state
    <ThemeProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            {/* Public Routes (Login) - Only accessible if NOT logged in */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Protected Routes (App) - Only accessible if logged in */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="/new-memory" element={<AddMemoryPage />} />
              </Route>
              {/*<Route path="/memory-recall" element={<MemoryRecallPage />} />*/}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/onboarding" element={<OnBoardingPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
