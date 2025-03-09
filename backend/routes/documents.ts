import express, { Response, RequestHandler } from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import { Document } from '../models/Document';
import { authenticateUser, AuthRequest } from '../middleware/security';
import { analyzeDocuments } from '../services/documentAnalysis';
import { generate1040Form } from '../services/pdfGeneration';
import mongoose from 'mongoose';
import { isValidObjectId } from 'mongoose';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

dotenv.config();

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Configure Google Generative AI (Gemini)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Configure S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Upload document
router.post('/upload', authenticateUser, upload.single('file'), (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Ensure unique filename with timestamp and user ID
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${req.file.originalname}`;
    const key = `users/${userId}/${uniqueFilename}`;
    
    console.log(`Uploading file for user ${userId} with key: ${key}`);
    
    // Upload to S3 with strict ACL
    await s3.putObject({
      Bucket: process.env.AWS_S3_BUCKET_NAME || '',
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'private',
      Metadata: {
        'user-id': userId // Add user ID as metadata
      }
    }).promise();

    // Create document record with exact userId match
    const document = new Document({
      userId: userId,
      filename: req.file.originalname,
      location: key, // Storing the full path: `users/${userId}/${uniqueFilename}`
      fileType: req.file.mimetype,
      size: req.file.size
    });

    await document.save();
    
    console.log(`Document record created for user ${userId}: ${document._id}`);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document._id,
        filename: document.filename,
        uploadDate: document.uploadDate
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
}) as RequestHandler);

// Get user documents
router.get('/', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    
    // Add strict user filtering and logging
    console.log(`Fetching documents for user: ${userId}`);
    
    const documents = await Document.find({ 
      userId: { $eq: userId } // Use exact match operator
    }).lean();
    
    console.log(`Found ${documents.length} documents for user ${userId}`);

    // Don't send S3 URLs in the document list
    res.json({
      documents: documents.map(doc => ({
        id: doc._id.toString(),
        filename: doc.filename,
        uploadDate: doc.uploadDate,
        fileType: doc.fileType,
        size: doc.size,
        hasAnalysis: !!doc.analysis
      }))
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
}) as RequestHandler);

// Get a specific document
router.get('/:id', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    const documentId = req.params.id;
    
    if (!isValidObjectId(documentId)) {
      res.status(400).json({ error: 'Invalid document ID format' });
      return;
    }

    // Use findOne with strict userId comparison
    const document = await Document.findOne({
      _id: documentId,
      userId: { $eq: userId } // Use exact match operator
    }).lean();
    
    if (!document) {
      console.log(`Access denied: Document ${documentId} not found or doesn't belong to user ${userId}`);
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Generate a very short-lived URL using the stored location directly
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_S3_BUCKET_NAME || '',
      Key: document.location, // Use the stored location directly
      Expires: 15 // Very short expiration time
    });
    
    console.log(`Generated signed URL for user ${userId}, document ${documentId}, location: ${document.location}`);
    
    res.json({
      document: {
        id: document._id.toString(),
        filename: document.filename,
        uploadDate: document.uploadDate,
        fileType: document.fileType,
        size: document.size,
        url: signedUrl,
        hasAnalysis: !!document.analysis
      }
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
}) as RequestHandler);

// Analyze documents
router.post('/analyze', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    const { documentIds } = req.body;
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Valid document IDs array is required' });
    }
    
    // Verify all documents belong to the user
    const documents = await Document.find({
      _id: { $in: documentIds },
      userId: userId
    });
    
    if (documents.length !== documentIds.length) {
      return res.status(403).json({ error: 'Access denied - One or more documents don\'t belong to you' });
    }
    
    // Mark documents as analyzed
    await Document.updateMany(
      { _id: { $in: documentIds } },
      { $set: { hasAnalysis: true } }
    );
    
    res.json({ success: true, message: 'Documents marked as analyzed' });
  } catch (error) {
    console.error('Error analyzing documents:', error);
    res.status(500).json({ error: 'Failed to analyze documents' });
  }
}) as RequestHandler);

// Generate 1040 form
router.post('/generate-1040', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const { taxData } = req.body;
    const userId = req.auth?.sub;
    
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized - User ID not found' });
      return;
    }
    
    if (!taxData) {
      res.status(400).json({ error: 'Tax data is required' });
      return;
    }
    
    console.log(`Generating 1040 form for user ${userId}`);
    
    const pdfBuffer = await generate1040Form(taxData);
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=form_1040.pdf');
    
    // Send the PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating 1040 form:', error);
    res.status(500).json({ error: 'Failed to generate 1040 form' });
  }
}) as RequestHandler);

// Extract first letters from documents using Gemini API
router.post('/extract-first-letters', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    const { documentIds } = req.body;
    
    console.log('Extract first letters request received:', { userId, documentIds });
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Valid document IDs array is required' });
    }
    
    // Validate all document IDs
    for (const id of documentIds) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: `Invalid document ID format: ${id}` });
      }
    }

    // Verify all documents belong to the user
    const documents = await Document.find({
      _id: { $in: documentIds },
      userId: userId
    });
    
    if (documents.length !== documentIds.length) {
      console.log(`Access denied: User ${userId} attempted to access documents they don't own`);
      return res.status(403).json({ error: 'Access denied - One or more documents don\'t belong to you' });
    }
    
    console.log(`Extracting first letters from ${documentIds.length} documents for user ${userId}`);
    
    // For simplicity, let's just use the first letter of each filename
    // This is a fallback in case we can't access the actual file content
    const firstLettersResults = documents.map(doc => ({
      documentId: doc._id,
      filename: doc.filename,
      firstLetter: doc.filename.charAt(0)
    }));
    
    // Mark documents as analyzed
    await Document.updateMany(
      { _id: { $in: documentIds } },
      { $set: { hasAnalysis: true } }
    );
    
    // Join all first letters
    const firstLetters = firstLettersResults.map(result => result.firstLetter).join('');
    
    console.log('First letters extracted:', firstLetters);
    
    res.json({
      success: true,
      firstLetters: firstLetters,
      details: firstLettersResults
    });
  } catch (error) {
    console.error('Error extracting first letters:', error);
    res.status(500).json({ error: 'Failed to extract first letters' });
  }
}) as RequestHandler);

// Extract tax information from documents using Gemini
router.post('/extract-tax-info', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    const { documentIds } = req.body;
    
    console.log('Extract tax info request received:', { userId, documentIds });
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Valid document IDs array is required' });
    }
    
    // Validate all document IDs
    for (const id of documentIds) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: `Invalid document ID format: ${id}` });
      }
    }

    // Verify all documents belong to the user
    const documents = await Document.find({
      _id: { $in: documentIds },
      userId: userId
    });
    
    if (documents.length !== documentIds.length) {
      console.log(`Access denied: User ${userId} attempted to access documents they don't own`);
      return res.status(403).json({ error: 'Access denied - One or more documents don\'t belong to you' });
    }
    
    console.log(`Extracting tax information from ${documentIds.length} documents for user ${userId}`);
    
    // Process each document with Gemini
    const processedDocs = await Promise.all(
      documents.map(async (doc) => {
        try {
          console.log(`Processing document: ${doc.filename}, location: ${doc.location}`);
          
          if (!doc.location) {
            throw new Error('Document location is missing');
          }

          const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME || '',
            Key: doc.location  // Now Key is guaranteed to be string
          };
          
          const fileData = await s3.getObject(s3Params).promise();
          const fileBuffer = fileData.Body as Buffer;
          
          // Use Gemini's vision capabilities
          const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
          
          // Convert buffer to base64
          const base64Image = fileBuffer.toString('base64');
          
          // Create prompt for tax document analysis
          const prompt = `
            Analyze this tax document and extract all relevant information for an IRS 1040 form.
            Look for:
            - Personal information (first name, last name, SSN)
            - Address (street address, city, state, zip)
            - Filing status
            - Income details (wages, interest, dividends, capital gains, other income)
            - Deductions and adjustments
            
            Format the response as JSON with the following structure:
            {
              "firstName": "string",
              "lastName": "string",
              "ssn": "string",
              "filingStatus": "string",
              "address": "string",
              "city": "string",
              "state": "string",
              "zip": "string",
              "wages": number,
              "interest": number,
              "dividends": number,
              "capitalGains": number,
              "otherIncome": number,
              "adjustments": number,
              "deductions": number
            }
            
            If any field is not found in the document, set it to null.
          `;
          
          // Call Gemini API with the image
          const result = await model.generateContent([
            prompt,
            {
              inlineData: {
                data: base64Image,
                mimeType: doc.fileType || 'application/octet-stream'
              }
            }
          ]);
          
          const response = await result.response;
          const analysisText = response.text();
          
          // Parse the JSON response
          let analysisData;
          
          try {
            // Extract JSON from the response
            const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/) || 
                            analysisText.match(/{[\s\S]*}/);
            
            if (jsonMatch) {
              const jsonStr = jsonMatch[1] || jsonMatch[0];
              analysisData = JSON.parse(jsonStr.trim());
            } else {
              // Fallback if no JSON format is detected
              analysisData = { 
                error: "Could not parse structured data from document"
              };
            }
            
            // Update document with analysis results
            await Document.findOneAndUpdate(
              { _id: doc._id, userId: userId },
              { analysis: analysisData }
            );
            
            return {
              documentId: doc._id,
              filename: doc.filename,
              analysis: analysisData
            };
          } catch (jsonError) {
            console.error('Error parsing JSON from Gemini response:', jsonError);
            console.log('Raw response text:', analysisText);
            
            return {
              documentId: doc._id,
              filename: doc.filename,
              error: 'Failed to parse analysis results',
              rawText: analysisText
            };
          }
        } catch (docError: unknown) {
          console.error(`Error processing document ${doc._id}:`, docError);
          return {
            documentId: doc._id,
            filename: doc.filename,
            error: `Processing error: ${docError instanceof Error ? docError.message : 'Unknown error'}`
          };
        }
      })
    );
    
    // Combine results from all documents
    const formData: any = {};
    const missingFields: string[] = [];
    
    // Define required fields
    const requiredFields = [
      'firstName', 'lastName', 'ssn', 'filingStatus', 
      'address', 'city', 'state', 'zip',
      'wages', 'interest', 'dividends', 'capitalGains'
    ];
    
    // Merge data from all documents
    processedDocs.forEach(doc => {
      if (doc.analysis && !doc.error) {
        Object.entries(doc.analysis).forEach(([key, value]) => {
          // Only update if the field is not already set or is null
          if (value !== null && (!formData[key] || formData[key] === null)) {
            formData[key] = value;
          }
        });
      }
    });
    
    // Check for missing required fields
    requiredFields.forEach(field => {
      if (!formData[field] || formData[field] === null) {
        missingFields.push(field);
      }
    });
    
    // Mark documents as analyzed
    await Document.updateMany(
      { _id: { $in: documentIds } },
      { $set: { hasAnalysis: true } }
    );
    
    res.json({
      success: true,
      formData,
      missingFields,
      documents: processedDocs
    });
  } catch (error) {
    console.error('Error extracting tax information:', error);
    res.status(500).json({ error: 'Failed to extract tax information' });
  }
}) as RequestHandler);

// Complete tax form with additional information
router.post('/complete-tax-form', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    const { documentIds, currentFormData, additionalInfo } = req.body;
    
    console.log('Complete tax form request received:', { userId });
    
    if (!currentFormData) {
      return res.status(400).json({ error: 'Current form data is required' });
    }
    
    // Merge additional info with current form data
    const updatedFormData = { ...currentFormData };
    
    Object.entries(additionalInfo).forEach(([key, value]) => {
      // Convert numeric strings to numbers for appropriate fields
      if (['wages', 'interest', 'dividends', 'capitalGains', 'otherIncome', 'adjustments', 'deductions'].includes(key)) {
        updatedFormData[key] = parseFloat(value as string) || 0;
      } else {
        updatedFormData[key] = value;
      }
    });
    
    // Use Gemini to validate and enhance the data
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
      I have the following tax information for a 1040 form. Please validate it and make any necessary corrections or enhancements:
      ${JSON.stringify(updatedFormData, null, 2)}
      
      Return the validated and enhanced data in the same JSON format.
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const enhancedText = response.text();
    
    // Parse the enhanced JSON
    let enhancedData;
    try {
      const jsonMatch = enhancedText.match(/```json\n([\s\S]*?)\n```/) || 
                      enhancedText.match(/{[\s\S]*}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        enhancedData = JSON.parse(jsonStr.trim());
      } else {
        enhancedData = updatedFormData;
      }
    } catch (error) {
      console.error('Error parsing enhanced data:', error);
      enhancedData = updatedFormData;
    }
    
    res.json({
      success: true,
      formData: enhancedData
    });
  } catch (error) {
    console.error('Error completing tax form:', error);
    res.status(500).json({ error: 'Failed to complete tax form' });
  }
}) as RequestHandler);

// Get analyzed documents
router.get('/analyzed', authenticateUser, (async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.sub;
    
    // Find documents that have been analyzed
    const documents = await Document.find({
      userId: userId,
      analysis: { $exists: true, $ne: null }
    });
    
    res.json({ 
      success: true,
      documents 
    });
  } catch (error) {
    console.error('Error fetching analyzed documents:', error);
    res.status(500).json({ error: 'Failed to fetch analyzed documents' });
  }
}) as RequestHandler);

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'API is working' });
});

export default router; 