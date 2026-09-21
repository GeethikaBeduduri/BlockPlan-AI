import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Send,
  Building2,
  UserCheck,
  Wrench,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import type { ComplaintStatus } from '../data/mockComplaints';

interface StepDef {
  id: ComplaintStatus;
  label: string;
  icon: React.ElementType;
}

const LIFECYCLE_STEPS: StepDef[] = [
  { id: 'SUBMITTED', label: 'Submitted', icon: Send },
  { id: 'PENDING DEPARTMENT ACCEPTANCE', label: 'Pending Acceptance', icon: Clock },
  { id: 'ACCEPTED', label: 'Accepted', icon: Building2 },
  { id: 'ASSIGNED', label: 'Assigned', icon: UserCheck },
  { id: 'WORK IN PROGRESS', label: 'Work in Progress', icon: Wrench },
  { id: 'RESOLVED', label: 'Resolved', icon: FileCheck2 },
  { id: 'STATION MASTER VERIFICATION', label: 'SM Verification', icon: ShieldCheck },
  { id: 'CLOSED', label: 'Closed', icon: CheckCircle2 },
];

export interface ComplaintWorkflowTimelineProps {
  currentStatus: ComplaintStatus;
  className?: string;
}

export default function ComplaintWorkflowTimeline({
  currentStatus,
  className = '',
}: ComplaintWorkflowTimelineProps) {
  // Determine current active step index
  const activeIndex = LIFECYCLE_STEPS.findIndex((s) => s.id === currentStatus);
  const isRejected = currentStatus === 'REJECTED';
  const isClarification = currentStatus === 'CLARIFICATION REQUIRED';

  return (
    <div className={`w-full py-3 px-1 ${className}`}>
      {/* Alert banner for non-linear states */}
      {isRejected && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Complaint Rejected by Department. Reassessment or clarification needed.</span>
        </div>
      )}
      {isClarification && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-amber-400 text-xs font-semibold">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>Department requested clarification. Awaiting Station Master response.</span>
        </div>
      )}

      {/* Horizontal / Wrapped Stepper */}
      <div className="relative flex items-center justify-between w-full overflow-x-auto pb-2 scrollbar-none">
        {/* Background Connecting Line */}
        <div className="absolute top-5 left-6 right-6 h-0.5 bg-gray-200 dark:bg-white/10 -z-0" />

        {/* Animated Active Progress Line */}
        {activeIndex >= 0 && (
          <motion.div
            className="absolute top-5 left-6 h-0.5 bg-gradient-to-r from-blue-600 via-amber-500 to-green-500 -z-0 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
            initial={{ width: 0 }}
            animate={{
              width: `${(activeIndex / (LIFECYCLE_STEPS.length - 1)) * 92}%`,
            }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {LIFECYCLE_STEPS.map((step, idx) => {
          const isCompleted = activeIndex > idx || currentStatus === 'CLOSED';
          const isCurrent = activeIndex === idx;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className="flex flex-col items-center flex-1 min-w-[75px] relative z-10"
            >
              {/* Node Circle */}
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.15 : 1,
                  boxShadow: isCurrent
                    ? '0 0 16px rgba(245, 158, 11, 0.6)'
                    : '0 0 0px transparent',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 border-2 ${
                  isCompleted
                    ? 'bg-green-500 border-green-400 text-white'
                    : isCurrent
                    ? 'bg-navy-900 border-amber-400 text-amber-400 ring-4 ring-amber-400/20'
                    : 'bg-gray-100 dark:bg-white/5 border-gray-300 dark:border-white/15 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Icon className={`w-4 h-4 ${isCurrent ? 'animate-pulse' : ''}`} />
                )}
              </motion.div>

              {/* Step Label */}
              <span
                className={`text-[10px] sm:text-[11px] font-bold mt-2 text-center leading-tight transition-colors ${
                  isCurrent
                    ? 'text-amber-500 dark:text-amber-400 font-extrabold'
                    : isCompleted
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-white/30'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
