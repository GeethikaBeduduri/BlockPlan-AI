export type Role = 'ADMIN' | 'DEPARTMENT' | 'STATION_MASTER';
export type DepartmentType = 'Engineering' | 'Traction' | 'Signal & Telecom' | 'Electrical';

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  role: Role;
  department?: DepartmentType;
  station?: string;
  designation: string;
}

export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ComplaintStatus =
  | 'SUBMITTED'
  | 'PENDING DEPARTMENT ACCEPTANCE'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CLARIFICATION REQUIRED'
  | 'STATION MASTER UPDATED'
  | 'ASSIGNED'
  | 'WORK IN PROGRESS'
  | 'RESOLVED'
  | 'STATION MASTER VERIFICATION'
  | 'CLOSED'
  | 'REOPENED';

export type DefectCategory =
  | 'Track Defect'
  | 'OHE Defect'
  | 'Substation Defect'
  | 'Electrical Equipment Failure'
  | 'Signal Failure'
  | 'Telecom Failure';

export interface Complaint {
  id: string;
  station: string;
  location: string;
  category: DefectCategory;
  problemType: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  evidence?: string;
  remarks?: string;
  submittedBy: string;
  submittedAt: string;
  concernedDepartment: DepartmentType;
  status: ComplaintStatus;
  rejectionReason?: string;
  clarificationRequest?: string;
  clarificationResponse?: string;
}

export interface TechnicalAssessment {
  complaintId: string;
  technicalDefectType: string;
  assetId: string;
  confirmedSeverity: 'Class A' | 'Class B' | 'Class C';
  estimatedDurationMin: number;
  requiredTeam: string;
  requiredEquipment: string;
  maintenanceRequired: boolean;
  remarks: string;
  assessedBy: string;
  assessedAt: string;
}

export interface LinkedMaintenanceTask {
  taskId: string;
  complaintId: string;
  department: DepartmentType;
  assetId: string;
  corridor: string;
  severity: 'Class A' | 'Class B' | 'Class C';
  duration: number;
  criticalityScore: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'CREATED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'VERIFIED';
  assignedBlock?: {
    blockId: string;
    corridorId: string;
    startTime: string;
    endTime: string;
    isShared: boolean;
    sharedTasks?: string[];
    capacityUtilizedPct: number;
  };
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  entityId: string;
  description: string;
}

/**
 * Deterministic rule-based department routing.
 * Rule:
 * Track Defect -> Engineering
 * OHE Defect / Substation Defect -> Traction
 * Electrical Equipment Failure -> Electrical
 * Signal Failure / Telecom Failure -> Signal & Telecom
 */
export function getDepartmentForCategory(category: DefectCategory | string): DepartmentType {
  switch (category) {
    case 'Track Defect':
      return 'Engineering';
    case 'OHE Defect':
    case 'Substation Defect':
      return 'Traction';
    case 'Electrical Equipment Failure':
      return 'Electrical';
    case 'Signal Failure':
    case 'Telecom Failure':
      return 'Signal & Telecom';
    default:
      return 'Engineering';
  }
}

export const initialComplaints: Complaint[] = [
  {
    id: 'CMP-2026-0142',
    station: 'Guntur Railway Station',
    location: 'Platform 1, Track No. 2',
    category: 'Track Defect',
    problemType: 'Rail Defect / Gauge Face Crack',
    title: 'Track Damage Observed',
    description: 'A visible defect has been observed on the railway track near Platform 1 near KM 42.3. Requires urgent inspection by Engineering wing.',
    priority: 'HIGH',
    evidence: 'track_crack_km42.jpg',
    remarks: 'Visible hair-line fissure on outer rail flange. Speed restriction recommended until block.',
    submittedBy: 'Station Master Guntur (SM-GNT)',
    submittedAt: '2026-08-28 09:12:00',
    concernedDepartment: 'Engineering',
    status: 'PENDING DEPARTMENT ACCEPTANCE',
  },
  {
    id: 'CMP-2026-0138',
    station: 'Vijayawada Junction',
    location: 'Yard Line 4',
    category: 'OHE Defect',
    problemType: 'Contact Wire Sag',
    title: 'OHE Overhead Wire Tension Drop',
    description: 'Tension drop observed on contact wire along Yard Line 4 near Mast 142/12. Sparks reported during loco movement.',
    priority: 'CRITICAL',
    evidence: 'ohe_sag_yard4.jpg',
    remarks: 'Traction pantograph snag risk identified.',
    submittedBy: 'Station Master Vijayawada (SM-BZA)',
    submittedAt: '2026-08-28 08:30:00',
    concernedDepartment: 'Traction',
    status: 'ACCEPTED',
  },
  {
    id: 'CMP-2026-0135',
    station: 'Tenali Junction',
    location: 'East Cabin Point 102A',
    category: 'Signal Failure',
    problemType: 'Point Machine Interlocking Error',
    title: 'Point Machine 102A Detection Fault',
    description: 'Point machine failing to give normal detection during route setting for train 12727 Down Express.',
    priority: 'HIGH',
    evidence: 'signal_point_102a.jpg',
    remarks: 'Manual clamping applied currently.',
    submittedBy: 'Station Master Tenali (SM-TEL)',
    submittedAt: '2026-08-28 07:45:00',
    concernedDepartment: 'Signal & Telecom',
    status: 'RESOLVED',
  },
  {
    id: 'CMP-2026-0129',
    station: 'Ongole Station',
    location: 'Substation Bay 3',
    category: 'Electrical Equipment Failure',
    problemType: 'High Voltage Breaker Tripping',
    title: 'Auxiliary Transformer Vacuum Circuit Breaker Fault',
    description: 'Breaker VCB-03 tripping intermittently on overcurrent protection relay during peak load.',
    priority: 'MEDIUM',
    submittedBy: 'Station Master Ongole (SM-OGL)',
    submittedAt: '2026-08-27 18:20:00',
    concernedDepartment: 'Electrical',
    status: 'CLARIFICATION REQUIRED',
    clarificationRequest: 'Please provide exact relay error code and ambient temperature reading at the time of trip.',
  },
];

export const initialTechnicalAssessments: Record<string, TechnicalAssessment> = {
  'CMP-2026-0138': {
    complaintId: 'CMP-2026-0138',
    technicalDefectType: 'OHE Overhead Wire Tension Defect',
    assetId: 'OHE-BZA-Y4-142',
    confirmedSeverity: 'Class A',
    estimatedDurationMin: 45,
    requiredTeam: 'Traction OHE Tower Car Team',
    requiredEquipment: 'Tower Wagon TW-04, Tensioning Gear',
    maintenanceRequired: true,
    remarks: 'Immediate tensioner adjustment and contact wire height re-alignment mandatory.',
    assessedBy: 'Sr. DEE (TRD) Vijayawada',
    assessedAt: '2026-08-28 08:42:00',
  },
  'CMP-2026-0135': {
    complaintId: 'CMP-2026-0135',
    technicalDefectType: 'Point Machine Contact Wear',
    assetId: 'SIG-TEL-PT102A',
    confirmedSeverity: 'Class B',
    estimatedDurationMin: 25,
    requiredTeam: 'S&T Signal Maintenance Gang',
    requiredEquipment: 'Point Machine Test Kit, Lubrication Kit',
    maintenanceRequired: true,
    remarks: 'Cleaned contacts, adjusted throw rod clearance, replaced worn roller.',
    assessedBy: 'Sr. DSTE Tenali',
    assessedAt: '2026-08-28 08:00:00',
  },
};

export const initialMaintenanceTasks: Record<string, LinkedMaintenanceTask> = {
  'CMP-2026-0138': {
    taskId: 'TRC-044',
    complaintId: 'CMP-2026-0138',
    department: 'Traction',
    assetId: 'OHE-BZA-Y4-142',
    corridor: 'C05',
    severity: 'Class A',
    duration: 45,
    criticalityScore: 91,
    priority: 'CRITICAL',
    status: 'IN_PROGRESS',
    assignedBlock: {
      blockId: 'BLK-C05-002',
      corridorId: 'C05',
      startTime: '14:00',
      endTime: '15:00',
      isShared: false,
      capacityUtilizedPct: 75.0,
    },
  },
  'CMP-2026-0135': {
    taskId: 'SIG-078',
    complaintId: 'CMP-2026-0135',
    department: 'Signal & Telecom',
    assetId: 'SIG-TEL-PT102A',
    corridor: 'C05',
    severity: 'Class B',
    duration: 25,
    criticalityScore: 87,
    priority: 'HIGH',
    status: 'RESOLVED',
    assignedBlock: {
      blockId: 'BLK-C05-001',
      corridorId: 'C05',
      startTime: '10:00',
      endTime: '11:00',
      isShared: true,
      sharedTasks: ['ENG-102', 'SIG-078'],
      capacityUtilizedPct: 91.7,
    },
    resolutionNotes: 'Replaced detection contacts, point machine tested in normal & reverse positions successfully.',
    resolvedAt: '2026-08-28 09:30:00',
  },
};

export const initialAuditLogs: AuditEvent[] = [
  {
    id: 'AUD-001',
    timestamp: '2026-08-28 07:45:12',
    user: 'stationmaster',
    role: 'STATION_MASTER',
    action: 'COMPLAINT_SUBMITTED',
    entityId: 'CMP-2026-0135',
    description: 'Station Master submitted Point Machine 102A Detection Fault complaint.',
  },
  {
    id: 'AUD-002',
    timestamp: '2026-08-28 08:00:05',
    user: 'department',
    role: 'DEPARTMENT',
    action: 'COMPLAINT_ACCEPTED',
    entityId: 'CMP-2026-0135',
    description: 'Signal & Telecom department accepted complaint and generated maintenance task SIG-078.',
  },
  {
    id: 'AUD-003',
    timestamp: '2026-08-28 08:30:19',
    user: 'stationmaster',
    role: 'STATION_MASTER',
    action: 'COMPLAINT_SUBMITTED',
    entityId: 'CMP-2026-0138',
    description: 'Station Master submitted OHE Overhead Wire Tension Drop complaint.',
  },
  {
    id: 'AUD-004',
    timestamp: '2026-08-28 08:42:33',
    user: 'department',
    role: 'DEPARTMENT',
    action: 'COMPLAINT_ACCEPTED',
    entityId: 'CMP-2026-0138',
    description: 'Traction department accepted complaint and generated maintenance task TRC-044.',
  },
  {
    id: 'AUD-005',
    timestamp: '2026-08-28 09:12:04',
    user: 'stationmaster',
    role: 'STATION_MASTER',
    action: 'COMPLAINT_SUBMITTED',
    entityId: 'CMP-2026-0142',
    description: 'Station Master Guntur submitted Track Damage Observed complaint near Platform 1.',
  },
  {
    id: 'AUD-006',
    timestamp: '2026-08-28 09:30:45',
    user: 'department',
    role: 'DEPARTMENT',
    action: 'MAINTENANCE_RESOLVED',
    entityId: 'CMP-2026-0135',
    description: 'Signal & Telecom department marked task SIG-078 as RESOLVED.',
  },
];
