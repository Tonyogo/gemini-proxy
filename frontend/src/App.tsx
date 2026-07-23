import React, { useState } from 'react';
import DashboardView from './components/DashboardView';
import LogsView from './components/LogsView';
import PlaygroundView from './components/PlaygroundView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'playground'>('dashboard');
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');

  const handleKeyChange = (val: string) => {
    setAdminKey(val);
    localStorage.setItem('adminKey', val);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-xl text-blue-400">Gemini Proxy</span>
          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">Admin UI</span>
        </div>
        <nav className="flex space-x-4">
          {(['dashboard', 'logs', 'playground'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded text-sm font-medium capitalize ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="flex items-center space-x-2">
          <label className="text-xs text-slate-400">Admin Key:</label>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="x-admin-key"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </header>

      <main className="flex-1 p-6">
        {activeTab === 'dashboard' && <DashboardView adminKey={adminKey} />}
        {activeTab === 'logs' && <LogsView adminKey={adminKey} />}
        {activeTab === 'playground' && <PlaygroundView />}
      </main>
    </div>
  );
}
