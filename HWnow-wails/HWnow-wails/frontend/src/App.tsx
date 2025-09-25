import { useEffect, useState } from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import Dashboard from './components/Dashboard/Dashboard'
import { PageControls } from './components/PageControls'
import { Header } from './components/Layout/Header'
import { PageTabs } from './components/common/PageTabs'
import ToastContainer from './components/common/ToastContainer'
import Onboarding from './components/common/Onboarding'
import SupportLinks from './components/common/SupportLinks'
import ErrorBoundary from './components/common/ErrorBoundary'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { initWebSocket } from './services/wailsEventService'
import './App.css'

function AppContent() {
  console.log('[App] === APP CONTENT COMPONENT START ===');

  const { toasts, removeToast, showInfo } = useToast()
  const [showOnboarding, setShowOnboarding] = useState(false)

  console.log('[App] AppContent component initialized:', {
    toastsCount: toasts?.length || 0,
    showOnboarding,
    hasToastContext: !!removeToast && !!showInfo
  });

  // 전역 단축키 활성화
  useAppShortcuts({
    onOpenContextMenu: (position) => {
      // Dashboard의 ContextMenu 열기 이벤트 발생
      window.dispatchEvent(new CustomEvent('openContextMenu', { 
        detail: { position } 
      }));
    },
    onOpenWidgetSettings: (widgetId) => {
      // 위젯 설정 모달 열기 (추후 구현)
      showInfo(`Opening settings for widget: ${widgetId}`);
    },
  })

  useEffect(() => {
    initWebSocket().catch((error) => {
      console.error('[App] Failed to initialize monitoring service:', error);
    });
    
    // Check if onboarding has been completed
    const onboardingCompleted = localStorage.getItem('onboardingCompleted')
    if (!onboardingCompleted) {
      setShowOnboarding(true)
    }
  }, [])

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    showInfo('Welcome! Start by adding some widgets to your dashboard.')
  }

  return (
    <div className="App">
      <Header />
      <PageTabs />
      <PageControls />
      <main>
        <Dashboard />
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <SupportLinks />
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
        <Router>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </Router>
      </div>
    </ErrorBoundary>
  )
}

export default App