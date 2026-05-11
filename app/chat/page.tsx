'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowUpRight,
  Database,
  FileUp,
  Loader2,
  Paperclip,
  RefreshCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  buildPortfolioAssessment,
  RISK_QUESTIONS,
  scoreRiskProfile,
  type AllocationRange,
  type NormalizedPortfolioHolding,
} from '@/lib/portfolio-assessment';
import type { WealthAssistantReply, WealthMessage } from '@/lib/wealth/types';

const STORAGE_KEY = 'artha-wealth-chat:v2';

function makeId() {
  return crypto.randomUUID();
}

function fmtCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtRange(range?: AllocationRange) {
  if (!range) return 'Locked';
  return `${range.min}% - ${range.max}%`;
}

function MessageRow({ message }: { message: WealthMessage }) {
  const assistant = message.role === 'assistant';
  return (
    <div className={clsx('flex w-full', assistant ? 'justify-start' : 'justify-end')}>
      <div className={clsx('flex w-full max-w-3xl gap-3', assistant ? 'flex-row' : 'flex-row-reverse')}>
        <div
          className={clsx(
            'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            assistant ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white',
          )}
        >
          {assistant ? 'AW' : 'You'}
        </div>
        <div
          className={clsx(
            'rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm',
            assistant
              ? 'border border-slate-200 bg-white text-slate-700'
              : 'bg-slate-950 text-white',
          )}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
          {assistant && ((message.usedSources?.length ?? 0) > 0 || message.confidence) && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
              {message.confidence && (
                <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  {message.confidence} confidence
                </div>
              )}
              {(message.usedSources?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.usedSources?.slice(0, 4).map((source) => (
                    <div key={source.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-slate-700">{source.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{source.source}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SideCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<WealthMessage[]>([
    {
      id: makeId(),
      role: 'assistant',
      content:
        'Artha Wealth is ready. Paste your holdings, upload a portfolio file, or ask for a portfolio assessment. I can turn unstructured holdings into a working allocation review.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [holdings, setHoldings] = useState<NormalizedPortfolioHolding[]>([]);
  const [riskAnswers, setRiskAnswers] = useState<Record<string, number>>({});
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [workspaceSummary, setWorkspaceSummary] = useState('');
  const [workspaceBusy, setWorkspaceBusy] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            messages?: WealthMessage[];
            holdings?: NormalizedPortfolioHolding[];
            riskAnswers?: Record<string, number>;
            workspaceSummary?: string;
          };
          if (!cancelled) {
            if (parsed.messages?.length) setMessages(parsed.messages);
            if (parsed.holdings) setHoldings(parsed.holdings);
            if (parsed.riskAnswers) setRiskAnswers(parsed.riskAnswers);
            if (parsed.workspaceSummary) setWorkspaceSummary(parsed.workspaceSummary);
          }
        }

        const res = await fetch('/api/wealth/workspace', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (data.workspace) {
          if (data.workspace.messages?.length) setMessages(data.workspace.messages);
          if (data.workspace.holdings) setHoldings(data.workspace.holdings);
          if (data.workspace.riskAnswers) setRiskAnswers(data.workspace.riskAnswers);
          if (data.workspace.summary) setWorkspaceSummary(data.workspace.summary);
        }
      } catch {
        // local fallback remains in memory
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setWorkspaceBusy(false);
        }
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, holdings, riskAnswers, workspaceSummary }));
    } catch {
      // ignore
    }
  }, [messages, holdings, riskAnswers, workspaceSummary]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      void fetch('/api/wealth/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, holdings, riskAnswers }),
      })
        .then(async (res) => res.json())
        .then((data) => {
          if (typeof data.workspace?.summary === 'string') setWorkspaceSummary(data.workspace.summary);
        })
        .catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [messages, holdings, riskAnswers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '0px';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
  }, [input]);

  const riskComplete = Object.keys(riskAnswers).length === RISK_QUESTIONS.length;
  const assessment = useMemo(
    () => (holdings.length > 0 ? buildPortfolioAssessment(holdings, riskComplete ? riskAnswers : undefined) : null),
    [holdings, riskAnswers, riskComplete],
  );
  const riskProfile = riskComplete ? scoreRiskProfile(riskAnswers) : null;
  const nextQuestion = RISK_QUESTIONS.find((question) => riskAnswers[question.id] == null) ?? null;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const nextMessages = [
      ...messages,
      { id: makeId(), role: 'user' as const, content: trimmed, createdAt: new Date().toISOString() },
    ];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/wealth/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, holdings, riskAnswers }),
      });
      const data = (await res.json()) as WealthAssistantReply & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Artha Wealth could not respond');

      if (data.holdings?.length) setHoldings(data.holdings);
      if (data.workspaceSummary) setWorkspaceSummary(data.workspaceSummary);
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: [
            data.ingestionNote,
            data.answer,
            data.suggestions?.length ? `Try next:\n• ${data.suggestions.join('\n• ')}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          usedSources: data.usedSources,
          confidence: data.confidence,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: error instanceof Error ? error.message : 'Artha Wealth hit a temporary issue.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadBusy(true);
    setUploadWarning(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/portfolio/assessment', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        holdings?: NormalizedPortfolioHolding[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Upload failed');

      setHoldings(data.holdings ?? []);
      setUploadWarning(data.warnings?.[0] ?? null);
      setWorkspaceSummary(`Workspace updated with ${data.holdings?.length ?? 0} uploaded holdings.`);
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: [
            `I loaded ${data.holdings?.length ?? 0} holdings from your file.`,
            data.warnings?.[0] ? `Review note: ${data.warnings[0]}` : '',
            'You can now ask me for an allocation summary, concentration review, or risk-profile-based assessment.',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ]);
    } catch (error) {
      setUploadWarning(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  async function resetWorkspace() {
    setMessages([
      {
        id: makeId(),
        role: 'assistant',
        content:
          'Artha Wealth is ready. Paste your holdings, upload a portfolio file, or ask for a portfolio assessment. I can turn unstructured holdings into a working allocation review.',
        createdAt: new Date().toISOString(),
      },
    ]);
    setHoldings([]);
    setRiskAnswers({});
    setWorkspaceSummary('');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      await fetch('/api/wealth/workspace', { method: 'DELETE' });
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.08),_transparent_24%),linear-gradient(180deg,_#f8faf8_0%,_#f5efe5_100%)]">
      <div className="mx-auto flex max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="hidden w-[320px] shrink-0 xl:block">
          <div className="sticky top-24 space-y-4">
            <SideCard title="Artha Wealth" description="AI portfolio copilot built around ingestion, risk profiling, and allocation review.">
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
                  <p className="text-xs text-slate-400">Portfolio context</p>
                  <p className="mt-1 text-2xl font-semibold">{holdings.length}</p>
                  <p className="text-xs text-slate-400">holdings in workspace</p>
                </div>
                <div className="rounded-2xl bg-emerald-600 px-4 py-4 text-white">
                  <p className="text-xs text-emerald-100">Risk profile</p>
                  <p className="mt-1 text-lg font-semibold">{riskProfile?.profile ?? 'Pending'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs text-slate-400">Memory layer</p>
                  <p className="mt-1 text-sm text-slate-700">{workspaceBusy ? 'Loading saved workspace...' : (workspaceSummary || 'No saved workspace summary yet.')}</p>
                </div>
              </div>
            </SideCard>

            <SideCard title="Quick prompts">
              <div className="space-y-2">
                {[
                  'Summarize my allocation',
                  'Where am I over-allocated?',
                  'What concentration risks do I have?',
                  'How should I think about my ideal range?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm text-slate-700 hover:border-slate-300 hover:bg-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </SideCard>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-4xl flex-col">
            <div className="rounded-[28px] border border-white/70 bg-white/75 px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Artha Wealth
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                    A proper AI agent for portfolio assessment.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    Paste holdings, upload a file, complete your risk profile, and talk to your portfolio like you would talk to a private wealth desk.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    leftIcon={<Paperclip className="h-4 w-4" />}
                    loading={uploadBusy}
                    onClick={() => fileRef.current?.click()}
                  >
                    Upload portfolio
                  </Button>
                  <a
                    href="/portfolio/assessment"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Assessment dashboard
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => void resetWorkspace()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Reset workspace
                  </button>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
              {uploadWarning && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  {uploadWarning}
                </div>
              )}
            </div>

            <div className="flex-1 px-0 py-6">
              {messages.length <= 1 && !holdings.length ? (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <h2 className="mt-5 text-2xl font-semibold text-slate-900">Start with a question or a portfolio.</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    Try a message like: <span className="font-medium text-slate-900">"Parag Parikh Flexi Cap, 250000, 312000"</span> or ask
                    <span className="font-medium text-slate-900"> "Where am I over-allocated?"</span>
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {[
                      'Summarize my allocation',
                      'Help me paste my holdings',
                      'What does the risk profile do?',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setInput(prompt)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:border-slate-300"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pb-44">
                  {messages.map((message) => (
                    <MessageRow key={message.id} message={message} />
                  ))}
                  {sending && (
                    <div className="flex w-full justify-start">
                      <div className="flex w-full max-w-3xl gap-3">
                        <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
                          AW
                        </div>
                        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Thinking through your portfolio
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 mt-auto pb-2">
              <div
                className={clsx(
                  'mx-auto max-w-4xl rounded-[28px] border bg-white/92 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.1)] backdrop-blur transition-colors',
                  composerFocused ? 'border-emerald-300' : 'border-slate-200',
                )}
              >
                <div className="flex items-end gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    aria-label="Upload portfolio file"
                  >
                    <FileUp className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setComposerFocused(true)}
                      onBlur={() => setComposerFocused(false)}
                      rows={1}
                      placeholder="Message Artha Wealth... paste holdings, ask for allocation review, or request a risk-profile-based assessment."
                      className="max-h-[220px] min-h-[48px] w-full resize-none bg-transparent px-1 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <div className="flex flex-wrap gap-2 pb-1 pt-1">
                      {['Paste holdings', 'Review concentration', 'Explain ideal allocation'].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setInput(prompt)}
                          className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => void sendMessage(input)}
                    disabled={!input.trim() || sending}
                    className="mb-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <SendHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden w-[340px] shrink-0 2xl:block">
          <div className="sticky top-24 space-y-4">
            <SideCard title="Portfolio workspace" description="Live state pulled from chat and uploads.">
              {holdings.length === 0 || !assessment ? (
                <p className="text-sm leading-6 text-slate-500">No holdings loaded yet. Upload a file or paste lines in chat.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Database className="h-4 w-4" />
                      <p className="text-xs font-medium uppercase tracking-[0.18em]">Saved workspace</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{workspaceSummary || 'Workspace summary will appear here as you chat.'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <p className="text-xs text-slate-400">Portfolio value</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{fmtCurrency(assessment.totalPortfolioValue)}</p>
                  </div>
                  <div className="space-y-2">
                    {assessment.assetRows.map((row) => (
                      <div key={row.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                          <span
                            className={clsx(
                              'rounded-full px-2.5 py-1 text-[11px] font-medium',
                              row.status === 'ideal'
                                ? 'bg-emerald-100 text-emerald-700'
                                : row.status === 'over'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-blue-100 text-blue-700',
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {row.currentPct}% now · ideal {fmtRange(row.idealRange)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SideCard>

            <SideCard title="Risk profile" description="Complete the 9-question profile to unlock ideal allocation ranges.">
              {!riskComplete && nextQuestion && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{nextQuestion.section}</p>
                    <p className="mt-2 text-sm font-medium">{nextQuestion.label}</p>
                  </div>
                  {nextQuestion.options.map((option) => (
                    <button
                      key={option.label}
                      onClick={() => setRiskAnswers((current) => ({ ...current, [nextQuestion.id]: option.score }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-slate-300 hover:bg-white"
                    >
                      <p className="text-sm font-medium text-slate-900">{option.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{option.helper}</p>
                    </button>
                  ))}
                  <p className="text-xs text-slate-500">{Object.keys(riskAnswers).length} / {RISK_QUESTIONS.length} answered</p>
                </div>
              )}
              {riskComplete && riskProfile && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Profile ready</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{riskProfile.profile}</p>
                  <p className="mt-1 text-sm text-slate-600">Score {riskProfile.score}/100</p>
                </div>
              )}
            </SideCard>
          </div>
        </div>
      </div>
    </div>
  );
}
