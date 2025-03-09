import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import DocumentUpload from './DocumentUpload.tsx';
import TaxChat from './TaxChat.tsx';
import TaxAnalysis from './TaxAnalysis.tsx';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth0();
  const [activeTab, setActiveTab] = useState<'upload' | 'analysis' | 'chat'>('upload');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleTabChange = (tab: 'upload' | 'analysis' | 'chat') => {
    if (tab !== activeTab) {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveTab(tab);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50); // Small delay to ensure the new content starts fading in
      }, 300); // Match this with the CSS transition duration
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Fiscally</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-700">Welcome, {user?.name}</span>
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => handleTabChange('upload')}
                className={`${
                  activeTab === 'upload'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } flex-1 py-4 px-1 text-center border-b-2 font-medium`}
              >
                Upload Documents
              </button>
              <button
                onClick={() => handleTabChange('analysis')}
                className={`${
                  activeTab === 'analysis'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } flex-1 py-4 px-1 text-center border-b-2 font-medium`}
              >
                Tax Analysis
              </button>
              <button
                onClick={() => handleTabChange('chat')}
                className={`${
                  activeTab === 'chat'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } flex-1 py-4 px-1 text-center border-b-2 font-medium`}
              >
                Taxi AI
              </button>
            </nav>
          </div>

          <div className="p-6">
            <div 
              className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
            >
              {activeTab === 'upload' && <DocumentUpload />}
              {activeTab === 'analysis' && <TaxAnalysis />}
              {activeTab === 'chat' && <TaxChat />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 