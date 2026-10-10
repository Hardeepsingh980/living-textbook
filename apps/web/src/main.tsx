import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { useStore } from './lib/store';
if (import.meta.env.DEV) (window as any).lb = useStore;

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
