import { Routes, Route, useLocation } from 'react-router-dom';
import { SessionProvider, useSession, isDetailPath } from './session';
import { TabBar } from './components/TabBar';
import { LoadingState, ErrorState } from './components/StateViews';
import { HomePage } from './pages/HomePage';
import { ResultsPage } from './pages/ResultsPage';
import { ActivityPage } from './pages/ActivityPage';
import { RegisterPage } from './pages/RegisterPage';
import { SuccessPage } from './pages/SuccessPage';
import { MyPage } from './pages/MyPage';
import { ProfilePage } from './pages/ProfilePage';

function Shell() {
  const { loading, error, retry } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="sn-page">
        <LoadingState text="Загружаем спорт рядом…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="sn-page">
        <ErrorState text={error} onRetry={retry} />
      </div>
    );
  }

  const detail = isDetailPath(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/activity/:id" element={<ActivityPage />} />
        <Route path="/activity/:id/register/:slotId" element={<RegisterPage />} />
        <Route path="/success/:registrationId" element={<SuccessPage />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      {!detail && <TabBar />}
    </>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}