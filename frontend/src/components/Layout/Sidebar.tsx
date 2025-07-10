// import React from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import './Sidebar.css';

const Sidebar = () => {
  const { addWidget } = useDashboardStore((state) => state.actions);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/HWnow.png" alt="HWnow Logo" className="sidebar-logo-img" />
      </div>
      <div className="widget-adder">
        <h3>Add Widget</h3>
        <button className="add-widget-button" onClick={() => addWidget('cpu')}>CPU</button>
        <button className="add-widget-button" onClick={() => addWidget('ram')}>RAM</button>
        <button className="add-widget-button" onClick={() => addWidget('disk_read')}>Disk</button>
        <button className="add-widget-button" onClick={() => addWidget('net_sent')}>Network</button>
      </div>
    </aside>
  );
};

export default Sidebar; 