import express from 'express';
import path from 'node:path';
import { ReceiptRepository } from './repositories/ReceiptRepository';
import { nanoid } from 'nanoid';
import type { ReceiptContext, ReceiptData } from './repositories/ReceiptRepository';

// import or move all support functions like formatDate, summaryFields, etc.
function formatDate(dateString: string | undefined): string | undefined {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        } satisfies Intl.DateTimeFormatOptions;
        return new Intl.DateTimeFormat('en-US', options).format(date);
    }
    return dateString; // Return raw if parsing fails
}

export function createApp(repo: ReceiptRepository) {
    const app = express();
    app.set('trust proxy', 1);

    app.use(express.json());
    app.use('/assets', express.static(path.join(process.cwd(), 'public')));

    const asRecord = (value: unknown): Record<string, unknown> | undefined => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
        return value as Record<string, unknown>;
    };

    const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

    app.get('/health', (req, res) => {
        res.json({ ok: true });
    });

    app.post('/api/receipts', async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;

        let receiptType: string | undefined = asString(body.receiptType);
        let receiptText: unknown = body.receiptText;
        let receiptData: ReceiptData | undefined = asRecord(body.receiptData) as ReceiptData | undefined;

        const receipt = asRecord(body.receipt);
        const payload = asRecord(body.payload);
        const context = asRecord(body.context) as ReceiptContext | undefined;

        if (receipt) {
            receiptType = asString(receipt.type) ?? receiptType;
            receiptText = receipt.text;
            const receiptDataFromReceipt = (asRecord(receipt.data) ?? {}) as ReceiptData;
            receiptData = { ...(receiptDataFromReceipt ?? {}), ...(context ? { context } : {}) };
        } else if (payload) {
            receiptType = asString(payload.receiptType) ?? receiptType;
            receiptText = payload.receiptText;
            receiptData = (asRecord(payload.receiptData) ?? {}) as ReceiptData;
        }

        if (typeof receiptText !== 'string' || receiptText.trim() === '') {
            return res.status(400).json({ error: 'receiptText is required and cannot be empty.' });
        }

        const insertInput: { receiptText: string; receiptType?: string; receiptData?: ReceiptData } = {
            receiptText,
        };
        if (receiptType !== undefined) insertInput.receiptType = receiptType;
        if (receiptData !== undefined) insertInput.receiptData = receiptData;

        const { id } = await repo.insertReceipt(insertInput);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const qrPayload = `${baseUrl}/r/${id}`;
        return res.status(201).json({ id, url: qrPayload, qrPayload });
    });

    app.get('/r/:id', async (req, res) => {
        const { id } = req.params;
        const receipt = await repo.getReceiptById(id);
        if (!receipt) {
            return res.status(404).send('Receipt not found');
        }
        const { receipt_text, receipt_data } = receipt;
        const { context } = receipt_data || {};
        const summaryFields = [
            { label: 'Amount', value: `${receipt_data?.amount || ''} ${receipt_data?.currency || ''}` },
            { label: 'Card brand', value: receipt_data?.cardBrand },
            { label: 'Truncated PAN', value: receipt_data?.truncatedPAN },
            { label: 'Auth code', value: receipt_data?.authorizationCode },
            { label: 'Response', value: receipt_data?.responseMessage || receipt_data?.responseCode },
            { label: 'Transaction type', value: receipt_data?.transactionType },
            { label: 'Transaction time', value: formatDate(receipt_data?.transactionDateTime) || context?.timestamp },
            { label: 'Terminal ID', value: receipt_data?.terminalId || context?.terminalId },
            { label: 'Merchant ID', value: receipt_data?.merchantId || context?.merchantId },
            { label: 'Transaction ID', value: receipt_data?.transactionId || context?.transactionId },
        ];
        const summaryHtml = `
            <table class="summary-table">
                ${summaryFields.filter(f => f.value).map(f => `
                    <tr>
                        <td class="summary-label"><strong>${f.label}:</strong></td>
                        <td class="summary-value">${f.value}</td>
                    </tr>
                `).join('')}
            </table>
        `;

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
      html {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
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
        font-size: 13px;
        line-height: 1.25;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        white-space: pre;
        text-align: left;
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
        #page-container { padding: 12px !important; }
        #content { max-width: 100% !important; }
        #receipt-container {
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box;
          padding: 12px !important;
        }
        #receipt-container pre {
          font-size: clamp(10px, 2.8vw, 13px);
          white-space: pre;
          overflow-x: auto;
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

    return app;
}
