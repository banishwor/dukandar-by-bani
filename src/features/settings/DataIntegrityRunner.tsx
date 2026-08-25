import React, { useState } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { runDataIntegrityTestSuite, TestResult } from '../../services/dataIntegrityTestService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ShieldCheck, CheckCircle2, XCircle, Play, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export const DataIntegrityRunner: React.FC = () => {
  const { business } = useBusiness();
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<number | null>(null);

  const handleRunTests = async () => {
    if (!business) return;
    try {
      setIsRunning(true);
      const testResults = await runDataIntegrityTestSuite(business.id);
      setResults(testResults);
    } catch (err) {
      console.error('Test suite failed', err);
    } finally {
      setIsRunning(false);
    }
  };

  const passedCount = results?.filter((r) => r.passed).length || 0;
  const totalCount = results?.length || 0;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Phase 4 Data Integrity Verification Suite</h3>
            <p className="text-xs text-slate-500">15 Automated Scenarios verifying Inventory, FIFO, Returns, Voids & Ledgers</p>
          </div>
        </div>

        <Button
          onClick={handleRunTests}
          disabled={isRunning || !business}
          variant="primary"
          size="sm"
          className="self-start sm:self-auto gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running 15 Scenarios...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Run Integrity Suite
            </>
          )}
        </Button>
      </div>

      {/* Summary Scorecard if run */}
      {results && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between ${
            allPassed
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/80 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {allPassed ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
            )}
            <div>
              <span className="font-bold text-sm block">
                {allPassed
                  ? 'All 15 Data Integrity Scenarios Passed Successfully!'
                  : `${totalCount - passedCount} of ${totalCount} Scenarios Failed.`}
              </span>
              <span className="text-xs opacity-80">
                Validated mathematical precision, zero floating-point drift, and immutable event consistency.
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xl font-black font-mono">
              {passedCount}/{totalCount}
            </span>
          </div>
        </div>
      )}

      {/* Test List */}
      {results && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
          {results.map((r) => {
            const isExpanded = expandedTestId === r.id;
            return (
              <div key={r.id} className="p-3.5 hover:bg-slate-50/60 transition-colors">
                <div
                  className="flex items-center justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedTestId(isExpanded ? null : r.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {r.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400 font-bold">#{r.id}</span>
                        <span className="text-xs font-bold text-slate-900 truncate">{r.name}</span>
                        <Badge variant="neutral" size="sm">
                          {r.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{r.message}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">{r.durationMs}ms</span>
                    <Badge variant={r.passed ? 'success' : 'danger'} size="sm">
                      {r.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                    {r.details && r.details.length > 0 && (
                      <button className="text-slate-400 hover:text-slate-600">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && r.details && (
                  <div className="mt-3 p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl space-y-1 overflow-x-auto">
                    {r.details.map((d, idx) => (
                      <div key={idx}>{d}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!results && (
        <div className="py-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
          <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">Run the automated verification suite anytime</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Executes live IndexedDB transactions to test exact financial, FIFO, return, void, and stock ledger math.
          </p>
        </div>
      )}
    </div>
  );
};
