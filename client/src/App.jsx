import { Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import { SectionFilterProvider } from './hooks/useSectionFilter.jsx';
import AppShell from './components/AppShell.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ToOrderPage from './pages/ToOrderPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import ShoppingPage from './pages/ShoppingPage.jsx';
import ToReceivePage from './pages/ToReceivePage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <ToastProvider>
      <SectionFilterProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<AppShell />}>
            <Route path="/to-order" element={<ToOrderPage />} />
            <Route path="to-receive" element={<ToReceivePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="shopping" element={<ShoppingPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage />} />
            <Route path="*" element={<p className="placeholder">Page not found.</p>} />
          </Route>
        </Routes>
      </SectionFilterProvider>
    </ToastProvider>
  );
}
