// filepath: /Users/pranavprabhu/Documents/HTML/tax-app/src/App.tsx
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import Dashboard from './components/Dashboard';

function App() {
  const { isAuthenticated, isLoading, user } = useAuth0();

  console.log('Auth State:', { isAuthenticated, isLoading, user });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? (
              <Dashboard />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        <Route 
          path="/login" 
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <LandingPage />
            )
          } 
        />
        {/* Catch all route - redirect to main route */}
        <Route 
          path="*" 
          element={
            <Navigate to={isAuthenticated ? "/" : "/login"} replace />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;