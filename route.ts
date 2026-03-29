import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "logical" | "emotional" | "brutal";

interface RequestBody {
  dilemma: string;
  mode: Mode;
}

interface DecisionResponse {
  pros: string[];
  cons: string[];
  risk: string;
  decision: string;
  confidence: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_MODES: Mode[] = ["logical", "emotional", "brutal"];
const MAX_DILEMMA_LENGTH = 500;
const API_TIMEOUT_MS = 20_000;

// ─── System Prompts ───────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<Mode, string> = {
  logical: `You are a rational decision analyst. Analyze the dilemma using logic, data, and risk assessment.
Be objective. No emotions. Focus on facts and probabilities.`,

  emotional: `You are an empathetic life coach. Analyze the dilemma with emotional intelligence.
Consider feelings, relationships, and personal fulfillment. Be warm but honest.`,

  brutal: `You are a brutally honest advisor with zero filter. No sugarcoating.
Tell the truth even if it's uncomfortable. Be direct, sharp, and cut through excuses.`,
};

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(dilemma: string, mode: Mode): string {
  return `Dilemma: "${dilemma}"

Respond ONLY with valid JSON. No extra text, no markdown, no code fences.
Strictly follow this schema:
{
  "pros": ["string", ...],
  "cons": ["string", ...],
  "risk": "string",
  "decision": "string",
  "confidence": "string (e.g. 78%)"
}`;
}

// ─── JSON Parser (strict) ─────────────────────────────────────────────────────

function parseDecisionJSON(raw: string): DecisionResponse {
  // Strip any accidental markdown fences if model slips up
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  // Validate shape
  if (
    !Array.isArray(parsed.pros) ||
    !Array.isArray(parsed.cons) ||
    typeof parsed.risk !== "string" ||
    typeof parsed.decision !== "string" ||
    typeof parsed.confidence !== "string"
  ) {
    throw new Error("Response does not match required JSON contract.");
  }

  return parsed as DecisionResponse;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body. Expected JSON." },
      { status: 400 }
    );
  }

  const { dilemma, mode } = body;

  // ── 2. Validate input ──────────────────────────────────────────────────────
  if (!dilemma || typeof dilemma !== "string" || dilemma.trim().length < 10) {
    return NextResponse.json(
      { error: "Dilemma must be at least 10 characters." },
      { status: 400 }
    );
  }

  if (dilemma.trim().length > MAX_DILEMMA_LENGTH) {
    return NextResponse.json(
      { error: `Dilemma must not exceed ${MAX_DILEMMA_LENGTH} characters.` },
      { status: 400 }
    );
  }

  if (!mode || !VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Mode must be one of: ${VALID_MODES.join(", ")}.` },
      { status: 400 }
    );
  }

  // ── 3. Init Anthropic client ───────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set.");
    return NextResponse.json(
      { error: "Server configuration error. Contact support." },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  // ── 4. Call Claude with timeout ────────────────────────────────────────────
  let rawText: string;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out.")), API_TIMEOUT_MS)
    );

    const claudePromise = client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPTS[mode],
      messages: [
        {
          role: "user",
          content: buildPrompt(dilemma.trim(), mode),
        },
      ],
    });

    const response = await Promise.race([claudePromise, timeoutPromise]);

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected response type from Claude.");
    }

    rawText = block.text;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error.";

    if (message === "Request timed out.") {
      return NextResponse.json(
        { error: "The request timed out. Please try again." },
        { status: 504 }
      );
    }

    console.error("Claude API error:", message);
    return NextResponse.json(
      { error: "Failed to reach the AI service. Please try again." },
      { status: 502 }
    );
  }

  // ── 5. Parse & validate JSON contract ─────────────────────────────────────
  let decision: DecisionResponse;
  try {
    decision = parseDecisionJSON(rawText);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Parse error.";
    console.error("JSON parse error:", message, "\nRaw:", rawText);
    return NextResponse.json(
      { error: "The AI returned an unexpected format. Please retry." },
      { status: 500 }
    );
  }

  // ── 6. Return result ───────────────────────────────────────────────────────
  return NextResponse.json(decision, { status: 200 });
}
