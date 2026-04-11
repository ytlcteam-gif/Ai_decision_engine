import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

type Mode = "logical" | "emotional" | "brutal";

type DecisionResult = {
  pros: string[];
  cons: string[];
  risk: string;
  decision: string;
  confidence: string;
};

const VALID_MODES: Mode[] = ["logical", "emotional", "brutal"];

const MODE_BEHAVIOR: Record<Mode, string> = {
  logical: "Use concise, structured reasoning.",
  emotional: "Use concise, empathetic reasoning.",
  brutal: "Use concise, direct, blunt reasoning.",
};

const GEMINI_MODEL = "gemini-2.5-flash";

const FALLBACK_RESPONSE: DecisionResult = {
  pros: ["Unable to analyze at this time."],
  cons: ["Unable to analyze at this time."],
  risk: "Unknown - please try again.",
  decision: "Could not generate a decision. Please retry.",
  confidence: "0%",
};

export const runtime = "nodejs";
export const maxDuration = 30;

function methodNotAllowed() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}

function buildPrompt(dilemma: string, mode: Mode) {
  return [
    "Return only valid JSON matching this shape:",
    '{"pros":["string"],"cons":["string"],"risk":"string","decision":"string","confidence":"string"}',
    `Mode: ${MODE_BEHAVIOR[mode]}`,
    `Dilemma: ${dilemma}`,
  ].join("\n");
}

function parseDecisionResult(rawText: string): DecisionResult {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<DecisionResult>;

  if (
    !parsed ||
    !Array.isArray(parsed.pros) ||
    !Array.isArray(parsed.cons) ||
    typeof parsed.risk !== "string" ||
    typeof parsed.decision !== "string" ||
    typeof parsed.confidence !== "string"
  ) {
    return FALLBACK_RESPONSE;
  }

  return {
    pros: parsed.pros.filter((item): item is string => typeof item === "string"),
    cons: parsed.cons.filter((item): item is string => typeof item === "string"),
    risk: parsed.risk,
    decision: parsed.decision,
    confidence: parsed.confidence,
  };
}

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });

  const rawText = response.text ?? "";

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  return rawText;
}

export async function POST(req: NextRequest) {
  let body: { dilemma?: unknown; mode?: unknown };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body. Expected JSON." }, { status: 400 });
  }

  const dilemma = typeof body.dilemma === "string" ? body.dilemma.trim().slice(0, 500) : "";
  const mode = body.mode;

  if (!dilemma) {
    return NextResponse.json({ error: "Dilemma must not be empty." }, { status: 400 });
  }

  if (!mode || !VALID_MODES.includes(mode as Mode)) {
    return NextResponse.json(
      { error: `Mode must be one of: ${VALID_MODES.join(", ")}.` },
      { status: 400 }
    );
  }

  const prompt = buildPrompt(dilemma, mode as Mode);

  try {
    const rawText = await callGemini(prompt);
    const parsed = parseDecisionResult(rawText);
    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("Missing GEMINI_API_KEY")) {
      return NextResponse.json(
        { error: "API key not configured. Please set GEMINI_API_KEY in your environment variables." },
        { status: 500 }
      );
    }

    console.error("Gemini request failed:", message);
    return NextResponse.json(
      { error: "Failed to reach the AI service. Please try again." },
      { status: 500 }
    );
  }
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
