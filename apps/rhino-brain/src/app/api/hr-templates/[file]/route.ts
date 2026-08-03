import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getSession, isManager } from "@/lib/auth";

// Blank new-hire packet templates (generated 2026-08-01). Allowlist — the
// route must never read arbitrary paths.
const TEMPLATES = new Set([
  "Rhino-Tire-USA-Offer-Letter-Template.docx",
  "Rhino-Tire-USA-Onboarding-Checklist.docx",
  "Rhino-Tire-USA-Policy-Acknowledgments.docx",
  "Rhino-Tire-USA-Emergency-Contact-Form.docx",
]);

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const session = await getSession();
  if (!session || !isManager(session)) return new NextResponse("Forbidden", { status: 403 });
  if (!TEMPLATES.has(params.file)) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(process.cwd(), "files", "hr-templates", params.file);
  const buf = await fs.readFile(filePath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${params.file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
