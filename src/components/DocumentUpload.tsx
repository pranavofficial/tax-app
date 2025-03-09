import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';

interface Document {
  _id: string;
  filename: string;
  location: string;
  uploadDate: string;
  fileType: string;
  size: number;
}

const DocumentUpload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  // Fetch existing documents
  const fetchDocuments = async () => {
    try {
      let response;
      
      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        response = await axios.get('http://localhost:3001/api/documents', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } else {
        response = await axios.get('http://localhost:3001/api/documents');
      }
      
      setDocuments(response.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError('Error loading documents');
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [isAuthenticated]);

  // Handle file upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setUploading(true);
    setError(null);
    
    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const token = await getAccessTokenSilently();
      await axios.post('http://localhost:3001/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      
      // Refresh document list
      fetchDocuments();
    } catch (error) {
      console.error('Upload error:', error);
      setError('Error uploading file. Please make sure you are logged in.');
    } finally {
      setUploading(false);
    }
  }, [getAccessTokenSilently, fetchDocuments, isAuthenticated]);

  // Handle document deletion
  const handleDelete = async (id: string) => {
    try {
      let config = {};
      
      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        config = {
          headers: {
            Authorization: `Bearer ${token}`
          }
        };
      }
      
      await axios.delete(`http://localhost:3001/api/documents/${id}`, config);
      
      // Update document list
      setDocuments(documents.filter(doc => doc._id !== id));
    } catch (error) {
      console.error('Delete error:', error);
      setError('Error deleting document');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxSize: 5 * 1024 * 1024 // 5MB
  });

  return (
    <div className="p-4">
      {/* Upload Section */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed p-8 text-center cursor-pointer ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p>Uploading...</p>
        ) : isDragActive ? (
          <p>Drop the file here...</p>
        ) : (
          <p>Drag and drop a file here, or click to select a file</p>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Uploaded Documents Section */}
      {documents.length > 0 && (
        <div className="mt-8 mb-8">
          <h2 className="text-xl font-semibold mb-4">Uploaded Documents</h2>
          <div className="space-y-4">
            {documents.map((doc) => (
              <div
                key={doc._id}
                className="p-4 border rounded shadow-sm flex justify-between items-center"
              >
                <div>
                  <p className="font-medium">{doc.filename}</p>
                  <p className="text-sm text-gray-500">
                    Uploaded: {new Date(doc.uploadDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <a
                    href={doc.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700"
                  >
                    View
                  </a>
                  <button
                    onClick={() => handleDelete(doc._id)}
                    className="text-red-500 hover:text-red-700 focus:outline-none"
                    aria-label="Delete document"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required Documents Guide Section */}
      <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Required Tax Documents</h2>
        
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Personal Information</h3>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Social Security number or ITIN for all individuals on return</li>
              <li>Bank account and routing numbers</li>
              <li>Previous year's AGI and refund amount</li>
              <li>Current address and name on record with SSA</li>
              <li>IP PIN (if received from IRS)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Income Forms</h3>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Form W-2 (wages from employers)</li>
              <li>Form W-2G (gambling winnings)</li>
              <li>Form 1099-K (payment card/online marketplace payments)</li>
              <li>Form 1099-G (government payments)</li>
              <li>Form 1099-INT (interest income)</li>
              <li>Form 1099-DIV (dividends and distributions)</li>
              <li>Form 1099-NEC (freelance/contractor income)</li>
              <li>Form 1099-R (retirement distributions)</li>
              <li>Form SSA-1099 (Social Security benefits)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Deduction Documents</h3>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Childcare expenses</li>
              <li>Mortgage and property tax records</li>
              <li>Charitable donation receipts</li>
              <li>HSA/FSA contributions</li>
              <li>Healthcare expenses</li>
              <li>Retirement contributions</li>
              <li>Education expenses (students/teachers)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Self-Employment Records</h3>
            <ul className="list-disc pl-5 space-y-1 text-gray-600">
              <li>Bank and payment processor statements</li>
              <li>Business income records</li>
              <li>Travel and expense receipts</li>
              <li>Office expense records</li>
              <li>Estimated tax payment records</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DocumentUpload;