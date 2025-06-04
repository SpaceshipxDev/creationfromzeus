// components/excel-viewer.tsx  (only pipeline area changed)
// =============================
"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";

interface ExcelViewerProps {
  file: File;
  stpFiles?: File[];
}
interface SheetData { name: string; data: any[][]; headers: string[] }

export function ExcelViewer({ file, stpFiles = [] }: ExcelViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prodLink, setProdLink] = useState<string | null>(null);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);

  // load workbook
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const data = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const rng = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
          const rows: any[][] = [];
          for (let r = rng.s.r; r <= rng.e.r; r++) {
            const row: any[] = [];
            for (let c = rng.s.c; c <= rng.e.c; c++) {
              const addr = XLSX.utils.encode_cell({ r, c });
              row.push((ws[addr] || {}).v || "");
            }
            rows.push(row);
          }
          const headers = rows[0]?.map((h: any, i: number) => h || `Column ${i + 1}`) || [];
          return { name, data: rows, headers };
        });
        setSheets(data);
        setErr(null);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [file]);

  const b64ToBlobURL = (b64: string) => {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };

  const runPipeline = async () => {
    setProcessing(true);
    setProdLink(null);
    setQuoteLink(null);
    setRaw(null);
    const fd = new FormData();
    fd.append("file", file);
    stpFiles.forEach((f) => fd.append("stpFiles", f, f.name));
    const res = await fetch("/api/process-xlsx", { method: "POST", body: fd });
    if (!res.ok) {
      alert("服务器处理失败 – " + (await res.text()));
      setProcessing(false);
      return;
    }
    const j = await res.json();
    setProdLink(b64ToBlobURL(j.productionOrderBase64));
    setQuoteLink(b64ToBlobURL(j.quotationBase64));
    setRaw(j.rawOutput);
    setProcessing(false);
  };

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">Error: {err}</div>;
  const sh = sheets[active];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Button onClick={runPipeline} disabled={processing}>{processing ? "生成中…" : "生成生产单 & 报价单"}</Button>
        {prodLink && <a href={prodLink} download="production_order.xlsx" className="text-blue-600 underline">下载生产单</a>}
        {quoteLink && <a href={quoteLink} download="quotation.xlsx" className="text-blue-600 underline">下载报价单</a>}
      </div>

      {raw && (
        <details className="border p-2 rounded bg-gray-50 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
          <summary className="cursor-pointer select-none mb-1">查看 LLM 原始输出</summary>
          {raw}
        </details>
      )}

      {sheets.length > 1 && (
        <div className="flex gap-1 border-b overflow-x-auto">
          {sheets.map((s, i) => (
            <button key={s.name} onClick={() => setActive(i)} className={`px-3 py-1 text-sm ${i===active ? "bg-green-200" : "bg-gray-100"}`}>{s.name}</button>
          ))}
        </div>
      )}

      <div className="overflow-auto max-h-[70vh] border rounded text-sm">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-gray-50">
            <tr>{sh.headers.map((h,i)=><th key={i} className="border px-2 py-1">{h}</th>)}</tr>
          </thead>
          <tbody>
            {sh.data.slice(1).map((row,ri)=>(
              <tr key={ri}>{row.map((c,ci)=><td key={ci} className="border px-2 py-1 whitespace-nowrap">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
