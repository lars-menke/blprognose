import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { runBacktest, runCalibration } from './lib/backtest';

// Expose backtest helpers in browser console for analysis
(window as unknown as Record<string, unknown>).__backtest = runBacktest;
(window as unknown as Record<string, unknown>).__calibration = runCalibration;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
