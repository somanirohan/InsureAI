/**
 * services/exportComparison.js
 * High-fidelity, client-side export utility for Policy Comparison Matrix.
 * Supports:
 *  1. Excel (.xlsx / XML spreadsheet format) - native Excel compatible, styled with cells & worksheets.
 *  2. PDF (.pdf) - styled printable document with clean typography, tables, and branding.
 */

function escapeXml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate an Excel XML (.xlsx compatible / .xml) workbook.
 * Opens natively in Microsoft Excel, Google Sheets, LibreOffice, and Numbers.
 */
export function exportComparisonToExcel({ title, columns, sections, filename = 'insurai-policy-comparison' }) {
  // columns: [{ key: 'feature', label: 'Feature / Benefit' }, { key: 'p1', label: 'Plan 1' }, ...]
  // sections: [{ title: 'Pricing & Coverage', rows: [{ label: 'Sum Insured', values: { p1: '₹10 Lakhs', p2: '₹15 Lakhs' } }] }]

  let rowsXml = '';

  // Title Row
  rowsXml += `
    <Row ss:Height="28">
      <Cell ss:MergeAcross="${columns.length - 1}" ss:StyleID="TitleStyle">
        <Data ss:Type="String">${escapeXml(title || 'InsurAI Policy Comparison Matrix')}</Data>
      </Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:MergeAcross="${columns.length - 1}" ss:StyleID="SubtitleStyle">
        <Data ss:Type="String">Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • IRDAI Registered Products Grounding</Data>
      </Cell>
    </Row>
    <Row ss:Height="12"></Row>
  `;

  // Header Row
  rowsXml += '<Row ss:Height="24">';
  columns.forEach((col, idx) => {
    const styleId = idx === 0 ? 'HeaderFirstCol' : 'HeaderCol';
    rowsXml += `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(col.label)}</Data></Cell>`;
  });
  rowsXml += '</Row>';

  // Section & Data Rows
  sections.forEach((sec) => {
    if (sec.title) {
      rowsXml += `
        <Row ss:Height="20">
          <Cell ss:MergeAcross="${columns.length - 1}" ss:StyleID="SectionHeader">
            <Data ss:Type="String">${escapeXml(sec.title.toUpperCase())}</Data>
          </Cell>
        </Row>
      `;
    }

    sec.rows.forEach((r, rIdx) => {
      const isEven = rIdx % 2 === 0;
      const rowStyle = isEven ? 'DataRowEven' : 'DataRowOdd';
      rowsXml += `<Row ss:Height="22">`;
      
      // Feature Name
      rowsXml += `<Cell ss:StyleID="${isEven ? 'FeatureColEven' : 'FeatureColOdd'}"><Data ss:Type="String">${escapeXml(r.label)}</Data></Cell>`;

      // Column Values
      columns.slice(1).forEach((col) => {
        const val = r.values?.[col.key] ?? '—';
        rowsXml += `<Cell ss:StyleID="${rowStyle}"><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`;
      });

      rowsXml += `</Row>`;
    });
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#062327"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Segoe UI" ss:Size="15" ss:Bold="1" ss:Color="#062327"/>
   <Interior ss:Color="#d2f57b" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SubtitleStyle">
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#558187"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderFirstCol">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#062327"/>
   <Interior ss:Color="#e2e8f0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#062327"/>
   </Borders>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderCol">
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#062327"/>
   <Interior ss:Color="#e2e8f0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#062327"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="SectionHeader">
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Bold="1" ss:Color="#0f172a"/>
   <Interior ss:Color="#f1f5f9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="FeatureColEven">
   <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#1e293b"/>
   <Interior ss:Color="#ffffff" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
   </Borders>
  </Style>
  <Style ss:ID="FeatureColOdd">
   <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#1e293b"/>
   <Interior ss:Color="#f8fafc" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
   </Borders>
  </Style>
  <Style ss:ID="DataRowEven">
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#334155"/>
   <Interior ss:Color="#ffffff" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#f1f5f9"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="DataRowOdd">
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#334155"/>
   <Interior ss:Color="#f8fafc" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#f1f5f9"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Policy Comparison">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="160"/>
   ${columns.slice(1).map(() => '<Column ss:Width="190"/>').join('\n   ')}
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a printable, beautiful PDF using browser Print Document styling.
 * Creates an invisible iframe that formats standard A4 pages with zero external binary dependencies.
 */
export function exportComparisonToPdf({ title, subtitle, columns, sections, filename = 'insurai-policy-comparison' }) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to download/print the PDF report.');
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(title || 'Policy Comparison Report')}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #062327;
      background: #ffffff;
      font-size: 11px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #062327;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      background: #d2f57b;
      color: #062327;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 10px;
      border: 1px solid #062327;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 4px 0;
      font-weight: 800;
      color: #062327;
    }
    .subtitle {
      font-size: 10px;
      color: #558187;
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 10px;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      color: #0f172a;
    }
    th.col-header {
      background: #f1f5f9;
      font-size: 11px;
      color: #062327;
      border-bottom: 2px solid #cbd5e1;
    }
    .feature-col {
      width: 22%;
      font-weight: 600;
      background: #fdfdfd;
      color: #334155;
    }
    .section-row td {
      background: #f1f5f9;
      font-weight: 700;
      font-size: 9.5px;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 5px 10px;
      border-top: 1.5px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
    }
    .footer {
      margin-top: 20px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      color: #64748b;
      font-size: 9px;
    }
    ul {
      margin: 0;
      padding-left: 14px;
    }
    li {
      margin-bottom: 2px;
    }
    .pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .pill-neg {
      background: #fffbeb;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 12px; font-weight: 600; color: #166534;">PDF Print Preview Ready</span>
    <button onclick="window.print()" style="background: #062327; color: #ffffff; border: none; padding: 6px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>

  <div class="header">
    <div>
      <div class="brand">
        <h1>${escapeXml(title || 'Policy Comparison Report')}</h1>
        <span class="badge">InsurAI Grounded</span>
      </div>
      <p class="subtitle">${escapeXml(subtitle || 'Side-by-side comparison across sum insured, room rent limits, copay, and waiting periods.')}</p>
    </div>
    <div style="text-align: right; font-size: 10px; color: #64748b;">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Engine:</strong> IRDAI Grounded RAG</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        ${columns.map((c, i) => `<th class="col-header ${i === 0 ? 'feature-col' : ''}">${escapeXml(c.label)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${sections.map(sec => `
        ${sec.title ? `<tr class="section-row"><td colspan="${columns.length}">${escapeXml(sec.title)}</td></tr>` : ''}
        ${sec.rows.map(r => `
          <tr>
            <td class="feature-col">${escapeXml(r.label)}</td>
            ${columns.slice(1).map(c => `<td>${escapeXml(r.values?.[c.key] ?? '—')}</td>`).join('')}
          </tr>
        `).join('')}
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <span>InsurAI Health Policy Intelligence Matrix • Fully Grounded with Official Documents</span>
    <span>Page 1 of 1</span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
