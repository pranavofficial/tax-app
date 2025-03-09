import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import axios from 'axios';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';

interface Document {
  _id: string;
  filename: string;
  uploadDate: string;
  fileType: string;
  size: number;
  hasAnalysis: boolean;
}

interface FirstLetterResult {
  documentId: string;
  filename: string;
  firstLetter: string;
}

interface TaxFormData {
  firstName: string;
  lastName: string;
  ssn: string;
  filingStatus: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  wages: number;
  interest: number;
  dividends: number;
  capitalGains: number;
  otherIncome: number;
  adjustments: number;
  deductions: number;
  [key: string]: string | number;
}

const TaxAnalysis: React.FC = () => {
  const { getAccessTokenSilently } = useAuth0();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [formData, setFormData] = useState<TaxFormData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState<Record<string, string>>({});
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualFormData, setManualFormData] = useState<TaxFormData>({
    firstName: '',
    lastName: '',
    ssn: '',
    filingStatus: 'single',
    address: '',
    city: '',
    state: '',
    zip: '',
    wages: 0,
    interest: 0,
    dividends: 0,
    capitalGains: 0,
    otherIncome: 0,
    adjustments: 0,
    deductions: 0
  });
  const [error, setError] = useState<string | null>(null);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await axios.get(`${apiUrl}/api/documents`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        // Handle both response formats
        let docs;
        if (Array.isArray(response.data)) {
          docs = response.data;
        } else if (response.data && response.data.documents && Array.isArray(response.data.documents)) {
          docs = response.data.documents;
        } else {
          throw new Error("Invalid response format");
        }
        
        setDocuments(docs);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching documents:', error);
        setError('Failed to load documents. Please try again later.');
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [getAccessTokenSilently, apiUrl]);

  const handleDocumentSelect = (documentId: string) => {
    setSelectedDocuments(prev => {
      if (prev.includes(documentId)) {
        return prev.filter(id => id !== documentId);
      } else {
        return [...prev, documentId];
      }
    });
  };

  // Simulated document analysis without backend API call
  const handleAnalyzeDocuments = async () => {
    if (selectedDocuments.length === 0) {
      setError('Please select at least one document to analyze');
      return;
    }

    setAnalyzing(true);
    setError(null);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update documents as analyzed
      const updatedDocs = documents.map(doc => {
        if (selectedDocuments.includes(doc._id)) {
          return { ...doc, hasAnalysis: true };
        }
        return doc;
      });
      setDocuments(updatedDocs);
      
      // Simulate partial data extraction
      const simulatedFormData: TaxFormData = {
        firstName: "John",
        lastName: "Doe",
        ssn: "123456789",
        filingStatus: "Single",
        address: "123 Main St",
        city: "Anytown",
        state: "CA",
        zip: "12345",
        wages: 75000,
        interest: 1200,
        dividends: 850,
        capitalGains: 3000,
        otherIncome: 0,
        adjustments: 0,
        deductions: 12950
      };
      
      // Simulate missing fields
      const simulatedMissingFields = ['otherIncome', 'adjustments'];
      
      setFormData(simulatedFormData);
      setMissingFields(simulatedMissingFields);
      
      // Initialize additionalInfo with empty strings for missing fields
      const initialAdditionalInfo: Record<string, string> = {};
      simulatedMissingFields.forEach((field: string) => {
        initialAdditionalInfo[field] = '';
      });
      setAdditionalInfo(initialAdditionalInfo);
      
    } catch (error) {
      console.error('Error analyzing documents:', error);
      setError('Failed to analyze documents. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAdditionalInfoChange = (field: string, value: string) => {
    setAdditionalInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleManualEntryChange = (field: string, value: string | number) => {
    setManualFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCompleteForm = async () => {
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update form data with additional info
      if (formData) {
        const updatedFormData = { ...formData };
        
        Object.entries(additionalInfo).forEach(([key, value]) => {
          if (['wages', 'interest', 'dividends', 'capitalGains', 'otherIncome', 'adjustments', 'deductions'].includes(key)) {
            updatedFormData[key as keyof TaxFormData] = parseFloat(value) || 0;
          } else {
            updatedFormData[key as keyof TaxFormData] = value;
          }
        });
        
        setFormData(updatedFormData);
        setMissingFields([]);
      }
    } catch (error) {
      console.error('Error completing form:', error);
      setError('Failed to complete the form. Please try again.');
    }
  };

  const handleSubmitManualEntry = () => {
    setFormData(manualFormData);
    setMissingFields([]);
    setShowManualEntry(false);
  };

  // Simplified PDF generation function with adjusted spacing
  const generateTaxFormPDF = async () => {
    if (!formData) return;
    
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Add a blank page with US Letter dimensions
      const page = pdfDoc.addPage([612, 792]);
      
      // Get the fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Draw form header with more space between elements
      page.drawText('Form 1040', {
        x: 50,
        y: 750,
        size: 24,
        font: boldFont,
      });
      
      // Increased spacing between "1040" and the title
      page.drawText('U.S. Individual Income Tax Return', {
        x: 200,  // Moved further to the right
        y: 750,
        size: 16,
        font: boldFont,
      });
      
      // Moved "2024" further to the right
      page.drawText('2024', {
        x: 500,  // Increased from 450 to 500
        y: 750,
        size: 16,
        font: boldFont,
      });
      
      // Draw horizontal line
      page.drawLine({
        start: { x: 50, y: 740 },
        end: { x: 562, y: 740 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      
      // Personal information section
      page.drawText('Your Information:', {
        x: 50,
        y: 710,
        size: 14,
        font: boldFont,
      });
      
      // Name
      page.drawText(`Name: ${formData.firstName} ${formData.lastName}`, {
        x: 50,
        y: 680,
        size: 12,
        font: font,
      });
      
      // SSN (masked for security)
      page.drawText(`SSN: XXX-XX-${formData.ssn.slice(-4)}`, {
        x: 350,
        y: 680,
        size: 12,
        font: font,
      });
      
      // Address
      page.drawText(`Address: ${formData.address}`, {
        x: 50,
        y: 660,
        size: 12,
        font: font,
      });
      
      // City, State, ZIP
      page.drawText(`${formData.city}, ${formData.state} ${formData.zip}`, {
        x: 50,
        y: 640,
        size: 12,
        font: font,
      });
      
      // Filing Status
      page.drawText(`Filing Status: ${formData.filingStatus}`, {
        x: 50,
        y: 610,
        size: 12,
        font: font,
      });
      
      // Income section
      page.drawText('Income:', {
        x: 50,
        y: 570,
        size: 14,
        font: boldFont,
      });
      
      // Draw income table
      const incomeItems = [
        { label: 'Wages, salaries, tips', value: formData.wages },
        { label: 'Taxable interest', value: formData.interest || 0 },
        { label: 'Qualified dividends', value: formData.dividends || 0 },
        { label: 'Capital gain or (loss)', value: formData.capitalGains || 0 },
        { label: 'Other income', value: formData.otherIncome || 0 }
      ];
      
      let yPos = 540;
      
      // Draw table headers
      page.drawText('Income Source', {
        x: 50,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      page.drawText('Amount', {
        x: 400,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      yPos -= 20;
      
      // Draw income items
      incomeItems.forEach(item => {
        page.drawText(item.label, {
          x: 50,
          y: yPos,
          size: 12,
          font: font,
        });
        
        page.drawText(`$${item.value.toLocaleString()}`, {
          x: 400,
          y: yPos,
          size: 12,
          font: font,
        });
        
        yPos -= 20;
      });
      
      // Calculate total income
      const totalIncome = incomeItems.reduce((sum, item) => sum + item.value, 0);
      
      // Draw horizontal line
      page.drawLine({
        start: { x: 400, y: yPos + 10 },
        end: { x: 550, y: yPos + 10 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      
      yPos -= 10;
      
      // Total income
      page.drawText('Total Income:', {
        x: 50,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      page.drawText(`$${totalIncome.toLocaleString()}`, {
        x: 400,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      yPos -= 30;
      
      // Adjustments
      page.drawText('Adjustments to Income:', {
        x: 50,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      page.drawText(`$${(formData.adjustments || 0).toLocaleString()}`, {
        x: 400,
        y: yPos,
        size: 12,
        font: font,
      });
      
      yPos -= 20;
      
      // Adjusted Gross Income
      const agi = totalIncome - (formData.adjustments || 0);
      
      page.drawText('Adjusted Gross Income:', {
        x: 50,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      page.drawText(`$${agi.toLocaleString()}`, {
        x: 400,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      yPos -= 30;
      
      // Standard Deduction
      const deduction = formData.deductions || 12950;
      
      page.drawText('Standard Deduction:', {
        x: 50,
        y: yPos,
        size: 12,
        font: font,
      });
      
      page.drawText(`$${deduction.toLocaleString()}`, {
        x: 400,
        y: yPos,
        size: 12,
        font: font,
      });
      
      yPos -= 20;
      
      // Taxable Income
      const taxableIncome = Math.max(0, agi - deduction);
      
      page.drawText('Taxable Income:', {
        x: 50,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      page.drawText(`$${taxableIncome.toLocaleString()}`, {
        x: 400,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      
      // Signature section
      page.drawText('Signature:', {
        x: 50,
        y: 150,
        size: 12,
        font: boldFont,
      });
      
      page.drawLine({
        start: { x: 120, y: 150 },
        end: { x: 300, y: 150 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('Date:', {
        x: 320,
        y: 150,
        size: 12,
        font: boldFont,
      });
      
      page.drawText(new Date().toLocaleDateString(), {
        x: 360,
        y: 150,
        size: 12,
        font: font,
      });
      
      // Footer
      page.drawText('This is a simplified version of Form 1040 generated for informational purposes only.', {
        x: 50,
        y: 50,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      // Serialize the PDF to bytes
      const pdfBytes = await pdfDoc.save();
      
      // Create a Blob from the PDF bytes
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      
      // Save the PDF
      saveAs(blob, `${formData.lastName}_${formData.firstName}_1040.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate tax form PDF. Please try again.');
    }
  };

  const handleGenerateForm = () => {
    generateTaxFormPDF();
  };

  const renderField = (label: string, value: string | number) => (
    <div>
      <span className="font-medium text-gray-700">{label}:</span>{' '}
      <span className="text-gray-900">{value}</span>
    </div>
  );

  const renderMissingFieldInput = (field: string) => {
    const label = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
    const isNumeric = ['wages', 'interest', 'dividends', 'capitalGains', 'otherIncome', 'adjustments', 'deductions'].includes(field);
    
    return (
      <div key={field} className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}:
        </label>
        <input
          type={isNumeric ? 'number' : 'text'}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          value={additionalInfo[field] || ''}
          onChange={(e) => handleAdditionalInfoChange(field, e.target.value)}
          placeholder={isNumeric ? '0.00' : `Enter ${label.toLowerCase()}`}
        />
      </div>
    );
  };

  const renderManualEntryForm = () => {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-6">Manual Tax Information Entry</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium mb-4">Personal Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name:
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.firstName}
                  onChange={(e) => handleManualEntryChange('firstName', e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name:
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.lastName}
                  onChange={(e) => handleManualEntryChange('lastName', e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Social Security Number:
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.ssn}
                  onChange={(e) => handleManualEntryChange('ssn', e.target.value)}
                  placeholder="123-45-6789"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filing Status:
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.filingStatus}
                  onChange={(e) => handleManualEntryChange('filingStatus', e.target.value)}
                >
                  <option value="single">Single</option>
                  <option value="married_joint">Married Filing Jointly</option>
                  <option value="married_separate">Married Filing Separately</option>
                  <option value="head_household">Head of Household</option>
                  <option value="qualifying_widow">Qualifying Widow(er)</option>
                </select>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Address</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address:
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.address}
                  onChange={(e) => handleManualEntryChange('address', e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City:
                </label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.city}
                  onChange={(e) => handleManualEntryChange('city', e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State:
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    value={manualFormData.state}
                    onChange={(e) => handleManualEntryChange('state', e.target.value)}
                    maxLength={2}
                    placeholder="CA"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code:
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    value={manualFormData.zip}
                    onChange={(e) => handleManualEntryChange('zip', e.target.value)}
                    placeholder="12345"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Income</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wages:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.wages}
                  onChange={(e) => handleManualEntryChange('wages', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interest:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.interest}
                  onChange={(e) => handleManualEntryChange('interest', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dividends:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.dividends}
                  onChange={(e) => handleManualEntryChange('dividends', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Capital Gains:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.capitalGains}
                  onChange={(e) => handleManualEntryChange('capitalGains', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Other Income:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.otherIncome || 0}
                  onChange={(e) => handleManualEntryChange('otherIncome', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-4">Deductions & Adjustments</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adjustments:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.adjustments || 0}
                  onChange={(e) => handleManualEntryChange('adjustments', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deductions:
                </label>
                <input
                  type="number"
                  className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  value={manualFormData.deductions || 0}
                  onChange={(e) => handleManualEntryChange('deductions', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={() => setShowManualEntry(false)}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitManualEntry}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Submit
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setError(null)}
                  className="inline-flex rounded-md p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {!formData && !showManualEntry && (
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Select Documents for Tax Analysis</h2>
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Manual Entry
                </button>
              </div>
              
              {documents.length === 0 ? (
                <p className="text-gray-500">No documents found. Please upload some documents first.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    {documents.map(doc => (
                      <div 
                        key={doc._id}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          selectedDocuments.includes(doc._id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => handleDocumentSelect(doc._id)}
                      >
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            checked={selectedDocuments.includes(doc._id)}
                            onChange={() => {}}
                            className="mt-1 mr-3"
                          />
                          <div>
                            <p className="font-medium">{doc.filename}</p>
                            <p className="text-sm text-gray-500">
                              Uploaded: {new Date(doc.uploadDate).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-gray-500">
                              Size: {Math.round(doc.size / 1024)} KB
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      onClick={handleAnalyzeDocuments}
                      disabled={analyzing || selectedDocuments.length === 0}
                      className={`px-4 py-2 rounded-md text-white ${
                        analyzing || selectedDocuments.length === 0
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {analyzing ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Analyzing...
                        </span>
                      ) : 'Analyze Selected Documents'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {showManualEntry && renderManualEntryForm()}
          
          {formData && (
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Tax Information</h2>
              
              {missingFields.length > 0 ? (
                <div className="mb-6">
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          Some information is missing. Please provide the following details:
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {missingFields.map(field => renderMissingFieldInput(field))}
                  </div>
                  
                  <div className="mt-4">
                    <button
                      onClick={handleCompleteForm}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Complete Form
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    {renderField('Name', `${formData.firstName} ${formData.lastName}`)}
                    {renderField('SSN', `XXX-XX-${formData.ssn.slice(-4)}`)}
                    {renderField('Filing Status', formData.filingStatus)}
                    {renderField('Address', formData.address)}
                    {renderField('City', formData.city)}
                    {renderField('State', formData.state)}
                    {renderField('ZIP', formData.zip)}
                    {renderField('Wages', `$${formData.wages.toLocaleString()}`)}
                    {renderField('Interest', `$${formData.interest.toLocaleString()}`)}
                    {renderField('Dividends', `$${formData.dividends.toLocaleString()}`)}
                    {renderField('Capital Gains', `$${formData.capitalGains.toLocaleString()}`)}
                    {formData.otherIncome !== undefined && renderField('Other Income', `$${formData.otherIncome.toLocaleString()}`)}
                    {formData.adjustments !== undefined && renderField('Adjustments', `$${formData.adjustments.toLocaleString()}`)}
                    {formData.deductions !== undefined && renderField('Deductions', `$${formData.deductions.toLocaleString()}`)}
                  </div>
                  
                  <div className="mt-6">
                    <button
                      onClick={handleGenerateForm}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      Generate 1040 Form
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TaxAnalysis; 