import type { PrintFormat } from '../types';

export interface PrintOptions {
  format?: PrintFormat;
  documentTitle?: string;
}

/**
 * Professional Document Printing Utility
 * Isolates printable content into an ephemeral, clean iframe to guarantee:
 * - 0 interference from modal backdrops, framer-motion transforms, or overflow constraints
 * - High-fidelity colors with exact print-color-adjust
 * - Pristine margin and pagination handling for A4, A5 & thermal 80mm POS printers
 */
export const printElement = (
  elementId: string,
  documentTitleOrOptions: string | PrintOptions = 'Invoice'
) => {
  const options: PrintOptions =
    typeof documentTitleOrOptions === 'string'
      ? { documentTitle: documentTitleOrOptions, format: 'A4' }
      : { format: 'A4', ...documentTitleOrOptions };

  const format = options.format || 'A4';
  const documentTitle = options.documentTitle || 'Invoice';

  const sourceElement = document.getElementById(elementId);
  if (!sourceElement) {
    window.print();
    return;
  }

  // Remove any stale print iframes
  const existingIframe = document.getElementById('dukandar-print-frame');
  if (existingIframe && existingIframe.parentNode) {
    existingIframe.parentNode.removeChild(existingIframe);
  }

  // Create isolated print iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'dukandar-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = format === 'THERMAL' ? '320px' : '1000px';
  iframe.style.height = '1000px';
  iframe.style.border = '0';
  iframe.title = documentTitle;
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  // Extract all active styles and font stylesheets from the host document
  const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('\n');

  const pageCss =
    format === 'THERMAL'
      ? `
        @page {
          size: 80mm auto;
          margin: 0mm;
        }
        html, body {
          width: 76mm !important;
          max-width: 76mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          font-family: "Courier New", Courier, monospace, system-ui, sans-serif !important;
        }
        #${elementId} {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 2mm 3mm !important;
          width: 76mm !important;
          max-width: 76mm !important;
          margin: 0 auto !important;
          background: #ffffff !important;
        }
      `
      : format === 'A5'
      ? `
        @page {
          size: A5 portrait;
          margin: 5mm 6mm;
        }
        html, body {
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #${elementId} {
          border: 1px solid #cbd5e1 !important;
          box-shadow: none !important;
          padding: 12px 16px !important;
          margin: 0 auto !important;
          width: 100% !important;
          max-width: 148mm !important;
          background: #ffffff !important;
          border-radius: 6px !important;
        }
      `
      : `
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        html, body {
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #${elementId} {
          border: 1px solid #cbd5e1 !important;
          box-shadow: none !important;
          padding: 20px 24px !important;
          margin: 0 auto !important;
          width: 100% !important;
          max-width: 100% !important;
          background: #ffffff !important;
          border-radius: 6px !important;
        }
      `;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${documentTitle}</title>
        ${styleTags}
        <style>
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            height: auto !important;
            overflow: visible !important;
            font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
          }
          .print-hidden,
          .no-print,
          button,
          details,
          summary {
            display: none !important;
          }
          ${pageCss}
        </style>
      </head>
      <body>
        <div style="width: 100%; max-width: 100%; margin: 0; padding: 0;">
          ${sourceElement.outerHTML}
        </div>
      </body>
    </html>
  `);
  doc.close();

  // Allow styles and fonts a moment to resolve, then trigger native print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Iframe print error, falling back to window.print', err);
      window.print();
    } finally {
      // Clean up the frame after user interacts with dialog
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 250);
};
