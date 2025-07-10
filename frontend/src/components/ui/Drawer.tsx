import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import './Drawer.css';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Drawer = ({ isOpen, onClose, title, children, size = 'md' }: DrawerProps) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="drawer-backdrop" 
      onClick={handleBackdropClick}
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="drawer-title"
    >
      <div 
        ref={drawerRef}
        className={`drawer drawer--${size}`}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <h2 id="drawer-title" className="drawer-title">{title}</h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </Button>
        </div>
        <div className="drawer-content">
          {children}
        </div>
      </div>
    </div>
  );
}; 