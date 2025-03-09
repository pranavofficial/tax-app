import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface Form1040Data {
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
  otherIncome?: number;
  adjustments?: number;
  deductions?: number;
}

export async function generate1040Form(data: Form1040Data): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create a PDF document
      const doc = new PDFDocument({ margin: 50 });
      
      // Create a buffer to store the PDF
      const buffers: Buffer[] = [];
      
      // Handle document data chunks
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // Add content to the PDF
      // Header
      doc.fontSize(16).text('Form 1040: U.S. Individual Income Tax Return', { align: 'center' });
      doc.fontSize(12).text('Tax Year 2023', { align: 'center' });
      doc.moveDown(2);
      
      // Personal Information Section
      doc.fontSize(14).text('Personal Information', { underline: true });
      doc.moveDown(0.5);
      
      // Name and SSN
      doc.fontSize(10).text(`Name: ${data.firstName} ${data.lastName}`);
      doc.text(`Social Security Number: XXX-XX-${data.ssn.slice(-4)}`);
      
      // Filing Status
      doc.moveDown(0.5);
      doc.text('Filing Status:');
      
      const filingStatuses = [
        'Single', 
        'Married Filing Jointly', 
        'Married Filing Separately', 
        'Head of Household', 
        'Qualifying Widow(er)'
      ];
      
      let statusText = '';
      switch(data.filingStatus) {
        case 'single':
          statusText = filingStatuses[0];
          break;
        case 'married_joint':
          statusText = filingStatuses[1];
          break;
        case 'married_separate':
          statusText = filingStatuses[2];
          break;
        case 'head_of_household':
          statusText = filingStatuses[3];
          break;
        case 'qualifying_widow':
          statusText = filingStatuses[4];
          break;
        default:
          statusText = data.filingStatus;
      }
      
      doc.text(`☑ ${statusText}`);
      
      // Address
      doc.moveDown(0.5);
      doc.text('Home Address:');
      doc.text(`${data.address}`);
      doc.text(`${data.city}, ${data.state} ${data.zip}`);
      
      doc.moveDown(2);
      
      // Income Section
      doc.fontSize(14).text('Income', { underline: true });
      doc.moveDown(0.5);
      
      // Create a table-like structure for income
      const incomeItems = [
        { label: '1. Wages, salaries, tips', amount: data.wages },
        { label: '2. Tax-exempt interest', amount: 0 },
        { label: '3a. Qualified dividends', amount: data.dividends },
        { label: '3b. Ordinary dividends', amount: data.dividends },
        { label: '4a. IRA distributions', amount: 0 },
        { label: '4b. Taxable amount', amount: 0 },
        { label: '5a. Pensions and annuities', amount: 0 },
        { label: '5b. Taxable amount', amount: 0 },
        { label: '6a. Social security benefits', amount: 0 },
        { label: '6b. Taxable amount', amount: 0 },
        { label: '7. Capital gain or (loss)', amount: data.capitalGains },
        { label: '8. Other income', amount: data.otherIncome || 0 },
        { label: '9. Total income', amount: (data.wages + data.interest + data.dividends + data.capitalGains + (data.otherIncome || 0)) }
      ];
      
      // Draw income items
      incomeItems.forEach(item => {
        doc.fontSize(10);
        const y = doc.y;
        doc.text(item.label, { continued: false });
        doc.moveUp();
        doc.text(`$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { align: 'right' });
        
        // Add a line for the last item (total)
        if (item.label.includes('Total')) {
          doc.moveTo(doc.page.margins.left, doc.y + 5)
             .lineTo(doc.page.width - doc.page.margins.right, doc.y + 5)
             .stroke();
        }
      });
      
      doc.moveDown(2);
      
      // Adjusted Gross Income Section
      doc.fontSize(14).text('Adjusted Gross Income', { underline: true });
      doc.moveDown(0.5);
      
      const adjustedItems = [
        { label: '10. Adjustments to income', amount: data.adjustments || 0 },
        { label: '11. Adjusted gross income', amount: (data.wages + data.interest + data.dividends + data.capitalGains + (data.otherIncome || 0)) - (data.adjustments || 0) }
      ];
      
      // Draw adjusted income items
      adjustedItems.forEach(item => {
        doc.fontSize(10);
        doc.text(item.label, { continued: false });
        doc.moveUp();
        doc.text(`$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { align: 'right' });
        
        // Add a line for the last item
        if (item.label.includes('Adjusted gross income')) {
          doc.moveTo(doc.page.margins.left, doc.y + 5)
             .lineTo(doc.page.width - doc.page.margins.right, doc.y + 5)
             .stroke();
        }
      });
      
      doc.moveDown(2);
      
      // Tax Computation Section
      doc.fontSize(14).text('Tax Computation', { underline: true });
      doc.moveDown(0.5);
      
      const standardDeduction = data.filingStatus === 'single' || data.filingStatus === 'married_separate' 
        ? 12950 
        : data.filingStatus === 'head_of_household' 
          ? 19400 
          : 25900;
      
      const taxableIncome = Math.max(0, adjustedItems[1].amount - (data.deductions || standardDeduction));
      
      // Simplified tax calculation (this is not accurate for all brackets)
      let estimatedTax = 0;
      if (taxableIncome <= 10275) {
        estimatedTax = taxableIncome * 0.10;
      } else if (taxableIncome <= 41775) {
        estimatedTax = 1027.50 + (taxableIncome - 10275) * 0.12;
      } else if (taxableIncome <= 89075) {
        estimatedTax = 4807.50 + (taxableIncome - 41775) * 0.22;
      } else if (taxableIncome <= 170050) {
        estimatedTax = 15213.50 + (taxableIncome - 89075) * 0.24;
      } else if (taxableIncome <= 215950) {
        estimatedTax = 34647.50 + (taxableIncome - 170050) * 0.32;
      } else if (taxableIncome <= 539900) {
        estimatedTax = 49335.50 + (taxableIncome - 215950) * 0.35;
      } else {
        estimatedTax = 162718 + (taxableIncome - 539900) * 0.37;
      }
      
      const taxItems = [
        { label: '12. Standard deduction or itemized deductions', amount: data.deductions || standardDeduction },
        { label: '13. Qualified business income deduction', amount: 0 },
        { label: '14. Taxable income', amount: taxableIncome },
        { label: '15. Tax', amount: Math.round(estimatedTax) }
      ];
      
      // Draw tax items
      taxItems.forEach(item => {
        doc.fontSize(10);
        doc.text(item.label, { continued: false });
        doc.moveUp();
        doc.text(`$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { align: 'right' });
      });
      
      doc.moveDown(2);
      
      // Disclaimer
      doc.fontSize(8).text('DISCLAIMER: This is not an official IRS form. This document is for informational purposes only and should not be used for filing taxes. Please consult with a tax professional for accurate tax preparation.', { align: 'center' });
      
      // Finalize the PDF
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}
