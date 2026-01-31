import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from '@/components/ui/Toaster';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Skills } from '@/pages/Skills';
import { Proposals } from '@/pages/Proposals';
import { Decisions } from '@/pages/Decisions';
import { Crawler } from '@/pages/Crawler';
import { Admin } from '@/pages/Admin';
import { Preferences } from '@/pages/Preferences';
import { Config } from '@/pages/Config';
import { ThemeProvider } from '@/components/ThemeProvider';

function AppRoutes() {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/proposals" element={<Proposals />} />
        <Route path="/decisions" element={<Decisions />} />
        <Route path="/crawler" element={<Crawler />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/preferences" element={<Preferences />} />
        <Route path="/config" element={<Config />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout>
          <AppRoutes />
        </Layout>
        <Toaster />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
