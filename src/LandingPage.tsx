// filepath: /Users/pranavprabhu/Documents/HTML/tax-app/src/LandingPage.tsx
import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Navigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    loginWithRedirect({
      appState: { 
        returnTo: "/" 
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <header className="text-center mb-8">
        <h1 className="text-9xl font-bold text-blue-600 mb-2">FISCALLY</h1>
        <p className="text-xl text-gray-600">Making Taxes Easier With AI!</p>
      </header>
      
      <main className="bg-white shadow rounded-lg p-8 w-full max-w-md">
        <div className="text-center">
          <p className="text-lg mb-6">Please log in to continue</p>
          <button 
            className="w-full bg-blue-500 text-white px-4 py-3 rounded hover:bg-blue-600 transition-colors font-medium"
            onClick={handleLogin}
          >
            Login
          </button>
        </div>
      </main>
    </div>
  );
};

export default LandingPage;