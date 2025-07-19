import { useEffect, useState } from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import Dashboard from './components/Dashboard/Dashboard'
import { PageControls } from './components/PageControls'
import { Header } from './components/Layout/Header'
import { PageTabs } from './components/common/PageTabs'
import ToastContainer from './components/common/ToastContainer'
import Onboarding from './components/common/Onboarding'
import SupportLinks from './components/common/SupportLinks'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { initWebSocket } from './services/websocketService'
import './App.css'

function AppContent() {
  const { toasts, removeToast, showInfo } = useToast()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    initWebSocket()
    
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
    <Router>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </Router>
  )
}

export default App
