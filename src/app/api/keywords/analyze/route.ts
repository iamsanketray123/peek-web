import { NextResponse } from "next/server";
import { analyzeKeyword } from "@/lib/aso/analyze";
import { ITunesError } from "@/lib/aso/itunes";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { keyword?: string; country?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  const country = (body.country ?? "us").trim().toLowerCase();

  if (!keyword) {
    return NextResponse.json({ error: "Keyword is required." }, { status: 400 });
  }
  if (keyword.length > 100) {
    return NextResponse.json({ error: "Keyword too long." }, { status: 400 });
  }

  try {
    const result = await analyzeKeyword(keyword, country);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ITunesError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("analyze error", e);
    return NextResponse.json({ error: "Failed to analyze keyword." }, { status: 500 });
  }
}
