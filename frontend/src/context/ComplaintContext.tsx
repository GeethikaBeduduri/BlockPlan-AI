import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  type Complaint,
  type TechnicalAssessment,
  type LinkedMaintenanceTask,
  type AuditEvent,
  type DefectCategory,
  type ComplaintPriority,
  type DepartmentType,
  initialComplaints,
  initialTechnicalAssessments,
  initialMaintenanceTasks,
  initialAuditLogs,
  getDepartmentForCategory,
} from '../data/mockComplaints';
import { useAuth } from './AuthContext';
import { useAppContext } from './AppContext';

interface CreateComplaintInput {
  station: string;
  location: string;
  category: DefectCategory;
  problemType: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  evidence?: string;
  remarks?: string;
}

interface TechnicalAssessmentInput {
  technicalDefectType: string;
  assetId: string;
  confirmedSeverity: 'Class A' | 'Class B' | 'Class C';
  estimatedDurationMin: number;
  requiredTeam: string;
  requiredEquipment: string;
  maintenanceRequired: boolean;
  remarks: string;
}

interface ComplaintContextType {
  complaints: Complaint[];
  technicalAssessments: Record<string, TechnicalAssessment>;
  maintenanceTasks: Record<string, LinkedMaintenanceTask>;
  auditLogs: AuditEvent[];
  createComplaint: (input: CreateComplaintInput) => Complaint;
  acceptComplaint: (complaintId: string, assessmentInput: TechnicalAssessmentInput) => void;
  rejectComplaint: (complaintId: string, reason: string) => void;
  requestClarification: (complaintId: string, text: string) => void;
  respondClarification: (complaintId: string, responseText: string, updatedRemarks?: string) => void;
  updateTaskStatus: (taskId: string, status: 'IN_PROGRESS' | 'RESOLVED', resolutionNotes?: string) => void;
  verifyComplaint: (complaintId: string) => void;
  reopenComplaint: (complaintId: string, reason: string) => void;
  getComplaintById: (complaintId: string) => Complaint | undefined;
}

const ComplaintContext = createContext<ComplaintContextType | null>(null);

export const useComplaints = () => {
  const ctx = useContext(ComplaintContext);
  if (!ctx) throw new Error('useComplaints must be used within ComplaintProvider');
  return ctx;
};

const STORAGE_KEY_CMP = 'blockplan_complaints_v1';
const STORAGE_KEY_TA = 'blockplan_assessments_v1';
const STORAGE_KEY_MT = 'blockplan_tasks_v1';
const STORAGE_KEY_AUD = 'blockplan_audit_v1';

export const ComplaintProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { addToast } = useAppContext();

  const [complaints, setComplaints] = useState<Complaint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CMP);
      return saved ? JSON.parse(saved) : initialComplaints;
    } catch {
      return initialComplaints;
    }
  });

  const [technicalAssessments, setTechnicalAssessments] = useState<Record<string, TechnicalAssessment>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TA);
      return saved ? JSON.parse(saved) : initialTechnicalAssessments;
    } catch {
      return initialTechnicalAssessments;
    }
  });

  const [maintenanceTasks, setMaintenanceTasks] = useState<Record<string, LinkedMaintenanceTask>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MT);
      return saved ? JSON.parse(saved) : initialMaintenanceTasks;
    } catch {
      return initialMaintenanceTasks;
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUD);
      return saved ? JSON.parse(saved) : initialAuditLogs;
    } catch {
      return initialAuditLogs;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CMP, JSON.stringify(complaints));
  }, [complaints]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TA, JSON.stringify(technicalAssessments));
  }, [technicalAssessments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MT, JSON.stringify(maintenanceTasks));
  }, [maintenanceTasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AUD, JSON.stringify(auditLogs));
  }, [auditLogs]);

  const addAudit = useCallback((action: string, entityId: string, description: string) => {
    const newEntry: AuditEvent = {
      id: `AUD-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      user: user?.username || 'system',
      role: user?.role || 'SYSTEM',
      action,
      entityId,
      description,
    };
    setAuditLogs(prev => [newEntry, ...prev]);
  }, [user]);

  const getComplaintById = (complaintId: string) => {
    return complaints.find(c => c.id === complaintId);
  };

  const createComplaint = (input: CreateComplaintInput): Complaint => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const complaintId = `CMP-2026-${randomNum}`;
    const concernedDept = getDepartmentForCategory(input.category);

    const newComplaint: Complaint = {
      id: complaintId,
      station: input.station,
      location: input.location,
      category: input.category,
      problemType: input.problemType,
      title: input.title,
      description: input.description,
      priority: input.priority,
      evidence: input.evidence,
      remarks: input.remarks,
      submittedBy: user?.name ? `${user.name} (${user.username})` : 'Station Master Guntur (SM-GNT)',
      submittedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      concernedDepartment: concernedDept,
      status: 'PENDING DEPARTMENT ACCEPTANCE',
    };

    setComplaints(prev => [newComplaint, ...prev]);
    addAudit('COMPLAINT_SUBMITTED', complaintId, `Station Master submitted ${input.title} at ${input.station}. Routed to ${concernedDept}.`);
    addToast(`Complaint ${complaintId} submitted successfully. Routed to ${concernedDept}.`, 'success');
    return newComplaint;
  };

  const acceptComplaint = (complaintId: string, assessmentInput: TechnicalAssessmentInput) => {
    const targetCmp = complaints.find(c => c.id === complaintId);
    if (!targetCmp) return;

    const deptPrefixMap: Record<DepartmentType, string> = {
      Engineering: 'ENG',
      Traction: 'TRC',
      'Signal & Telecom': 'SIG',
      Electrical: 'ELE',
    };

    const prefix = deptPrefixMap[targetCmp.concernedDepartment] || 'ENG';
    const taskId = `${prefix}-${Math.floor(100 + Math.random() * 900)}`;

    const assessment: TechnicalAssessment = {
      complaintId,
      technicalDefectType: assessmentInput.technicalDefectType,
      assetId: assessmentInput.assetId,
      confirmedSeverity: assessmentInput.confirmedSeverity,
      estimatedDurationMin: assessmentInput.estimatedDurationMin,
      requiredTeam: assessmentInput.requiredTeam,
      requiredEquipment: assessmentInput.requiredEquipment,
      maintenanceRequired: assessmentInput.maintenanceRequired,
      remarks: assessmentInput.remarks,
      assessedBy: user?.name || `Department Officer (${targetCmp.concernedDepartment})`,
      assessedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    const criticalityScore = assessmentInput.confirmedSeverity === 'Class A' ? 96 : assessmentInput.confirmedSeverity === 'Class B' ? 84 : 68;

    const task: LinkedMaintenanceTask = {
      taskId,
      complaintId,
      department: targetCmp.concernedDepartment,
      assetId: assessmentInput.assetId,
      corridor: 'C05',
      severity: assessmentInput.confirmedSeverity,
      duration: assessmentInput.estimatedDurationMin,
      criticalityScore,
      priority: assessmentInput.confirmedSeverity === 'Class A' ? 'CRITICAL' : 'HIGH',
      status: 'ASSIGNED',
      assignedBlock: {
        blockId: 'BLK-C05-001',
        corridorId: 'C05',
        startTime: '10:00',
        endTime: '11:00',
        isShared: true,
        sharedTasks: [taskId, 'SIG-078'],
        capacityUtilizedPct: 91.7,
      },
    };

    setTechnicalAssessments(prev => ({ ...prev, [complaintId]: assessment }));
    setMaintenanceTasks(prev => ({ ...prev, [complaintId]: task }));

    setComplaints(prev =>
      prev.map(c => (c.id === complaintId ? { ...c, status: 'ACCEPTED' as const } : c))
    );

    addAudit('COMPLAINT_ACCEPTED', complaintId, `${targetCmp.concernedDepartment} department accepted ${complaintId}. Created Maintenance Task ${taskId}.`);
    addAudit('AI_CRITICALITY_CALCULATED', taskId, `XGBoost model calculated Criticality Score: ${criticalityScore}/100 (${assessmentInput.confirmedSeverity}).`);
    addAudit('OPTIMIZER_BLOCK_ASSIGNED', taskId, `CP-SAT Optimizer assigned ${taskId} to Block BLK-C05-001 (Corridor C05 10:00–11:00).`);

    addToast(`Complaint ${complaintId} accepted. Maintenance task ${taskId} created!`, 'success');
  };

  const rejectComplaint = (complaintId: string, reason: string) => {
    setComplaints(prev =>
      prev.map(c => (c.id === complaintId ? { ...c, status: 'REJECTED' as const, rejectionReason: reason } : c))
    );
    addAudit('COMPLAINT_REJECTED', complaintId, `Department rejected complaint ${complaintId}. Reason: ${reason}`);
    addToast(`Complaint ${complaintId} rejected.`, 'warning');
  };

  const requestClarification = (complaintId: string, text: string) => {
    setComplaints(prev =>
      prev.map(c =>
        c.id === complaintId ? { ...c, status: 'CLARIFICATION REQUIRED' as const, clarificationRequest: text } : c
      )
    );
    addAudit('CLARIFICATION_REQUESTED', complaintId, `Department requested clarification for ${complaintId}: "${text}"`);
    addToast(`Clarification request sent to Station Master for ${complaintId}`, 'info');
  };

  const respondClarification = (complaintId: string, responseText: string, updatedRemarks?: string) => {
    setComplaints(prev =>
      prev.map(c =>
        c.id === complaintId
          ? {
              ...c,
              status: 'PENDING DEPARTMENT ACCEPTANCE' as const,
              clarificationResponse: responseText,
              remarks: updatedRemarks ? `${c.remarks || ''}\nUpdate: ${updatedRemarks}` : c.remarks,
            }
          : c
      )
    );
    addAudit('CLARIFICATION_PROVIDED', complaintId, `Station Master updated complaint ${complaintId} with details: "${responseText}". Re-submitted for department review.`);
    addToast(`Clarification details submitted for ${complaintId}`, 'success');
  };

  const updateTaskStatus = (taskId: string, status: 'IN_PROGRESS' | 'RESOLVED', resolutionNotes?: string) => {
    const taskEntry = Object.values(maintenanceTasks).find(t => t.taskId === taskId);
    if (!taskEntry) return;

    const newStatus = status === 'RESOLVED' ? 'STATION MASTER VERIFICATION' : 'WORK IN PROGRESS';

    setMaintenanceTasks(prev => ({
      ...prev,
      [taskEntry.complaintId]: {
        ...prev[taskEntry.complaintId],
        status: status === 'RESOLVED' ? 'RESOLVED' : 'IN_PROGRESS',
        resolutionNotes: resolutionNotes || prev[taskEntry.complaintId]?.resolutionNotes,
        resolvedAt: status === 'RESOLVED' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : undefined,
      },
    }));

    setComplaints(prev =>
      prev.map(c => (c.id === taskEntry.complaintId ? { ...c, status: newStatus } : c))
    );

    if (status === 'RESOLVED') {
      addAudit('MAINTENANCE_RESOLVED', taskEntry.complaintId, `Department completed maintenance task ${taskId}. Sent for Station Master verification.`);
      addToast(`Task ${taskId} marked as RESOLVED. Station Master notified for verification.`, 'success');
    } else {
      addAudit('MAINTENANCE_IN_PROGRESS', taskEntry.complaintId, `Maintenance team commenced work on task ${taskId}.`);
      addToast(`Task ${taskId} marked as IN PROGRESS.`, 'info');
    }
  };

  const verifyComplaint = (complaintId: string) => {
    setComplaints(prev =>
      prev.map(c => (c.id === complaintId ? { ...c, status: 'CLOSED' as const } : c))
    );
    const task = maintenanceTasks[complaintId];
    if (task) {
      setMaintenanceTasks(prev => ({
        ...prev,
        [complaintId]: { ...prev[complaintId], status: 'VERIFIED' },
      }));
    }
    addAudit('STATION_MASTER_VERIFIED', complaintId, `Station Master verified completed work for ${complaintId} and CLOSED complaint.`);
    addToast(`Complaint ${complaintId} verified and CLOSED!`, 'success');
  };

  const reopenComplaint = (complaintId: string, reason: string) => {
    setComplaints(prev =>
      prev.map(c => (c.id === complaintId ? { ...c, status: 'REOPENED' as const, remarks: `REOPENED REASON: ${reason}\n${c.remarks || ''}` } : c))
    );
    addAudit('COMPLAINT_REOPENED', complaintId, `Station Master reopened complaint ${complaintId}. Reason: ${reason}`);
    addToast(`Complaint ${complaintId} REOPENED for further inspection.`, 'warning');
  };

  return (
    <ComplaintContext.Provider
      value={{
        complaints,
        technicalAssessments,
        maintenanceTasks,
        auditLogs,
        createComplaint,
        acceptComplaint,
        rejectComplaint,
        requestClarification,
        respondClarification,
        updateTaskStatus,
        verifyComplaint,
        reopenComplaint,
        getComplaintById,
      }}
    >
      {children}
    </ComplaintContext.Provider>
  );
};
