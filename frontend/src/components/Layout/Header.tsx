import './Header.css';
import ThemeToggle from '../common/ThemeToggle';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useToast } from '../../contexts/ToastContext';
import Tooltip from '../common/Tooltip';

export const Header = () => {
  const { saveLayouts, resetLayouts } = useDashboardStore((state) => state.actions);
  const { showSuccess } = useToast();

  const handleSave = () => {
    saveLayouts();
    showSuccess('Layout saved successfully!');
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset the layout to default?')) {
      resetLayouts();
      showSuccess('Layout has been reset to default.');
    }
  };

  return (
    <header className="header">
      <div className="app-title">
        <img src="/HWnow.png" alt="HWnow Logo" className="header-logo-img" />
        <span className="app-name">HWnow</span>
      </div>
      <div className="header-actions">
        <Tooltip content="Save current layout (Ctrl+S)">
          <button className="header-button" onClick={handleSave} aria-label="Save layout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip content="Reset to default layout">
          <button className="header-button" onClick={handleReset} aria-label="Reset layout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M1 20v-6a8 8 0 0 1 8-8h11" />
              <polyline points="1 14 1 20 7 20" />
              <path d="M23 4v6a8 8 0 0 1-8 8H4" />
            </svg>
          </button>
        </Tooltip>
        <ThemeToggle />
      </div>
    </header>
  );
}; 