import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
let google_screet="725060787408-t5gk57mdt1tnr0p8nm042fa9d3g9nj9e.apps.googleusercontent.com"

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={google_screet}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
