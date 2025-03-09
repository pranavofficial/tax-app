import express, { Request, Response } from 'express';
import { authenticateUser, AuthRequest, handleAuthError } from '../middleware/security';
import { Document } from '../models/Document';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Store chat history for each user
const userChatHistory: Record<string, Array<{role: string, parts: Part[]}>> = {};

router.post('/', authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.auth!.sub;
    const { message, documentIds } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'Document IDs are required' });
      return;
    }
    
    // Verify all documents belong to the user
    const documents = await Document.find({
      _id: { $in: documentIds },
      userId: userId
    });
    
    if (documents.length === 0) {
      res.status(404).json({ error: 'No analyzed documents found' });
      return;
    }
    
    // Extract analysis data from documents
    const documentData = documents.map(doc => {
      return {
        filename: doc.filename,
        analysis: doc.analysis || {}
      };
    });
    
    // Initialize chat history for this user if it doesn't exist
    if (!userChatHistory[userId]) {
      userChatHistory[userId] = [];
    }
    
    // Add user message to history
    userChatHistory[userId].push({ 
      role: 'user', 
      parts: [{ text: message }] 
    });
    
    // Create context for the AI
    const context = `
      You are a helpful tax assistant. The user has uploaded the following tax documents:
      ${JSON.stringify(documentData, null, 2)}
      
      Answer the user's questions based on their tax documents. If you don't know the answer, say so.
      Be concise and helpful. Format currency values appropriately.
    `;
    
    // Get Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Start a chat session
    const chat = model.startChat({
      history: userChatHistory[userId],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
      },
    });
    
    // Generate a response
    const result = await chat.sendMessage(context + "\n\nUser question: " + message);
    const response = await result.response;
    const aiMessage = response.text();
    
    // Add AI response to history
    userChatHistory[userId].push({ 
      role: 'assistant', 
      parts: [{ text: aiMessage }] 
    });
    
    // Limit history length to prevent token limits
    if (userChatHistory[userId].length > 10) {
      userChatHistory[userId] = userChatHistory[userId].slice(-10);
    }
    
    res.json({ message: aiMessage });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a route to get analyzed documents
router.get('/analyzed', authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.auth!.sub;
    
    // Find documents that have been analyzed
    const documents = await Document.find({
      userId: userId,
      analysis: { $exists: true, $ne: null }
    });
    
    res.json({ documents });
  } catch (error) {
    console.error('Error fetching analyzed documents:', error);
    res.status(500).json({ error: 'Failed to fetch analyzed documents' });
  }
});

export default router; 