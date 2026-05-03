'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  FileSpreadsheet,
  Lock,
  PieChart,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import {
  ASSET_LABELS,
  MANUAL_ASSET_OPTIONS,
  MANUAL_CATEGORY_OPTIONS,
  RISK_QUESTIONS,
  buildPortfolioAssessment,
  enrichHoldingClassification,
  type AllocationRange,
  type AllocationRow,
  type NormalizedPortfolioHolding,
} from '@/lib/portfolio-assessment';

interface UploadResponse {
  ok: boolean;
  holdings: NormalizedPortfolioHolding[];
  warnings?: string[];
  error?: string;
}

type AssessmentTab = 'assets' | 'sectors' | 'exposure';

function fmtCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtRange(range?: AllocationRange) {
  if (!range) return 'Unlock after questionnaire';
  return `${range.min}% - ${range.max}%`;
}

function statusClasses(status: AllocationRow['status']) {
  if (status === 'over') return 'bg-amber-100 text-amber-700';
  if (status === 'under') return 'bg-blue-100 text-blue-700';
  if (status === 'ideal') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
}

function progressPct(current: number, total: number) {
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
}

function overrideHolding(
  holding: NormalizedPortfolioHolding,
  assetClass?: string,
  category?: string,
): NormalizedPortfolioHolding {
  const classification = enrichHoldingClassification({
    schemeName: holding.schemeName,
    amcName: holding.amcName,
    assetClass: assetClass ?? holding.assetClass,
    category: category ?? holding.category,
    metadata: holding.metadata,
  });

  return {
    ...holding,
    assetClass: assetClass ?? holding.assetClass,
    category: category ?? holding.category,
    inferredAssetBucket: classification.inferredAssetBucket,
    inferredEquityBucket: classification.inferredEquityBucket,
    inferredSector: classification.inferredSector,
    assetBreakdown: classification.assetBreakdown,
    confidence: classification.confidence === 'low' ? 'medium' : classification.confidence,
    inferenceSource: [...classification.inferenceSource, 'manual-review'],
  };
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-slate-900 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500'
      }`}
    >
      {label}
    </div>
  );
}

function SummaryTile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

export default function PortfolioAssessmentPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [uploadedHoldings, setUploadedHoldings] = useState<NormalizedPortfolioHolding[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { assetClass?: string; category?: string }>>({});
  const [startedQuestionnaire, setStartedQuestionnaire] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [completed, setCompleted] = useState(false);
  const [tab, setTab] = useState<AssessmentTab>('assets');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const resolvedHoldings = uploadedHoldings.map((holding) => {
    const override = overrides[holding.id];
    if (!override) return holding;
    return overrideHolding(holding, override.assetClass, override.category);
  });

  const previewAssessment = buildPortfolioAssessment(resolvedHoldings);
  const finalAssessment = completed ? buildPortfolioAssessment(resolvedHoldings, answers) : null;
  const unresolvedHoldings = resolvedHoldings.filter((holding) => holding.confidence === 'low');
  const activePrompt = RISK_QUESTIONS[currentQuestion];

  useEffect(() => {
    if (!completed) return;
    const section = document.getElementById('assessment-dashboard');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [completed]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setUploadWarnings([]);
    setStartedQuestionnaire(false);
    setCurrentQuestion(0);
    setAnswers({});
    setCompleted(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/portfolio/assessment', { method: 'POST', body: form });
      const data = await res.json() as UploadResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Upload failed');
        setUploadedHoldings([]);
        return;
      }
      setUploadedHoldings(data.holdings ?? []);
      setUploadWarnings(data.warnings ?? []);
      setOverrides({});
    } catch {
      setError('Upload failed. Please try again with a valid CSV or Excel file.');
      setUploadedHoldings([]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function selectAnswer(score: number) {
    if (!activePrompt) return;
    const nextAnswers = { ...answers, [activePrompt.id]: score };
    setAnswers(nextAnswers);
    if (currentQuestion === RISK_QUESTIONS.length - 1) {
      setCompleted(true);
      setStartedQuestionnaire(true);
      return;
    }
    setCurrentQuestion((value) => value + 1);
  }

  const canStartRiskProfile = resolvedHoldings.length > 0;
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f4f1ea_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                <ShieldCheck className="h-3.5 w-3.5" />
                Portfolio Assessment Tool
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
                Review your mutual fund allocation with a risk-profile-led dashboard.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
                Upload your portfolio file, complete a short 9-question risk profile, and compare your current
                allocation against an educational ideal range across assets, equity styles, sectors, and concentration.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  leftIcon={<Upload className="h-4 w-4" />}
                  onClick={() => inputRef.current?.click()}
                >
                  Upload Portfolio
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  leftIcon={<Target className="h-4 w-4" />}
                  onClick={() => {
                    if (!canStartRiskProfile) return;
                    setStartedQuestionnaire(true);
                    document.getElementById('risk-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  disabled={!canStartRiskProfile}
                >
                  Start Risk Profile
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                  onClick={() => document.getElementById('assessment-dashboard')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  View Portfolio Assessment
                </Button>
              </div>
            </div>

            <div className="grid w-full max-w-sm grid-cols-2 gap-3 rounded-[24px] bg-slate-950 p-4 text-white">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-slate-300">Supported files</p>
                <p className="mt-2 text-lg font-semibold">CSV / XLS / XLSX</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-slate-300">Risk questions</p>
                <p className="mt-2 text-lg font-semibold">9-step profile</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-slate-300">Dashboard views</p>
                <p className="mt-2 text-lg font-semibold">Assets / Sectors / Exposure</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-slate-300">Language</p>
                <p className="mt-2 text-lg font-semibold">Review-focused</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <StepPill active={uploadedHoldings.length === 0} done={uploadedHoldings.length > 0} label="1. Upload" />
          <StepPill active={uploadedHoldings.length > 0 && !completed} done={completed} label="2. Risk Profile" />
          <StepPill active={completed} done={completed} label="3. Assessment" />
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-200/80 bg-white/90">
            <CardHeader
              title="Portfolio Upload"
              description="Upload your mutual fund portfolio in Excel or CSV format. We’ll infer missing classification data wherever possible."
              action={
                <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
                  .csv .xls .xlsx
                </div>
              }
            />
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-900">Upload your portfolio file</p>
              <p className="mt-2 text-sm text-slate-500">
                Include scheme name, invested amount, current value, units, folio number, AMC name, asset class, or category where available.
              </p>
              <Button
                className="mt-5"
                loading={busy}
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? 'Analysing portfolio...' : 'Choose File'}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </div>
            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
            {uploadWarnings.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {uploadWarnings[0]}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden border-slate-200/80 bg-slate-950 text-white">
            <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.35),_transparent_55%)]" />
            <div className="relative">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">What this covers</p>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <PieChart className="mt-0.5 h-4 w-4 text-cyan-300" />
                  <span>Current allocation across equity, debt, gold/commodity, international, and others.</span>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-cyan-300" />
                  <span>Risk-profile-based ideal allocation ranges with over, under, or aligned signals.</span>
                </div>
                <div className="flex items-start gap-3">
                  <BriefcaseBusiness className="mt-0.5 h-4 w-4 text-cyan-300" />
                  <span>AMC, scheme, and sector concentration review so you can spot clustering risks quickly.</span>
                </div>
              </div>
              <p className="mt-6 text-xs leading-5 text-slate-400">
                This experience uses portfolio assessment language only. It does not name funds to buy or sell.
              </p>
            </div>
          </Card>
        </section>

        {resolvedHoldings.length > 0 && (
          <section className="mt-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile
                label="Portfolio Value"
                value={fmtCurrency(previewAssessment.totalPortfolioValue)}
                helper="Based on uploaded portfolio rows and available NAV/current value data."
              />
              <SummaryTile
                label="Invested Amount"
                value={fmtCurrency(previewAssessment.totalInvestedAmount)}
                helper="Used as reference for portfolio assessment context."
              />
              <SummaryTile
                label="Schemes"
                value={String(previewAssessment.concentration.totalSchemes)}
                helper="Used to identify over-diversification or concentration risks."
              />
              <SummaryTile
                label="Review Flags"
                value={String(previewAssessment.concentration.alerts.length)}
                helper="Includes low-confidence mapping and concentration review alerts."
              />
            </div>
          </section>
        )}

        {unresolvedHoldings.length > 0 && (
          <section className="mt-6">
            <Card className="border-amber-200 bg-amber-50/80">
              <CardHeader
                title="Manual Mapping Review"
                description="Some funds could not be classified confidently. You can optionally refine their asset class and category before completing the risk profile."
              />
              <div className="mt-5 space-y-4">
                {unresolvedHoldings.map((holding) => (
                  <div key={holding.id} className="rounded-2xl border border-amber-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">{holding.schemeName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Current mapping: {ASSET_LABELS[holding.inferredAssetBucket]} · {holding.category || 'No category'}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-slate-600">
                        Asset class
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                          value={overrides[holding.id]?.assetClass ?? holding.assetClass ?? ''}
                          onChange={(event) =>
                            setOverrides((current) => ({
                              ...current,
                              [holding.id]: { ...current[holding.id], assetClass: event.target.value },
                            }))
                          }
                        >
                          <option value="">Keep inferred mapping</option>
                          {MANUAL_ASSET_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Category
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                          value={overrides[holding.id]?.category ?? holding.category ?? ''}
                          onChange={(event) =>
                            setOverrides((current) => ({
                              ...current,
                              [holding.id]: { ...current[holding.id], category: event.target.value },
                            }))
                          }
                        >
                          <option value="">Keep inferred category</option>
                          {MANUAL_CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {holding.suggestionOptions && holding.suggestionOptions.length > 0 && (
                      <p className="mt-3 text-xs text-slate-500">
                        Closest scheme matches: {holding.suggestionOptions.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        <section id="risk-profile" className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-200/80 bg-white/90">
            <CardHeader
              title="Risk Profile"
              description="The ideal allocation range unlocks after the questionnaire is complete."
            />
            {!startedQuestionnaire && (
              <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">9 questions. Roughly 2 minutes.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  We assess risk capacity, willingness, and behaviour so the dashboard compares your current
                  portfolio with an educational ideal allocation range that matches your profile.
                </p>
                <Button
                  className="mt-5"
                  leftIcon={<Target className="h-4 w-4" />}
                  disabled={!canStartRiskProfile}
                  onClick={() => setStartedQuestionnaire(true)}
                >
                  Start Risk Profile
                </Button>
                {!canStartRiskProfile && (
                  <p className="mt-3 text-xs text-slate-500">Upload a portfolio first to begin the assessment flow.</p>
                )}
              </div>
            )}

            {startedQuestionnaire && !completed && activePrompt && (
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{activePrompt.section}</span>
                  <span>Question {currentQuestion + 1} of {RISK_QUESTIONS.length}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all"
                    style={{ width: `${progressPct(currentQuestion, RISK_QUESTIONS.length - 1)}%` }}
                  />
                </div>
                <div className="mt-5 rounded-[24px] bg-slate-950 p-5 text-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{activePrompt.weightLabel}</p>
                  <h3 className="mt-3 text-xl font-semibold">{activePrompt.label}</h3>
                  <div className="mt-5 space-y-3">
                    {activePrompt.options.map((option) => (
                      <button
                        key={option.label}
                        onClick={() => selectAnswer(option.score)}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-cyan-300/40 hover:bg-white/10"
                      >
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="mt-1 text-xs text-slate-400">{option.helper}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {completed && finalAssessment?.riskProfile && (
              <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">Risk Profile Ready</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{finalAssessment.riskProfile.profile}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Score: {finalAssessment.riskProfile.score}/100 across capacity, willingness, and behaviour inputs.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => document.getElementById('assessment-dashboard')?.scrollIntoView({ behavior: 'smooth' })}>
                    View Portfolio Assessment
                  </Button>
                  <Button variant="ghost" onClick={() => { setCompleted(false); setCurrentQuestion(0); setAnswers({}); }}>
                    Retake Questionnaire
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="border-slate-200/80 bg-white/90">
            <CardHeader
              title="Portfolio Preview"
              description="Current uploaded allocation before ideal ranges are unlocked."
            />
            <div className="mt-5 space-y-4">
              {previewAssessment.assetRows.map((row) => (
                <div key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">Current allocation</p>
                    </div>
                    <p className="text-lg font-semibold text-slate-900">{row.currentPct}%</p>
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-5 text-slate-500">
                Ideal allocation ranges remain locked until the full risk profile is completed.
              </div>
            </div>
          </Card>
        </section>

        <section id="assessment-dashboard" className="mt-6">
          <Card className="border-slate-200/80 bg-white/95">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Portfolio Assessment Summary</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {finalAssessment?.riskProfile ? `${finalAssessment.riskProfile.profile} profile comparison` : 'Current portfolio review'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  Compare your current allocation with the ideal range for your risk profile and review where you may be over-allocated, under-allocated, or broadly aligned.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['assets', 'sectors', 'exposure'] as AssessmentTab[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    className={`rounded-full px-4 py-2 text-sm font-medium capitalize ${
                      tab === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {!completed && (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Lock className="h-6 w-6" />
                </div>
                <p className="mt-4 text-lg font-semibold text-slate-900">Ideal allocation is locked for now</p>
                <p className="mt-2 text-sm text-slate-500">
                  Complete the 9-question risk profile to unlock ideal ranges, profile classification, and review insights.
                </p>
              </div>
            )}

            {completed && finalAssessment && (
              <div className="mt-6 space-y-6">
                {tab === 'assets' && (
                  <>
                    <div className="overflow-hidden rounded-[24px] border border-slate-200">
                      <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr_1.4fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                        <span>Asset View</span>
                        <span>Current</span>
                        <span>Ideal</span>
                        <span>Action Needed</span>
                      </div>
                      {finalAssessment.assetRows.map((row) => (
                        <div key={row.key} className="grid grid-cols-1 gap-2 border-t border-slate-100 px-4 py-4 md:grid-cols-[1.2fr_0.8fr_0.9fr_1.4fr] md:items-center">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses(row.status)}`}>
                              {row.status === 'over' ? 'Review reduction' : row.status === 'under' ? 'Review increase' : 'Aligned'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{row.currentPct}%</p>
                          <p className="text-sm text-slate-700">{fmtRange(row.idealRange)}</p>
                          <p className="text-sm text-slate-500">{row.recommendation}</p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-[24px] border border-slate-200">
                      <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr_1.4fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                        <span>Equity Sub-category View</span>
                        <span>Current</span>
                        <span>Ideal</span>
                        <span>Action Needed</span>
                      </div>
                      {finalAssessment.equityRows.map((row) => (
                        <div key={row.key} className="grid grid-cols-1 gap-2 border-t border-slate-100 px-4 py-4 md:grid-cols-[1.2fr_0.8fr_0.9fr_1.4fr] md:items-center">
                          <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                          <p className="text-sm text-slate-700">{row.currentPct}%</p>
                          <p className="text-sm text-slate-700">{fmtRange(row.idealRange)}</p>
                          <p className="text-sm text-slate-500">{row.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {tab === 'sectors' && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {finalAssessment.sectorRows.map((row) => (
                      <div key={row.key} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-base font-semibold text-slate-900">{row.label}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses(row.status)}`}>
                            {row.status === 'over' ? 'Reduce' : row.status === 'under' ? 'Increase' : 'Maintain'}
                          </span>
                        </div>
                        <p className="mt-4 text-3xl font-semibold text-slate-900">{row.currentPct}%</p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{row.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'exposure' && (
                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Exposure Review</p>
                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                          <p>Number of mutual fund schemes: <span className="font-semibold text-slate-900">{finalAssessment.concentration.totalSchemes}</span></p>
                          <p>AMCs above 20% exposure: <span className="font-semibold text-slate-900">{finalAssessment.concentration.amcConcentration.length}</span></p>
                          <p>Schemes above 10% exposure: <span className="font-semibold text-slate-900">{finalAssessment.concentration.schemeConcentration.length}</span></p>
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Assessment Insights</p>
                        <div className="mt-4 space-y-3">
                          {finalAssessment.insights.map((insight) => (
                            <div key={insight} className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                              {insight}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Exposure Alerts</p>
                        <div className="mt-4 space-y-3">
                          {finalAssessment.concentration.alerts.map((alert) => (
                            <div key={alert} className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                              {alert}
                            </div>
                          ))}
                          {finalAssessment.concentration.alerts.length === 0 && (
                            <p className="text-sm text-slate-500">No additional diversification or concentration review flags were triggered.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">AMC Concentration</p>
                        <div className="mt-4 space-y-3">
                          {finalAssessment.concentration.amcConcentration.length === 0 && (
                            <p className="text-sm text-slate-500">No AMC currently exceeds the 20% review threshold.</p>
                          )}
                          {finalAssessment.concentration.amcConcentration.map((item) => (
                            <div key={item.name} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                              <p className="text-sm font-medium text-slate-900">{item.name}</p>
                              <p className="text-sm text-slate-600">{item.pct}%</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Scheme Concentration</p>
                        <div className="mt-4 space-y-3">
                          {finalAssessment.concentration.schemeConcentration.length === 0 && (
                            <p className="text-sm text-slate-500">No scheme currently exceeds the 10% review threshold.</p>
                          )}
                          {finalAssessment.concentration.schemeConcentration.map((item) => (
                            <div key={item.name} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                              <p className="text-sm font-medium text-slate-900">{item.name}</p>
                              <p className="text-sm text-slate-600">{item.pct}%</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-500">
                  {finalAssessment.disclaimer}
                </div>
              </div>
            )}
          </Card>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/portfolio" className="text-sm text-slate-500 hover:text-slate-900">
            Back to Portfolio
          </Link>
          <Link href="/portfolio/mutual-funds" className="text-sm text-slate-500 hover:text-slate-900">
            View Mutual Funds
          </Link>
        </div>
      </div>
    </div>
  );
}
