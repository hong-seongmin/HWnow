import { useEffect, useState } from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import Dashboard from './components/Dashboard/Dashboard'
import { PageControls } from './components/PageControls'
import { Header } from './components/Layout/Header'
import ToastContainer from './components/common/ToastContainer'
import Onboarding from './components/common/Onboarding'
import SupportLinks from './components/common/SupportLinks'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { useTheme } from './hooks/useTheme'
import { useDashboardStore } from './stores/dashboardStore'
import { initWebSocket } from './services/websocketService'
import './App.css'

function AppContent() {
  const { toasts, removeToast, showInfo } = useToast()
  const { toggleTheme } = useTheme()
  const { actions } = useDashboardStore()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Define keyboard shortcuts
  const shortcuts = useKeyboardNavigation([
    {
      key: 't',
      ctrl: true,
      action: toggleTheme,
      description: 'Toggle theme (Ctrl+T)',
    },
    {
      key: '1',
      ctrl: true,
      action: () => actions.addWidget('cpu'),
      description: 'Add CPU widget (Ctrl+1)',
    },
    {
      key: '2',
      ctrl: true,
      action: () => actions.addWidget('ram'),
      description: 'Add Memory widget (Ctrl+2)',
    },
    {
      key: '3',
      ctrl: true,
      action: () => actions.addWidget('disk_read'),
      description: 'Add Disk widget (Ctrl+3)',
    },
    {
      key: '4',
      ctrl: true,
      action: () => actions.addWidget('net_sent'),
      description: 'Add Network widget (Ctrl+4)',
    },
    {
      key: '?',
      shift: true,
      action: () => setShowShortcuts(!showShortcuts),
      description: 'Show shortcuts (Shift+?)',
    },
  ])

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
      <PageControls />
      <main>
        <Dashboard />
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <SupportLinks />
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      {showShortcuts && (
        <div className="shortcuts-modal" role="dialog" aria-label="Keyboard shortcuts">
          <div className="shortcuts-content">
            <h3>Keyboard Shortcuts</h3>
            <button
              className="shortcuts-close"
              onClick={() => setShowShortcuts(false)}
              aria-label="Close shortcuts"
            >
              ×
            </button>
            <ul className="shortcuts-list">
              {shortcuts.map((shortcut, index) => (
                <li key={index} className="shortcut-item">
                  <span className="shortcut-description">{shortcut.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
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
