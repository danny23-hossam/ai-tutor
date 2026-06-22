import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Apply persisted dark mode before first render (prevents flash on any page reload)
if (localStorage.getItem('darkmode') === 'true') {
  document.body.classList.add('darkmode');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
       <App />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>,
)
