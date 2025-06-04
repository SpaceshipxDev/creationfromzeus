// app/api/process-xlsx/route.ts
// =============================
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { GoogleGenAI } from "@google/genai";

// ---- ENV ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PYTHON_RENDERER_URL = process.env.PYTHON_RENDERER_URL;

if (!GEMINI_API_KEY) {
  console.error("Required environment variable missing: GEMINI_API_KEY");
}
if (!PYTHON_RENDERER_URL) {
  console.error("Required environment variable missing: PYTHON_RENDERER_URL");
}

// ---- TMP PATHS ----
const UPLOAD_DIR = path.join(os.tmpdir(), "nextjs-xlsx-uploads");

// ---- Initialize Directories ----
async function initDirectories() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

// ---- Parse Excel to Text ----
async function parseExcelToText(xlsxPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  
  let textOutput = "=== EXCEL FILE CONTENT ===\n\n";
  
  workbook.eachSheet((worksheet, sheetId) => {
    textOutput += `SHEET: ${worksheet.name}\n`;
    textOutput += "=" + "=".repeat(worksheet.name.length + 6) + "\n\n";
    
    let hasAnyData = false;
    const maxRow = 200; // Check up to 200 rows
    const maxCol = 50;  // Check up to 50 columns (AX)
    
    // Scan through all potential cells to find data
    for (let rowNum = 1; rowNum <= maxRow; rowNum++) {
      const row = worksheet.getRow(rowNum);
      let rowText = `Row ${rowNum}: `;
      let hasRowData = false;
      
      // Check each column in the row
      for (let colNum = 1; colNum <= maxCol; colNum++) {
        const cell = row.getCell(colNum);
        
        // More aggressive cell value checking
        let cellValue = '';
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
          
          // Handle different cell value types
          if (typeof cell.value === 'object' && cell.value !== null) {
            if ('text' in cell.value) {
              cellValue = cell.value.text;
            } else if ('result' in cell.value) {
              cellValue = String(cell.value.result);
            } else if ('richText' in cell.value) {
              cellValue = cell.value.richText.map(rt => rt.text).join('');
            } else if ('formula' in cell.value) {
              cellValue = `FORMULA: ${cell.value.formula}`;
            } else {
              cellValue = JSON.stringify(cell.value);
            }
          } else {
            cellValue = String(cell.value);
          }
          
          if (cellValue.trim()) {
            const cellAddress = cell.address;
            rowText += `[${cellAddress}: "${cellValue.trim()}"] `;
            hasRowData = true;
            hasAnyData = true;
          }
        }
      }
      
      if (hasRowData) {
        textOutput += rowText + "\n";
      }
      
      // If we've found data but this row is empty, check a few more rows before stopping
      if (hasAnyData && !hasRowData) {
        let emptyRowCount = 0;
        for (let checkRow = rowNum + 1; checkRow <= rowNum + 10 && checkRow <= maxRow; checkRow++) {
          const checkRowObj = worksheet.getRow(checkRow);
          let hasDataInCheckRow = false;
          for (let checkCol = 1; checkCol <= maxCol; checkCol++) {
            const checkCell = checkRowObj.getCell(checkCol);
            if (checkCell.value !== null && checkCell.value !== undefined && checkCell.value !== '') {
              hasDataInCheckRow = true;
              break;
            }
          }
          if (!hasDataInCheckRow) {
            emptyRowCount++;
          } else {
            break;
          }
        }
        if (emptyRowCount >= 10) {
          break; // Stop if we find 10 consecutive empty rows
        }
      }
    }
    
    if (!hasAnyData) {
      textOutput += "No data found in sheet (scanned up to row " + maxRow + ", col " + maxCol + ")\n\n";
    }
    
    // Add merged cells info if any
    if (worksheet.model.merges && worksheet.model.merges.length > 0) {
      textOutput += "\nMerged Cells:\n";
      worksheet.model.merges.forEach(merge => {
        textOutput += `  ${merge}\n`;
      });
    }
    
    textOutput += "\n" + "-".repeat(50) + "\n\n";
  });
  
  return textOutput;
}

// ---- Gemini LLM Call ----
const PROMPT = `
Analyze the Excel file content below and extract ALL specification data to populate these exact structures. DO NOT leave any fields blank if data exists in the specs.

CRITICAL: Extract these three fields completely:
1. Material (材质) - exact material specification 
2. Quantity (数量) - exact quantity specified
3. Surface Treatment (表面/工艺/外观处理) - complete finishing process (e.g., "20#喷砂+黑色氧化")

Look for:
- Part numbers, product codes, item numbers
- Material specifications (steel, aluminum, plastic, etc.)
- Quantities (pieces, sets, units)
- Surface treatments, finishes, coatings
- Dimensions, specifications
- Processing requirements
- Any technical notes or requirements

Output exactly these two variables:

const excelLayoutData = [
    {'type': 'title_row', 'text': "越依生产单", 'merge_cells': 'A1:I1', 'height': 30},
    {'type': 'header_detail_row', 'cells': [
        {'col_letter': 'A', 'value': "销售单号", 'style_key': 'header_label'}, 
        {'col_letter': 'B', 'value': "[EXTRACT_OR_TBD]", 'style_key': 'header_value'}, 
        {'col_letter': 'D', 'value': "交期", 'style_key': 'header_label'}, 
        {'col_letter': 'E', 'value': "", 'style_key': 'header_value'},
        {'col_letter': 'G', 'value': "派单员", 'style_key': 'header_label'}, 
        {'col_letter': 'H', 'value': "", 'style_key': 'header_value'}
    ], 'height': 22},
    {'type': 'header_detail_row', 'cells': [
        {'col_letter': 'A', 'value': "创建时间", 'style_key': 'header_label'}, 
        {'col_letter': 'B', 'value': "[CURRENT_DATETIME]", 'style_key': 'header_value'}, 
        {'col_letter': 'D', 'value': "产品合计数量", 'style_key': 'header_label'}, 
        {'col_letter': 'E', 'value': "[TOTAL_QUANTITY]", 'style_key': 'header_value'}, 
        {'col_letter': 'G', 'value': "分析员", 'style_key': 'header_label'}, 
        {'col_letter': 'H', 'value': "", 'style_key': 'header_value'}
    ], 'height': 22},
    {'type': 'main_table_header_row', 'headers': ["序号", "产品图片", "产品编号", "产品名称", "规格", "材料", "数量", "加工方式", "工艺要求"], 'height': 25},
    // Add one row for each part found in the Excel data
    {'type': 'main_table_data_row', 'data': [1, "", "[PART_NUMBER]", "[PART_NAME]", "[ALL_SPECS]", "[EXACT_MATERIAL]", "[EXACT_QUANTITY]", "", "[SURFACE_TREATMENT_AND_ALL_REQUIREMENTS]"], 'height': 22}
];

const quotationData = {
    "quote_number": "[EXTRACT_OR_GENERATE]",
    "company_info": {
        "party_a": "杭州微影软件有限公司",
        "contact_a": "", "tel_a": "", "fax_a": "", "email_a": "", "address_a": "",
        "party_b": "杭州越依模型科技有限公司",
        "contact_b": "傅士勤", "tel_b": "13777479066", "fax_b": "", "email_b": "",
        "address_b": "杭州市富阳区东洲工业功能区1号路11号"
    },
    "products": [
        {
            "序号": 1,
            "零件图片": "[图片]",
            "零件名": "[EXACT_PART_NAME]", 
            "表面": "[COMPLETE_SURFACE_TREATMENT]",
            "材质": "[EXACT_MATERIAL]", 
            "数量": "[EXACT_QUANTITY]",
            "单价": "", "合计": "",
            "备注": "[ALL_ADDITIONAL_NOTES]"
        }
    ],
    "total_untaxed": "", "processing_cycle": "", "payment_terms": "月结30天",
    "delivery_date": "", "acceptance_standard": "依据甲方2D、3D、说明文档等相关约定文件进行验收",
    "notice": "此报价单适用于所有杭州海康威视科技有限公司的子公司及关联公司。",
    "signature_date": "2025年6月2日"
};

Extract ALL data from the Excel content. Do not skip or abbreviate any information.

Excel File Content:
`;

async function callGemini(excelText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });
  const resp = await ai.models.generateContentStream({
    model: "gemini-2.5-flash-preview-05-20",
    config: { responseMimeType: "text/plain" },
    contents: [{ 
      role: "user", 
      parts: [{ text: PROMPT + excelText }] 
    }],
  });

  let out = "";
  for await (const chunk of resp) {
    if (chunk.text) out += chunk.text;
  }
  console.log("=== GEMINI OUTPUT ===");
  console.log(out);
  console.log("=== END GEMINI OUTPUT ===");
  
  return out;
}

// ---- Robust Parsing Function ----
function extractStructures(txt: string): [string, string] {
  txt = txt.replace(/```(?:javascript|js|python)?|```/g, '');

  const arrMatch = txt.match(/const\s+excelLayoutData\s*=\s*(\[[\s\S]*?\]);/);
  const objMatch = txt.match(/const\s+quotationData\s*=\s*({[\s\S]*?});/);

  if (!arrMatch || !objMatch) throw new Error("Failed to extract required data structures from Gemini output.");

  const clean = (jsStr: string) =>
    jsStr.replace(/\/\/.*$/gm, '').replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1').replace(/[;`]/g, '').trim();

  return [clean(arrMatch[1]), clean(objMatch[1])];
}

// ---- STP Image Rendering ----
async function renderStpFiles(files: { path: string; name: string }[]): Promise<Record<string, Buffer>> {
  const map: Record<string, Buffer> = {};
  if (!PYTHON_RENDERER_URL) return map;
  for (const f of files) {
    try {
      const buf = await fs.readFile(f.path);
      const fd = new FormData();
      fd.append("file", new Blob([buf]), f.name);
      const res = await fetch(PYTHON_RENDERER_URL, { method: "POST", body: fd });
      if (!res.ok) continue;
      const zipBuf = Buffer.from(await res.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBuf);
      const imgName = Object.keys(zip.files).find(n => !zip.files[n].dir && /\.(png|jpe?g)$/i.test(n));
      if (imgName) {
        map[f.name] = await zip.files[imgName].async("nodebuffer");
      }
    } catch (e) {
      console.error("Failed to render STP", f.name, e);
    }
  }
  return map;
}

// ---- Excel Builders ----
async function buildProductionOrder(layout: any[], images: Record<string, Buffer>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("生产单");
  ws.columns = ["序号", "产品图片", "产品编号", "产品名称", "规格", "材料", "数量", "加工方式", "工艺要求"].map(h => ({
    header: h, width: 15 
  }));

  let r = 1;
  for (const item of layout) {
    const row = ws.getRow(r++);
    switch(item.type) {
      case "title_row":
        ws.mergeCells(item.merge_cells);
        ws.getCell(item.merge_cells.split(":")[1]).value = item.text;
        break;
      case "header_detail_row":
        item.cells.forEach((c: any) => row.getCell(c.col_letter).value = c.value);
        break;
      case "main_table_header_row":
      case "main_table_data_row":
        row.values = item.headers || item.data;
        if (item.type === "main_table_data_row" && item.data[1]) {
          const key = item.data[1];
          const img = images[key];
          if (img) {
            const id = wb.addImage({ buffer: img, extension: 'png' });
            ws.addImage(id, `B${row.number}:B${row.number}`);
            row.height = Math.max(row.height || 18, 80);
          }
        }
        break;
    }
    row.height = item.height;
  }
  return wb.xlsx.writeBuffer();
}

async function buildQuotation(q: any, images: Record<string, Buffer>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("报价单");
  
    // Main Title
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = `手板报价 编号: ${q.quote_number}`;
    ws.getCell('A1').alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell('A1').font = { size:16, bold:true };
    ws.getRow(1).height = 28;
  
    // Company Information
    const ci = q.company_info;
    const infoRows = [
      [`甲方:${ci.party_a}`, "", "", "", `乙方:${ci.party_b}`],
      [`联系人:`, "", "", "", `联系人:贾芳`],
      [`TEL:`, "", "", "", `TEL:${ci.tel_b || ""}`],
      [`FAX:`, "", "", "", `FAX:${ci.fax_b || ""}`],
      [`E-mail:`, "", "", "", `E-mail:${ci.email_b || ""}`],
      [`地址:`, "", "", "", `地址:${ci.address_b || ""}`],
    ];
    
    for (let i=0; i<infoRows.length; i++) {
      const r = ws.addRow(infoRows[i]);
      ws.mergeCells(`A${r.number}:D${r.number}`);
      ws.mergeCells(`E${r.number}:I${r.number}`);
      r.height = 18;
    }
  
    // Products Table Header
    const headerStartRow = ws.lastRow.number + 1;
    ws.addRow(["序号", "零件图片", "零件名", "表面", "材质", "数量", "单价", "合计", "备注"]);
    
    const headerRow = ws.getRow(headerStartRow);
    headerRow.height = 22;
  
    // Products Data Rows
    q.products.forEach(product => {
      const row = ws.addRow([
        product["序号"],
        product["零件图片"],
        product["零件名"],
        product["表面"],
        product["材质"],
        product["数量"],
        "",
        "",
        product["备注"]
      ]);
      const key = product["零件图片"] || product["零件名"];
      if (images[key]) {
        const id = workbook.addImage({ buffer: images[key], extension: 'png' });
        ws.addImage(id, `B${row.number}:B${row.number}`);
        row.height = Math.max(row.height, 80);
      } else {
        row.height = 18;
      }
    });
  
    // Total Row
    let totalRow = ws.addRow(["计:", "", "", "", "", "", ""]);
    ws.mergeCells(`A${totalRow.number}:F${totalRow.number}`);
    ws.mergeCells(`G${totalRow.number}:H${totalRow.number}`);
  
    totalRow.alignment = {horizontal: "right"};
    totalRow.height = 18;
  
    // Additional Information
    const infoLines = [
      `未税 总价：(人民币) `,
      `手板加工周期：`,
      `付款方式：${q.payment_terms || "月结30天"}`,
      `交货日期：`,
      `验收标准：${q.acceptance_standard}`,
      q.notice
    ];
    for (const s of infoLines) {
      const r = ws.addRow([s]);
      ws.mergeCells(`A${r.number}:I${r.number}`);
      r.height = 18;
    }
  
    // Signature Row
    const sigRow = ws.addRow(["", "", "", "", "", "乙方签名确认", "", q.signature_date]);
    ws.mergeCells(`F${sigRow.number}:G${sigRow.number}`);
    ws.mergeCells(`H${sigRow.number}:I${sigRow.number}`);
    sigRow.height = 20;
  
    // Column widths
    ws.columns = [
      { width: 6 },   // 序号
      { width: 20 },  // 零件图片
      { width: 20 },  // 零件名
      { width: 16 },  // 表面
      { width: 14 },  // 材质
      { width: 8 },   // 数量
      { width: 12 },  // 单价
      { width: 12 },  // 合计
      { width: 18 },  // 备注
    ];
  
    return workbook.xlsx.writeBuffer();
}

// ---- API Route: POST Handler ----
export async function POST(req: Request) {
  await initDirectories();

  if (!GEMINI_API_KEY)
    return NextResponse.json({ error: "Missing server configuration." }, { status: 500 });

  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  const stpUploads = fd.getAll("stpFiles") as File[];
  if (!file || !file.name.endsWith(".xlsx"))
    return NextResponse.json({ error: "Invalid file. Upload '.xlsx'." }, { status: 400 });

  const slug = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const upPath = path.join(UPLOAD_DIR, slug, file.name);
  await fs.mkdir(path.dirname(upPath), { recursive: true });
  await fs.writeFile(upPath, Buffer.from(await file.arrayBuffer()));
  const stpInfo: { path: string; name: string }[] = [];
  for (const sf of stpUploads) {
    const p = path.join(UPLOAD_DIR, slug, sf.name);
    await fs.writeFile(p, Buffer.from(await sf.arrayBuffer()));
    stpInfo.push({ path: p, name: sf.name });
  }

  try {
    // Parse Excel directly to text
    const excelText = await parseExcelToText(upPath);
    
    // LOG THE PARSED CONTENT
    console.log("=== PARSED EXCEL CONTENT ===");
    console.log(excelText);
    console.log("=== END PARSED CONTENT ===");
    
    const rawOutput = await callGemini(excelText);
    const [arrJS, objJS] = extractStructures(rawOutput);

    const layout = JSON.parse(arrJS);
    const quotation = JSON.parse(objJS);


    // ---- Map STP filenames to parts ----
    const stpNames = stpInfo.map(f => f.name.toLowerCase());

    // attach matching STP filename to layout rows
    for (const item of layout) {
      if (item.type === "main_table_data_row" && item.data && item.data.length > 2) {
        const partNum = String(item.data[2] || "").toLowerCase();
        const match = stpNames.find(n => n.startsWith(partNum));
        if (match) item.data[1] = match;
      }
    }

    // attach matching STP filename to quotation products
    if (Array.isArray(quotation.products)) {
      for (const p of quotation.products) {
        const partNum = String(p["零件名"] || "").toLowerCase();
        const match = stpNames.find(n => n.startsWith(partNum));
        if (match) p["零件图片"] = match;
      }
    }


    const imageMap = await renderStpFiles(stpInfo);

    const prodBuf = await buildProductionOrder(layout, imageMap);
    const quoteBuf = await buildQuotation(quotation, imageMap);

    return NextResponse.json({
      productionOrderBase64: Buffer.from(prodBuf).toString("base64"),
      quotationBase64: Buffer.from(quoteBuf).toString("base64"),
      parsedExcelText: excelText, // Include parsed text for debugging
      rawOutput,
    });
  } catch (e: any) {
    console.error("Error processing upload:", e);
    return NextResponse.json({ error: e.message || "Processing failed" }, { status: 500 });
  } finally {
    setTimeout(async () => {
      await fs.rm(path.join(UPLOAD_DIR, slug), { recursive: true, force: true });
    }, 5 * 60 * 1000);
  }
}