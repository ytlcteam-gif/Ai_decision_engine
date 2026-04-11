import { NextRequest, NextResponse } from "next/server";

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

// gemini-2.0-flash: fast (~1-3s), stable, works within Vercel Hobby 10s limit
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_HATE_SPEECH",        threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT",  threshold: "BLOCK_ONLY_HIGH" },
];

const FALLBACK_RESPONSE: DecisionResult = {
  pros: ["Unable to analyze at this time."],
  cons: ["Unable to analyze at this time."],
  risk: "Unknown - please try again.",
  decision: "Could not generate a decision. Please retry.",
  confidence: "0%",
};

// Hobby plan hard limit is 10s — keep under that
export const runtime = "nodejs";
export const maxDuration = 10;

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s to stay under 10s Hobby limit

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
        safetySettings: SAFETY_SETTINGS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini HTTP error:", response.status, errorText);
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    console.log("Raw Gemini response:", JSON.stringify(data));

    const candidate = data.candidates?.[0];

    if (!candidate) {
      throw new Error("Gemini returned no candidates — may have been blocked.");
    }

    if (candidate.finishReason === "SAFETY" || candidate.finishReason === "RECITATION") {
      throw new Error(`BLOCKED:${candidate.finishReason}`);
    }

    const rawText = candidate.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    if (!rawText.trim()) {
      throw new Error("Gemini returned empty content.");
    }

    return rawText;
  } finally {
    clearTimeout(timeoutId);
  }
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
        { error: "API key not configured. Please set GEMINI_API_KEY in your Vercel environment variables." },
        { status: 500 }
      );
    }

    if (message.startsWith("BLOCKED:")) {
      return NextResponse.json(
        { error: "The AI declined to answer this dilemma. Try rephrasing it!" },
        { status: 422 }
      );
    }

    if (message.includes("aborted") || message.includes("abort")) {
      return NextResponse.json(
        { error: "The request timed out. Please try again." },
        { status: 504 }
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
