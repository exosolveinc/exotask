"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Check,
  XCircle,
  Loader,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIProposal } from "@/lib/supabase/types";

interface ProposalsPanelProps {
  open: boolean;
  onClose: () => void;
  onProposalActioned: () => void;
}

const actionIcons: Record<string, React.ElementType> = {
  reassign: ArrowRightLeft,
  extend_deadline: Clock,
  escalate_priority: AlertTriangle,
  decompose: Sparkles,
  rebalance: ArrowRightLeft,
};

const actionLabels: Record<string, string> = {
  reassign: "Reassign Task",
  extend_deadline: "Extend Deadline",
  escalate_priority: "Escalate Priority",
  decompose: "Decompose Task",
  rebalance: "Rebalance Workload",
};

export function ProposalsPanel({ open, onClose, onProposalActioned }: ProposalsPanelProps) {
  const [proposals, setProposals] = useState<AIProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/proposals?status=pending&limit=20");
      const data = await res.json();
      if (res.ok) setProposals(data.proposals || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchProposals();
  }, [open, fetchProposals]);

  async function handleAction(proposalId: string, action: "approve" | "reject") {
    setActing(proposalId);
    try {
      await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId, action }),
      });
      setProposals((prev) => prev.filter((p) => p.id !== proposalId));
      onProposalActioned();
    } catch {
      // silent
    } finally {
      setActing(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[60vh] overflow-hidden bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <h3 className="text-sm font-medium text-zinc-100">AI Proposals</h3>
            {proposals.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 border border-purple-500/30 rounded-full text-purple-300">
                {proposals.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
              <Loader size={14} className="animate-spin mr-2" /> Loading proposals...
            </div>
          )}

          {!loading && proposals.length === 0 && (
            <div className="text-center py-8 text-sm text-zinc-600">
              No pending proposals. AI agents will suggest actions when they detect issues.
            </div>
          )}

          {proposals.map((proposal) => {
            const Icon = actionIcons[proposal.action_type] || Sparkles;
            const label = actionLabels[proposal.action_type] || proposal.action_type;
            const isActing = acting === proposal.id;

            return (
              <div
                key={proposal.id}
                className="bg-zinc-800/50 border border-zinc-700/40 rounded-lg p-4 space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <Icon size={14} className="text-purple-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-300">{label}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      by {proposal.agent_id} · {new Date(proposal.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-zinc-400 leading-relaxed">
                  {proposal.reasoning}
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleAction(proposal.id, "approve")}
                    disabled={isActing}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
                      "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
                      isActing && "opacity-50"
                    )}
                  >
                    {isActing ? <Loader size={10} className="animate-spin" /> : <Check size={12} />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(proposal.id, "reject")}
                    disabled={isActing}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
                      "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600",
                      isActing && "opacity-50"
                    )}
                  >
                    <XCircle size={12} />
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
