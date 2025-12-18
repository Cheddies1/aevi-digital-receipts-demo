import 'dotenv/config';
import express from 'express';
import { supabase } from './supabaseClient'; // Assuming supabase client is exported from this file
import { formatDate } from './dateUtils'; // Assuming a formatDate function is defined in this file
import { nanoid } from 'nanoid';
import path from 'node:path';

export const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const inMemoryReceipts = new Map<string, { receipt_text: string; receipt_data: any }>();

app.use(express.json());

app.post('/api/receipts', async (req, res) => {
    const body = req.body ?? {};
    const receiptText =
        body.receiptText ??
        body?.payload?.receiptText ??
        body?.receipt?.text;

    if (typeof receiptText !== 'string' || receiptText.trim().length === 0) {
        return res.status(400).json({ error: 'Missing receipt text' });
    }

    const id = nanoid();
    const receipt_data = {
        ...((body?.receipt?.data && typeof body.receipt.data === 'object') ? body.receipt.data : {}),
        context: (body?.context && typeof body.context === 'object') ? body.context : undefined,
    };

    if (supabase) {
        const { error } = await supabase
            .from('receipts')
            .insert({ id, receipt_text: receiptText, receipt_data });
        if (error) {
            return res.status(500).json({ error: 'Failed to store receipt' });
        }
    } else {
        inMemoryReceipts.set(id, { receipt_text: receiptText, receipt_data });
    }

    return res.status(201).json({
        id,
        url: `${BASE_URL}/r/${id}`,
        qrPayload: `${BASE_URL}/r/${id}`,
    });
});

app.get('/r/:id', async (req, res) => {
    const { id } = req.params;
    const result = supabase
        ? await supabase.from('receipts').select('receipt_text, receipt_data').eq('id', id).single()
        : { data: inMemoryReceipts.get(id) ?? null, error: null };

    if (result.error || !result.data) {
        return res.status(404).send('Receipt not found');
    }

    const { receipt_text, receipt_data } = result.data as any;
    const { context } = receipt_data;

    // Prepare summary fields
    const summaryFields = [
        { label: 'Amount', value: `${receipt_data.amount || ''} ${receipt_data.currency || ''}` },
        { label: 'Card brand', value: receipt_data.cardBrand },
        { label: 'Truncated PAN', value: receipt_data.truncatedPAN },
        { label: 'Auth code', value: receipt_data.authorizationCode },
        { label: 'Response', value: receipt_data.responseMessage || receipt_data.responseCode },
        { label: 'Transaction type', value: receipt_data.transactionType },
        { label: 'Transaction time', value: formatDate(receipt_data.transactionDateTime) || context?.timestamp },
        { label: 'Terminal ID', value: receipt_data.terminalId || context?.terminalId },
        { label: 'Merchant ID', value: receipt_data.merchantId || context?.merchantId },
        { label: 'Transaction ID', value: receipt_data.transactionId || context?.transactionId },
    ];

    // Format summary section HTML as a table
    const summaryHtml = `
        <table style='width: 100%; border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0;'>
            ${summaryFields
        .filter(field => field.value) // Only include fields with a value
                .map(field => `
                    <tr>
                        <td style='padding: 2px 0;'><strong>${field.label}:</strong></td>
                        <td style='padding: 2px 0; text-align: right;'>${field.value}</td>
                    </tr>
                `).join('')}
        </table>
    `;

    // Send the complete receipt HTML
    res.send(`\
        <div style='background-color: #f6f6f6; padding: 20px; text-align: center;'>\
                <h1>Aevi Digital Receipt</h1>\
                <h4>Demo - not a production receipt</h4>\
                <div style='margin-bottom: 20px;'>\
                    <button id='download-pdf' onclick='downloadReceiptPdf();'>Download this receipt as PDF</button>\
                </div>\
            <div id='receipt-container' style='background-color: white; width: 340px; margin: 0 auto; padding: 20px; border-radius: 5px; font-family: monospace;'>\
                <pre style='margin: 0 0 12px 0;'>${receipt_text}</pre>\
                <div class='summary'>${summaryHtml}</div>\
            </div>\
        </div>\
        <script src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'></script>\
        <script src='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'></script>\
        <script>\
            async function downloadReceiptPdf() {\
                try {\
                    const container = document.getElementById('receipt-container');\
                    if (!container) throw new Error('Missing #receipt-container');\
                    const btn = document.getElementById('download-pdf');\
                    if (btn) btn.disabled = true;\
                    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });\
                    const imgData = canvas.toDataURL('image/png');\
                    const jsPDF = window.jspdf && window.jspdf.jsPDF;\
                    if (!jsPDF) throw new Error('jsPDF not available');\
                    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });\
                    const pageWidth = pdf.internal.pageSize.getWidth();\
                    const pageHeight = pdf.internal.pageSize.getHeight();\
                    const margin = 36;\
                    const maxWidth = pageWidth - margin * 2;\
                    const maxHeight = pageHeight - margin * 2;\
                    const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);\
                    const renderWidth = canvas.width * ratio;\
                    const renderHeight = canvas.height * ratio;\
                    pdf.addImage(imgData, 'PNG', margin, margin, renderWidth, renderHeight, undefined, 'FAST');\
                    pdf.save('receipt.pdf');\
                    if (btn) btn.disabled = false;\
                } catch (e) {\
                    try { window.print(); } catch {}\
                }\
            }\
        </script>\
        <style>\
            @media print {\
                .summary, pre { page-break-inside: avoid; }\
                button { display: none; }\
            }\
        </style>\
    `);
});

export function startServer() {
    return app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

const entry = process.argv[1] ?? '';
const entryBase = path.basename(entry);
if (entryBase === 'index.ts' || entryBase === 'index.js') startServer();
