import React, { useState, useRef, useEffect } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import './PageTabs.css';

export const PageTabs: React.FC = () => {
  const { pages, activePageIndex, actions } = useDashboardStore();
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPageId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingPageId]);
  
  const handleEdit = (pageId: string, currentName: string) => {
    setEditingPageId(pageId);
    setEditingName(currentName);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  };

  const handleNameBlur = () => {
    if (editingPageId && editingName.trim()) {
      actions.updatePageName(editingPageId, editingName.trim());
    }
    setEditingPageId(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameBlur();
    }
  };

  return (
    <div className="page-tabs-container">
      <div className="page-tabs" role="tablist">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={`page-tab ${index === activePageIndex ? 'active' : ''}`}
            onClick={() => actions.setActivePageIndex(index)}
            onDoubleClick={() => handleEdit(page.id, page.name)}
            role="tab"
            aria-selected={index === activePageIndex}
          >
            {editingPageId === page.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editingName}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                onKeyPress={handleKeyPress}
                className="page-name-input"
              />
            ) : (
              <span className="page-name">{page.name}</span>
            )}
            <button
              className="page-delete-button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`'${page.name}' 페이지를 삭제하시겠습니까?`)) {
                  actions.removePage(page.id);
                }
              }}
              aria-label={`'${page.name}' 페이지 삭제`}
            >
              ×
            </button>
          </div>
        ))}
        <button 
          className="add-page-button" 
          onClick={actions.addPage}
          aria-label="새 페이지 추가"
        >
          +
        </button>
      </div>
    </div>
  );
}; 