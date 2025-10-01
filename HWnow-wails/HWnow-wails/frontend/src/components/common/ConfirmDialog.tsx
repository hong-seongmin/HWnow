import React from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'default' | 'danger' | 'warning';
  icon?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'default',
  icon
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          iconColor: 'var(--color-error)',
          confirmButtonClass: 'danger'
        };
      case 'warning':
        return {
          iconColor: 'var(--color-warning)',
          confirmButtonClass: 'warning'
        };
      default:
        return {
          iconColor: 'var(--color-primary)',
          confirmButtonClass: 'primary'
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '1rem 0'
      }}>
        {icon && (
          <div style={{
            fontSize: '3rem',
            color: typeStyles.iconColor,
            marginBottom: '1rem'
          }}>
            {icon}
          </div>
        )}
        
        <div style={{
          fontSize: '1rem',
          lineHeight: 1.5,
          color: 'var(--color-text-primary)',
          marginBottom: '1.5rem',
          maxWidth: '400px'
        }}>
          {message}
        </div>
        
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          width: '100%'
        }}>
          <button
            className="modal-button"
            onClick={onClose}
            style={{
              minWidth: '100px',
              padding: '0.75rem 1.5rem'
            }}
          >
            {cancelText}
          </button>
          
          <button
            className={`modal-button ${typeStyles.confirmButtonClass}`}
            onClick={handleConfirm}
            style={{
              minWidth: '100px',
              padding: '0.75rem 1.5rem'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Hook for using confirm dialog
export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'default' | 'danger' | 'warning';
    icon?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const showConfirm = React.useCallback((config: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'default' | 'danger' | 'warning';
    icon?: string;
    onConfirm?: () => void;
  }) => {
    setDialogState({
      isOpen: true,
      ...config
    });
  }, []);

  const hideConfirm = React.useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleConfirm = React.useCallback(() => {
    if (dialogState.onConfirm) {
      dialogState.onConfirm();
    }
    hideConfirm();
  }, [dialogState.onConfirm, hideConfirm]);

  const handleCancel = React.useCallback(() => {
    if (dialogState.onCancel) {
      dialogState.onCancel();
    }
    hideConfirm();
  }, [dialogState.onCancel, hideConfirm]);

  // Promise-based confirm dialog
  const confirmDialog = React.useCallback((config: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'default' | 'danger' | 'warning';
    icon?: string;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        ...config,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  }, []);

  const ConfirmComponent = React.useMemo(() => (
    <ConfirmDialog
      isOpen={dialogState.isOpen}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title={dialogState.title}
      message={dialogState.message}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      type={dialogState.type}
      icon={dialogState.icon}
    />
  ), [dialogState, handleCancel, handleConfirm]);

  return {
    confirmDialog,
    showConfirm,
    hideConfirm,
    ConfirmComponent
  };
};