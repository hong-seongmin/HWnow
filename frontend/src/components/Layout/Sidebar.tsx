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
        <div className="widget-category">
          <h4>System Resources</h4>
          <button className="add-widget-button" onClick={() => addWidget('cpu')}>CPU</button>
          <button className="add-widget-button" onClick={() => addWidget('ram')}>RAM</button>
          <button className="add-widget-button" onClick={() => addWidget('memory_detail')}>Memory Detail</button>
          <button className="add-widget-button" onClick={() => addWidget('gpu')}>GPU</button>
        </div>
        
        <div className="widget-category">
          <h4>Storage & Network</h4>
          <button className="add-widget-button" onClick={() => addWidget('disk_read')}>Disk I/O</button>
          <button className="add-widget-button" onClick={() => addWidget('disk_space')}>Disk Space</button>
          <button className="add-widget-button" onClick={() => addWidget('net_sent')}>Network I/O</button>
          <button className="add-widget-button" onClick={() => addWidget('network_status')}>Network Status</button>
        </div>
        
        <div className="widget-category">
          <h4>System Info</h4>
          <button className="add-widget-button" onClick={() => addWidget('system_uptime')}>System Uptime</button>
          <button className="add-widget-button" onClick={() => addWidget('process_monitor')}>Top Processes</button>
          <button className="add-widget-button" onClick={() => addWidget('gpu_process')}>GPU Processes</button>
          <button className="add-widget-button" onClick={() => addWidget('battery')}>Battery</button>
          <button className="add-widget-button" onClick={() => addWidget('system_log')}>System Logs</button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar; 