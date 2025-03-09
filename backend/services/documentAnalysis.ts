import { Document } from '../models/Document';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AWS from 'aws-sdk';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const s3 = new AWS.S3();

interface AnalysisResult {
  documents: any[];
  extractedData: Record<string, any>;
  missingFields: string[];
  error?: string;
  status?: 'success' | 'warning' | 'error';
}

interface CombinedData {
  personalInfo?: any;
  address?: any;
  income?: any;
}

export async function analyzeDocuments(documentIds: string[], userId: string): Promise<AnalysisResult> {
  try {
    console.log(`Starting document analysis for user ${userId} with documents: ${documentIds.join(', ')}`);
    
    // Fetch documents from MongoDB
    const documents = await Document.find({
      _id: { $in: documentIds },
      userId: userId
    });

    console.log(`Found ${documents.length} documents in database`);

    if (!documents.length) {
      console.log(`No documents found for user ${userId} with IDs: ${documentIds.join(', ')}`);
      return {
        documents: [],
        extractedData: {},
        missingFields: ['personalInfo', 'address', 'income']
      };
    }

    // Process each document with Gemini
    const processedDocs = await Promise.all(
      documents.map(async (doc) => {
        try {
          console.log(`Processing document: ${doc.filename}, location: ${doc.location}`);
          
          if (!doc.location) {
            throw new Error(`Document ${doc._id} has no location`);
          }
          
          const key = doc.location;
          
          console.log(`Fetching document from S3 with key: ${key}`);
          
          const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME || '',
            Key: key
          };
          
          try {
            const fileData = await s3.getObject(s3Params).promise();
            const fileBuffer = fileData.Body as Buffer;
            
            // For PDFs and images, we'd use Gemini's vision capabilities
            const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
            
            // Convert buffer to base64
            const base64Image = fileBuffer.toString('base64');
            
            // Create prompt for tax document analysis
            const prompt = `
              Analyze this tax document and extract all relevant information for an IRS 1040 form.
              Look for:
              - Personal information (name, SSN, address)
              - Income details (wages, interest, dividends, capital gains)
              - Deductions and credits
              - Filing status information
              
              Format the response as JSON with clear field names.
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
                  formType: "Unknown",
                  extractedData: { rawText: analysisText }
                };
              }
              
              // Update document with analysis results
              await Document.findOneAndUpdate(
                { _id: doc._id, userId: userId }, // Strict userId check
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
              
              // Return a structured error response
              return {
                documentId: doc._id,
                filename: doc.filename,
                error: 'Failed to parse analysis results',
                analysis: { rawText: analysisText }
              };
            }
          } catch (s3Error: unknown) {
            console.error(`Error fetching document from S3:`, s3Error);
            return {
              documentId: doc._id,
              filename: doc.filename,
              error: `Failed to retrieve document from storage: ${s3Error instanceof Error ? s3Error.message : 'Unknown error'}`
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
    const combinedData = processedDocs.reduce<CombinedData>((combined, doc) => {
      if (doc.analysis) {
        return {
          ...combined,
          ...doc.analysis
        };
      }
      return combined;
    }, {});

    // Identify missing fields
    const missingFields = [];
    if (!combinedData.personalInfo) missingFields.push('personalInfo');
    if (!combinedData.address) missingFields.push('address');
    if (!combinedData.income) missingFields.push('income');

    return {
      documents: processedDocs,
      extractedData: combinedData,
      missingFields
    };
  } catch (error) {
    console.error('Error in analyzeDocuments:', error);
    throw error;
  }
}
