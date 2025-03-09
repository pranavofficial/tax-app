import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IDocument extends MongooseDocument {
  userId: string;
  filename: string;
  fileType: string;
  size: number;
  uploadDate: Date;
  path: string;
  location?: string;
  analysis?: any;
}

const DocumentSchema: Schema = new Schema({
  userId: { 
    type: String, 
    required: true,
    index: true // Add index for faster queries
  },
  filename: { type: String, required: true },
  fileType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadDate: { type: Date, default: Date.now },
  path: { type: String, required: true },
  location: { type: String },
  analysis: { type: Schema.Types.Mixed }
});

// Add a pre-find hook to ensure userId is always included in queries
DocumentSchema.pre('find', function() {
  if (!this.getQuery().userId) {
    console.warn('Document query without userId detected - this may indicate a security issue');
  }
});

export const Document = mongoose.model<IDocument>('Document', DocumentSchema); 