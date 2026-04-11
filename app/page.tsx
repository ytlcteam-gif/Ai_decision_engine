"use client";

import { useState, useEffect, useRef } from "react";
import { Brain, Zap, Heart, Flame, Moon, Sun, Loader2, AlertCircle, Copy, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "logical" | "emotional" | "brutal";

interface DecisionResult {
  pros: string[];
  cons: string[];
  risk: string;
  decision: string;
  confidence: string;
}

interface ModeOption {
  value: Mode;
  label: string;
  icon: React.ReactNode;
  description: string;
  activeClass: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODES: ModeOption[] = [
  {
    value: "logical",
    label: "Logical",
    icon: <Brain className="w-4 h-4" />,
    description: "Data-driven, rational analysis",
    activeClass: "border-blue-500 bg-blue-500/10 text-blue-400",
  },
  {
    value: "emotional",
    label: "Emotional",
    icon: <Heart className="w-4 h-4" />,
    description: "Empathy-first, feeling-aware",
    activeClass: "border-pink-500 bg-pink-500/10 text-pink-400",
  },
  {
    value: "brutal",
    label: "Brutal",
    icon: <Flame className="w-4 h-4" />,
    description: "No filter, raw honesty",
    activeClass: "border-orange-500 bg-orange-500/10 text-orange-400",
  },
];

// ─── Typing Effect Hook ───────────────────────────────────────────────────────

function useTypingEffect(text: string, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

// ─── Results Panel ────────────────────────────────────────────────────────────

function ResultsPanel({ result }: { result: DecisionResult }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const { displayed, done } = useTypingEffect(result.decision);

  // Trigger fade-in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const handleCopy = async () => {
    const text = [
      `PROS:\n${result.pros.map((p) => `+ ${p}`).join("\n")}`,
      `CONS:\n${result.cons.map((c) => `- ${c}`).join("\n")}`,
      `RISK: ${result.risk}`,
      `DECISION: ${result.decision}`,
      `CONFIDENCE: ${result.confidence}`,
    ].join("\n\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 text-sm",
        "transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
    >
      {/* Pros */}
      <div className="p-4 space-y-2">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pros</p>
        <ul className="space-y-1">
          {result.pros?.map((pro, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">+</span>
              <span>{pro}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Cons */}
      <div className="p-4 space-y-2">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Cons</p>
        <ul className="space-y-1">
          {result.cons?.map((con, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">−</span>
              <span>{con}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Risk */}
      <div className="p-4 space-y-1">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Risk</p>
        <p>{result.risk}</p>
      </div>

      {/* Decision — typing effect */}
      <div className="p-4 space-y-1">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Decision</p>
        <p className="font-medium">
          {displayed}
          {!done && (
            <span className="inline-block w-0.5 h-4 bg-zinc-400 dark:bg-zinc-500 ml-0.5 animate-pulse align-middle" />
          )}
        </p>
      </div>

      {/* Confidence */}
      <div className="p-4 flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Confidence</p>
        <Badge variant="outline" className="text-xs">{result.confidence}</Badge>
      </div>

      {/* Actions */}
      <div className="p-4 flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-1.5 text-xs border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-green-500" /> Copied!</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Copy Analysis</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIDecisionEngine() {
  const [dilemma, setDilemma] = useState("");
  const [mode, setMode] = useState<Mode>("logical");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async () => {
    setError(null);

    if (!dilemma.trim()) {
      setError("Please describe your dilemma before submitting.");
      return;
    }
    if (dilemma.trim().length < 10) {
      setError("Dilemma is too short. Give me something to work with.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dilemma, mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDilemma("");
    setResult(null);
    setError(null);
  };

  return (
    <div className={darkMode ? "dark" : ""}>
      <main className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">

        {/* ── Top Bar ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <span className="font-semibold tracking-tight text-sm">AI Decision Engine</span>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* ── Main Content ────────────────────────────────────────────────── */}
        <section className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">

          {/* Heading */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              What&apos;s your dilemma?
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Describe your situation. The engine will analyze it and give you a decision.
            </p>
          </div>

          {/* Error Toast */}
          {error && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Textarea */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Your Dilemma
            </label>
            <Textarea
              placeholder="e.g. Should I quit my stable job to start my own business?"
              value={dilemma}
              onChange={(e) => {
                setDilemma(e.target.value);
                if (error) setError(null);
              }}
              rows={5}
              className={cn(
                "resize-none text-sm bg-zinc-50 dark:bg-zinc-900",
                "border-zinc-200 dark:border-zinc-800",
                "focus:ring-2 focus:ring-zinc-500 focus:border-transparent",
                "placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              )}
            />
            <p className="text-xs text-zinc-400 dark:text-zinc-600 text-right">
              {dilemma.length} / 500
            </p>
          </div>

          {/* Mode Selector */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Advice Mode
            </label>
            <div className="grid grid-cols-3 gap-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                    "text-sm font-medium",
                    "hover:border-zinc-400 dark:hover:border-zinc-600",
                    mode === m.value
                      ? m.activeClass
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  {m.icon}
                  <span>{m.label}</span>
                  <span className="text-[10px] font-normal opacity-70 text-center leading-tight hidden sm:block">
                    {m.description}
                  </span>
                </button>
              ))}
            </div>

            {/* Active mode badge */}
            <div className="flex justify-center">
              <Badge variant="outline" className="text-xs capitalize gap-1">
                {MODES.find((m) => m.value === mode)?.icon}
                {mode} mode selected
              </Badge>
            </div>
          </div>

          {/* Submit + Reset Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={loading}
              size="lg"
              className={cn(
                "flex-1 font-semibold tracking-wide transition-all duration-200",
                "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900",
                "hover:bg-zinc-700 dark:hover:bg-zinc-300",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Analyze My Dilemma
                </span>
              )}
            </Button>

            {(result || dilemma) && (
              <Button
                onClick={handleReset}
                disabled={loading}
                size="lg"
                variant="outline"
                className="gap-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Reset"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
            )}
          </div>

          {/* Results */}
          <div ref={resultRef}>
            {result ? (
              <ResultsPanel result={result} />
            ) : (
              <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
                Your decision analysis will appear here.
              </div>
            )}
          </div>

        </section>
      </main>
    </div>
  );
}
