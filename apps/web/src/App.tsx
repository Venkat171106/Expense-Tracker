import React from 'react';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-sans">
      <div className="max-w-md p-8 bg-slate-800 rounded-xl shadow-lg border border-slate-700 text-center">
        <h1 className="text-2xl font-bold text-emerald-400 mb-2">Personal Finance OS</h1>
        <p className="text-slate-400 text-sm mb-4">Phase 1 - Web Foundation Initialized</p>
        <div className="p-3 bg-slate-950 rounded text-xs text-slate-300 font-mono text-left">
          <div>API Prefix: /api/v1</div>
          <div>Monetary Unit: Paise (BigInt)</div>
          <div>Ledger Model: Header + Line Items</div>
        </div>
      </div>
    </div>
  );
};
