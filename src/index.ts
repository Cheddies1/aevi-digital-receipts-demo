import 'dotenv/config';
import express from 'express';
import { supabase } from './supabaseClient'; // Assuming supabase client is exported from this file
import { formatDate } from './dateUtils'; // Assuming a formatDate function is defined in this file
import { nanoid } from 'nanoid';
import path from 'node:path';

export const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

const inMemoryReceipts = new Map<string, { receipt_text: string; receipt_data: any }>();

app.use(express.json());
app.use('/assets', express.static(path.join(process.cwd(), 'public')));

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
        try {
            const { error } = await supabase
                .from('receipts')
                .insert({ id, receipt_text: receiptText, receipt_data });
            if (error) {
                console.error(
                    JSON.stringify({
                        message: 'Supabase insert failed',
                        errorMessage: error.message,
                        errorCode: (error as any).code,
                        errorDetails: (error as any).details,
                        errorHint: (error as any).hint,
                    }),
                );
                return res.status(500).json({ error: 'Failed to store receipt' });
            }
        } catch (error: any) {
            console.error(
                JSON.stringify({
                    message: 'Supabase insert failed',
                    errorMessage: error?.message ?? String(error),
                    errorCode: error?.code,
                    errorDetails: error?.details,
                    errorHint: error?.hint,
                }),
            );
            return res.status(500).json({ error: 'Failed to store receipt' });
        }
    } else {
        inMemoryReceipts.set(id, { receipt_text: receiptText, receipt_data });
    }

    return res.status(201).json({
        id,
        url: `${req.protocol}://${req.get('host')}/r/${id}`,
        qrPayload: `${req.protocol}://${req.get('host')}/r/${id}`,
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

    const summaryHtml = `
        <table class="summary-table">
            ${summaryFields
        .filter(field => field.value)
                .map(field => `
                    <tr>
                        <td class="summary-label"><strong>${field.label}:</strong></td>
                        <td class="summary-value">${field.value}</td>
                    </tr>
                `).join('')}
        </table>
    `;

    // Send the complete receipt HTML
    res.send(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root {
        --aevi-hero-green: #33CC6B;
        --aevi-off-white: #F7F6EF;
        --aevi-text: #0b1b12;
        --aevi-text-muted: rgba(11, 27, 18, 0.75);
        --aevi-font-sans: "Basis Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        --aevi-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }

      html, body { height: 100%; }
      body {
        margin: 0;
        background: var(--aevi-hero-green);
        color: var(--aevi-text);
        font-family: var(--aevi-font-sans);
      }

      #page-container {
        min-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 28px;
        box-sizing: border-box;
      }

      #content {
        width: 100%;
        max-width: 420px;
        text-align: center;
      }

      #brand {
        display: flex;
        justify-content: center;
        margin-bottom: 6px;
        line-height: 0;
      }
      #brand img { display: block; height: 72px; width: auto; max-width: min(260px, 90vw); margin: 0; }

      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: -0.02em;
        color: white;
        font-weight: 650;
      }

      #subtitle {
        margin: 10px 0 18px 0;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
      }

      #actions {
        margin: 0 0 18px 0;
      }

      #download-pdf {
        border: 1px solid rgba(255, 255, 255, 0.65);
        background: rgba(255, 255, 255, 0.12);
        color: white;
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 14px;
        cursor: pointer;
      }
      #download-pdf:disabled { opacity: 0.55; cursor: not-allowed; }
      #download-pdf:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); }

      #receipt-container {
        background: var(--aevi-off-white);
        width: 340px;
        max-width: 100%;
        margin: 0 auto;
        padding: 18px;
        border-radius: 14px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        text-align: left;
        box-sizing: border-box;
        font-family: var(--aevi-font-mono);
      }

      #receipt-container pre {
        margin: 0 0 12px 0;
        white-space: pre;
        text-align: center;
      }

      .summary {
        color: var(--aevi-text-muted);
        font-size: 13px;
      }
      .summary-table {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        margin: 0;
        padding: 0;
      }
      .summary-label { text-align: left; padding: 2px 0; vertical-align: top; }
      .summary-value { text-align: right; padding: 2px 0; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }

      @media screen and (max-width: 600px) {
        #page-container { padding: 0px !important; }
        #receipt-container {
          width: 100% !important;
          max-width: 340px;
          box-sizing: border-box;
          padding: 10px !important;
        }
        #receipt-container pre {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .summary table { width: 100%; }
        .summary td { overflow-wrap: anywhere; word-break: break-word; }
      }
      @media print {
          .summary, pre { page-break-inside: avoid; }
          button { display: none; }
      }
    </style>
  </head>
  <body>
    <div id="page-container">
      <div id="content">
        <div id="brand"><img src="/assets/aevi-logo.svg" alt="Aevi logo"></div>
        <h1>Digital Receipt</h1>
        <div id="subtitle">Demo – not a production receipt</div>
        <div id="actions">
          <button id="download-pdf" onclick="downloadReceiptPdf();">Download this receipt as PDF</button>
        </div>
        <div id="receipt-container">
          <pre>${receipt_text}</pre>
          <div class="summary">${summaryHtml}</div>
        </div>
      </div>
    </div>
    <script src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'></script>
    <script src='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'></script>
    <script>
      async function downloadReceiptPdf() {
        try {
          const container = document.getElementById('receipt-container');
          if (!container) throw new Error('Missing #receipt-container');
          const btn = document.getElementById('download-pdf');
          if (btn) btn.disabled = true;
          const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#F7F6EF' });
          const imgData = canvas.toDataURL('image/png');
          const jsPDF = window.jspdf && window.jspdf.jsPDF;
          if (!jsPDF) throw new Error('jsPDF not available');
          const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 36;
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2;
          const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
          const renderWidth = canvas.width * ratio;
          const renderHeight = canvas.height * ratio;
          pdf.addImage(imgData, 'PNG', margin, margin, renderWidth, renderHeight, undefined, 'FAST');
          pdf.save('receipt.pdf');
          if (btn) btn.disabled = false;
        } catch (e) {
          try { window.print(); } catch {}
        }
      }
    </script>
  </body>
</html>`);
});

export function startServer() {
    return app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

const entry = process.argv[1] ?? '';
const entryBase = path.basename(entry);
if (entryBase === 'index.ts' || entryBase === 'index.js') startServer();
