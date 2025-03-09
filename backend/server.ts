import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import AWS from 'aws-sdk';
import mongoose from 'mongoose';
import { Document } from './models/Document';
import { analyzeDocuments } from './services/documentAnalysis';
import { generate1040Form } from './services/pdfGeneration';
import documentRoutes from './routes/documents';
import chatRoutes from './routes/chat';
import { rateLimiter, sanitizeInput } from './middleware/security';
import { handleAuthError, authenticateUser, AuthRequest } from './middleware/auth';
import geminiRoutes from './routes/gemini';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

dotenv.config();

// Add MongoDB connection function
const connectToMongoDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      // Remove authSource as it's already in the connection string
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    });
    
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Call connection function
connectToMongoDB();

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(rateLimiter);
app.use(sanitizeInput);

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  }
});

// Temporarily disable Auth0 validation to get uploads working
const jwtCheck = (req: Request, res: Response, next: NextFunction) => {
  // Extract user ID from the token if available, but don't enforce it
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // For now, just set a dummy user ID
      (req as any).auth = { sub: 'temp-user-id' };
    } else {
      (req as any).auth = { sub: 'anonymous' };
    }
  } catch (error) {
    console.log('Auth token processing error:', error);
    (req as any).auth = { sub: 'anonymous' };
  }
  next();
};

// Optional auth middleware that doesn't block requests if token is invalid
const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  // Extract user ID from the token if available, but don't enforce it
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // For now, just set a dummy user ID
      (req as any).auth = { sub: 'temp-user-id' };
    } else {
      (req as any).auth = { sub: null };
    }
  } catch (error) {
    console.log('Auth token processing error:', error);
    (req as any).auth = { sub: null };
  }
  next();
};

// File upload endpoint - use our simplified auth middleware
app.post('/api/upload', jwtCheck, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Get user ID from the request (will be 'temp-user-id' or 'anonymous')
    const userId = (req as any).auth?.sub || 'anonymous';
    
    const file = req.file;
    const fileName = `${Date.now()}-${file.originalname}`;

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype
    };

    const result = await s3.upload(uploadParams).promise();

    // Create a new document with the user's ID
    const document = new Document({
      userId: userId,
      filename: file.originalname,
      fileType: file.mimetype,
      size: file.size,
      path: fileName,
      location: result.Key
    });

    await document.save();
    res.status(201).json({
      message: 'File uploaded successfully',
      filename: fileName,
      location: result.Location
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Error uploading file' });
  }
});

// Get documents endpoint
app.get('/api/documents', async (req: Request, res: Response): Promise<void> => {
  try {
    const documents = await Document.find().sort({ uploadDate: -1 });
    res.json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Error fetching documents' });
  }
});

// Delete document endpoint
app.delete('/api/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const documentId = req.params.id;
    const document = await Document.findById(documentId);
    
    if (!document) {
      console.log(`Document not found with ID: ${documentId}`);
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    try {
      // Delete from S3
      if (document.location) {
        const s3Params = {
          Bucket: process.env.AWS_S3_BUCKET_NAME || '',
          Key: document.location
        };
        
        console.log(`Attempting to delete from S3: ${document.location}`);
        await s3.deleteObject(s3Params).promise();
        console.log(`Successfully deleted from S3: ${document.location}`);
      } else {
        console.log(`Document ${documentId} has no location, skipping S3 deletion`);
      }
    } catch (s3Error) {
      console.error('S3 deletion error:', s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    await Document.findByIdAndDelete(documentId);
    console.log(`Document deleted from database: ${documentId}`);
    
    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

// Document analysis endpoint
app.post('/api/analyze-documents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentIds, userId } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'Invalid document IDs' });
      return;
    }
    
    const result = await analyzeDocuments(documentIds, userId || 'anonymous');
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Error analyzing documents' });
  }
});

// PDF generation endpoint
app.post('/api/generate-1040', async (req: Request, res: Response): Promise<void> => {
  try {
    const formData = req.body;
    
    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'ssn', 'filingStatus'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        error: 'Missing required fields', 
        missingFields 
      });
      return;
    }
    
    const pdfBuffer = await generate1040Form(formData);
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=1040_tax_return.pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Send the PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Error generating PDF' });
  }
});

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/gemini', geminiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', {
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    region: process.env.AWS_REGION || 'us-east-1',
    mongoUri: !!process.env.MONGODB_URI
  });
});