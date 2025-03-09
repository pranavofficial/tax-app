import express, { Request, Response, RequestHandler } from 'express';
import { authenticateUser, AuthRequest } from '../middleware/security';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { Document } from '../models/Document';

const router = express.Router();

// Initialize Gemini API with the correct API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Store chat history with correct types
const userChatHistory: Record<string, Array<{role: string, parts: Part[]}>> = {};

const systemPrompt = `You are Taxi AI, an intelligent tax assistant who identifies as she/her. 
Your name is Taxi (short for Taxi AI) and you should refer to yourself as such.
You are designed to help users with tax-related questions and document analysis.

Provide a helpful, accurate, and concise response.`;

// Debug middleware to log requests
router.use('/chat', (req, res, next) => {
  console.log('Gemini chat request received:', {
    method: req.method,
    path: req.path,
    headers: {
      authorization: req.headers.authorization ? 'Bearer [token]' : 'None',
      'content-type': req.headers['content-type']
    },
    body: req.body
  });
  next();
});

router.post('/chat', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    console.log('Authenticated user:', req.auth?.sub);
    const userId = req.auth?.sub;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log('Processing message for user:', userId);
    
    // Initialize chat history for this user if it doesn't exist
    if (!userChatHistory[userId]) {
      userChatHistory[userId] = [];
    }
    
    // Add user message to history
    userChatHistory[userId].push({
      role: 'user',
      parts: [{ text: message }]
    });
    
    // Fetch all analyzed documents for this user
    const documents = await Document.find({
      userId: userId,
      analysis: { $exists: true, $ne: null }
    });
    
    // Extract document information to provide context
    const documentContext = documents.map(doc => {
      return {
        filename: doc.filename,
        fileType: doc.fileType,
        uploadDate: doc.uploadDate,
        analysis: doc.analysis
      };
    });
    
    // Create context for the AI with document information
    const context = `
      You are a helpful tax assistant. You have access to the following tax documents and their analysis:
      ${JSON.stringify(documentContext, null, 2)}
      
      Use this information to provide personalized tax advice and answer questions.
      If you don't have enough information, politely ask for more details or suggest uploading additional documents.
      Always maintain confidentiality and privacy of the user's tax information.
    `;
    
    // Initialize Gemini API with the correct model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    // Create a chat session
    const chat = model.startChat({
      history: userChatHistory[userId],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
      systemInstruction: systemPrompt,
    });
    
    console.log('Sending request to Gemini API');
    
    // Generate a response
    const result = await chat.sendMessage(message);
    const aiMessage = result.response.text();
    
    console.log('Received response from Gemini API');
    
    // Add AI response to history
    userChatHistory[userId].push({
      role: 'assistant',
      parts: [{ text: aiMessage }]
    });
    
    // Limit history length to prevent token limits
    if (userChatHistory[userId].length > 10) {
      userChatHistory[userId] = userChatHistory[userId].slice(-10);
    }
    
    res.json({ response: aiMessage });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: 'Failed to process your request' });
  }
}) as RequestHandler);

// Simple chat endpoint that doesn't require authentication
router.post('/simple-chat', (async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log('Received message:', message);
    console.log('Using API key:', process.env.GEMINI_API_KEY ? 'API key is set' : 'API key is missing');
    
    // Initialize Gemini API with the correct model name
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    console.log('Sending request to Gemini API');
    
    // Generate a response
    const result = await model.generateContent(`${systemPrompt}
      
      User: ${message}
    `);
    
    console.log('Received response from Gemini API');
    
    const response = result.response;
    const aiMessage = response.text();
    
    res.json({ response: aiMessage });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ 
      error: 'Failed to process your request',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}) as RequestHandler);

export default router; 