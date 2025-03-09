import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const TaxChat: React.FC = () => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: "Hello! My name is Taxi, your personal tax assistant. How can I help you today?",
    timestamp: new Date()
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Auto-scroll to bottom of chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    
    setChatHistory(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Sending message to API:', message);
      
      // Direct call to Gemini API without authentication
      const response = await axios.post(
        `${apiUrl}/api/gemini/simple-chat`,
        { message: userMessage.content },
        { 
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      console.log('Received response:', response.data);
      
      // Add assistant response to chat
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.data.response || "I'm sorry, I couldn't process your request.",
        timestamp: new Date()
      };
      
      setChatHistory(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Error sending message:', err);
      
      // Add error message to chat
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I'm sorry, I encountered an error processing your request: ${err.response?.data?.details || err.message}`,
        timestamp: new Date()
      }]);
      
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto mb-4 p-4 bg-gray-50 rounded-lg">
        {chatHistory.map((msg) => (
          <div 
            key={msg.id} 
            className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div 
              className={`inline-block p-3 rounded-lg max-w-[80%] ${
                msg.role === 'user' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {msg.content}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="text-left mb-4">
            <div className="inline-block p-3 rounded-lg bg-gray-200 text-gray-800">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce mr-1"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce mr-1" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask a question about taxes..."
          className="flex-1 p-2 border border-gray-300 rounded"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300"
          disabled={isLoading || !message.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default TaxChat; 