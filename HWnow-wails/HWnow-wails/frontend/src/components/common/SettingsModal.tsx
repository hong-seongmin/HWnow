import React from 'react';
import { Modal } from './Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  children: React.ReactNode;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {children}
      <div className="modal-footer">
        <button className="modal-button" onClick={onClose}>Cancel</button>
        <button className="modal-button primary" onClick={onSave}>Save</button>
      </div>
    </Modal>
  );
}; 