export type Department = 'Engineering' | 'Traction Distribution' | 'Signal & Telecom';
export type DefectClass = 'A' | 'B' | 'C' | 'D';
export type TaskStatus = 'Unscheduled' | 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue';

export interface MaintenanceTask {
  task_id: string;
  department: Department;
  asset_id: string;
  asset_type: string;
  corridor_id: string;
  defect_type: string;
  defect_class: DefectClass;
  reported_date: string;
  due_date: string;
  days_overdue: number;
  estimated_duration_min: number;
  failure_history: number;
  traffic_density: 'Low' | 'Medium' | 'High' | 'Very High';
  department_priority: 'Low' | 'Medium' | 'High' | 'Critical';
  criticality_score: number;
  status: TaskStatus;
  description: string;
  assigned_block?: string;
  scoring_factors?: ScoringFactors;
}

export interface ScoringFactors {
  defect_severity: number;
  overdue_impact: number;
  failure_history_impact: number;
  traffic_density_impact: number;
  department_priority_impact: number;
}

export const mockTasks: MaintenanceTask[] = [
  {
    task_id: 'ENG-102',
    department: 'Engineering',
    asset_id: 'TRK-C05-KM42',
    asset_type: 'Track',
    corridor_id: 'C05',
    defect_type: 'Rail fracture — gauge face crack',
    defect_class: 'A',
    reported_date: '2026-08-22',
    due_date: '2026-08-28',
    days_overdue: 6,
    estimated_duration_min: 30,
    failure_history: 3,
    traffic_density: 'High',
    department_priority: 'Critical',
    criticality_score: 96,
    status: 'Unscheduled',
    description: 'Gauge face crack detected at KM 42.3 on Corridor C05. Multiple previous failures at this location. Requires immediate rail replacement.',
    scoring_factors: {
      defect_severity: 0.35,
      overdue_impact: 0.25,
      failure_history_impact: 0.20,
      traffic_density_impact: 0.12,
      department_priority_impact: 0.08
    }
  },
  {
    task_id: 'TRC-044',
    department: 'Traction Distribution',
    asset_id: 'OHE-C05-SEC12',
    asset_type: 'OHE',
    corridor_id: 'C05',
    defect_type: 'Contact wire wear beyond limit',
    defect_class: 'A',
    reported_date: '2026-08-21',
    due_date: '2026-08-27',
    days_overdue: 5,
    estimated_duration_min: 25,
    failure_history: 2,
    traffic_density: 'High',
    department_priority: 'Critical',
    criticality_score: 91,
    status: 'Unscheduled',
    description: 'Contact wire thickness below minimum permissible limit at Section 12. Risk of dewirement if not replaced. OHE disconnection required.',
    scoring_factors: {
      defect_severity: 0.33,
      overdue_impact: 0.22,
      failure_history_impact: 0.18,
      traffic_density_impact: 0.15,
      department_priority_impact: 0.12
    }
  },
  {
    task_id: 'SIG-078',
    department: 'Signal & Telecom',
    asset_id: 'SIG-C05-STN8',
    asset_type: 'Signal',
    corridor_id: 'C05',
    defect_type: 'Signal lamp unit degradation',
    defect_class: 'B',
    reported_date: '2026-08-23',
    due_date: '2026-08-29',
    days_overdue: 3,
    estimated_duration_min: 25,
    failure_history: 1,
    traffic_density: 'High',
    department_priority: 'High',
    criticality_score: 87,
    status: 'Unscheduled',
    description: 'Signal lamp unit showing reduced intensity at Station 8. Backup LED unit available for replacement. Block required for testing.',
    scoring_factors: {
      defect_severity: 0.30,
      overdue_impact: 0.15,
      failure_history_impact: 0.10,
      traffic_density_impact: 0.25,
      department_priority_impact: 0.20
    }
  },
  {
    task_id: 'ENG-118',
    department: 'Engineering',
    asset_id: 'BRG-C03-KM18',
    asset_type: 'Bridge',
    corridor_id: 'C03',
    defect_type: 'Bridge bearing displacement',
    defect_class: 'A',
    reported_date: '2026-08-20',
    due_date: '2026-08-26',
    days_overdue: 8,
    estimated_duration_min: 45,
    failure_history: 1,
    traffic_density: 'Medium',
    department_priority: 'Critical',
    criticality_score: 94,
    status: 'Unscheduled',
    description: 'Bearing displacement detected on Bridge 18. Speed restriction imposed. Requires block for bearing realignment and grouting.',
    scoring_factors: {
      defect_severity: 0.38,
      overdue_impact: 0.28,
      failure_history_impact: 0.10,
      traffic_density_impact: 0.12,
      department_priority_impact: 0.12
    }
  },
  {
    task_id: 'TRC-051',
    department: 'Traction Distribution',
    asset_id: 'SUB-C01-SP3',
    asset_type: 'Substation',
    corridor_id: 'C01',
    defect_type: 'Transformer oil leakage',
    defect_class: 'B',
    reported_date: '2026-08-24',
    due_date: '2026-08-30',
    days_overdue: 2,
    estimated_duration_min: 40,
    failure_history: 0,
    traffic_density: 'Very High',
    department_priority: 'High',
    criticality_score: 82,
    status: 'Unscheduled',
    description: 'Oil leakage detected from transformer bushing at Sub Power 3. Oil level declining. Requires disconnection for repair.',
    scoring_factors: {
      defect_severity: 0.28,
      overdue_impact: 0.12,
      failure_history_impact: 0.05,
      traffic_density_impact: 0.30,
      department_priority_impact: 0.25
    }
  },
  {
    task_id: 'SIG-085',
    department: 'Signal & Telecom',
    asset_id: 'TEL-C02-KM25',
    asset_type: 'Telecom Cable',
    corridor_id: 'C02',
    defect_type: 'Optical fibre cable damage',
    defect_class: 'B',
    reported_date: '2026-08-25',
    due_date: '2026-08-31',
    days_overdue: 1,
    estimated_duration_min: 35,
    failure_history: 2,
    traffic_density: 'Medium',
    department_priority: 'High',
    criticality_score: 78,
    status: 'Unscheduled',
    description: 'OFC damage at KM 25 affecting quad cable communication. Partial redundancy available. Splicing work required.',
    scoring_factors: {
      defect_severity: 0.25,
      overdue_impact: 0.10,
      failure_history_impact: 0.18,
      traffic_density_impact: 0.22,
      department_priority_impact: 0.25
    }
  },
  {
    task_id: 'ENG-125',
    department: 'Engineering',
    asset_id: 'TRK-C01-KM15',
    asset_type: 'Track',
    corridor_id: 'C01',
    defect_type: 'Weld defect — rail joint',
    defect_class: 'B',
    reported_date: '2026-08-24',
    due_date: '2026-08-30',
    days_overdue: 2,
    estimated_duration_min: 25,
    failure_history: 1,
    traffic_density: 'Very High',
    department_priority: 'High',
    criticality_score: 76,
    status: 'Unscheduled',
    description: 'Defective AT weld at rail joint KM 15.7. Speed restriction 30 km/h imposed. Requires re-welding.',
    scoring_factors: {
      defect_severity: 0.22,
      overdue_impact: 0.12,
      failure_history_impact: 0.08,
      traffic_density_impact: 0.30,
      department_priority_impact: 0.28
    }
  },
  {
    task_id: 'TRC-058',
    department: 'Traction Distribution',
    asset_id: 'OHE-C04-SEC5',
    asset_type: 'OHE',
    corridor_id: 'C04',
    defect_type: 'Cantilever arm cracked',
    defect_class: 'B',
    reported_date: '2026-08-26',
    due_date: '2026-09-01',
    days_overdue: 0,
    estimated_duration_min: 30,
    failure_history: 0,
    traffic_density: 'Low',
    department_priority: 'Medium',
    criticality_score: 62,
    status: 'Unscheduled',
    description: 'Cantilever arm crack observed at Section 5. Currently stable but needs replacement before monsoon deterioration.',
    scoring_factors: {
      defect_severity: 0.20,
      overdue_impact: 0.05,
      failure_history_impact: 0.05,
      traffic_density_impact: 0.15,
      department_priority_impact: 0.17
    }
  },
  {
    task_id: 'SIG-091',
    department: 'Signal & Telecom',
    asset_id: 'LC-C01-KM8',
    asset_type: 'Level Crossing',
    corridor_id: 'C01',
    defect_type: 'LC gate motor malfunction',
    defect_class: 'A',
    reported_date: '2026-08-23',
    due_date: '2026-08-27',
    days_overdue: 5,
    estimated_duration_min: 20,
    failure_history: 4,
    traffic_density: 'Very High',
    department_priority: 'Critical',
    criticality_score: 93,
    status: 'Unscheduled',
    description: 'LC gate motor at KM 8 not operating. Gate being operated manually. High traffic level crossing. Immediate repair required.',
    scoring_factors: {
      defect_severity: 0.32,
      overdue_impact: 0.22,
      failure_history_impact: 0.22,
      traffic_density_impact: 0.14,
      department_priority_impact: 0.10
    }
  },
  {
    task_id: 'ENG-131',
    department: 'Engineering',
    asset_id: 'TRK-C02-KM38',
    asset_type: 'Track',
    corridor_id: 'C02',
    defect_type: 'Ballast deficiency — mud pumping',
    defect_class: 'C',
    reported_date: '2026-08-25',
    due_date: '2026-09-05',
    days_overdue: 0,
    estimated_duration_min: 50,
    failure_history: 0,
    traffic_density: 'Medium',
    department_priority: 'Medium',
    criticality_score: 45,
    status: 'Unscheduled',
    description: 'Mud pumping observed at multiple locations near KM 38. Ballast renewal and deep screening required.',
    scoring_factors: {
      defect_severity: 0.15,
      overdue_impact: 0.02,
      failure_history_impact: 0.03,
      traffic_density_impact: 0.12,
      department_priority_impact: 0.13
    }
  },
  {
    task_id: 'TRC-063',
    department: 'Traction Distribution',
    asset_id: 'OHE-C02-SEC8',
    asset_type: 'OHE',
    corridor_id: 'C02',
    defect_type: 'Dropper wire replacement',
    defect_class: 'C',
    reported_date: '2026-08-26',
    due_date: '2026-09-05',
    days_overdue: 0,
    estimated_duration_min: 20,
    failure_history: 1,
    traffic_density: 'Medium',
    department_priority: 'Medium',
    criticality_score: 48,
    status: 'Unscheduled',
    description: 'Multiple dropper wires snapped at Section 8. Contact wire sag observed. Requires OHE disconnection for repair.',
    scoring_factors: {
      defect_severity: 0.16,
      overdue_impact: 0.03,
      failure_history_impact: 0.08,
      traffic_density_impact: 0.10,
      department_priority_impact: 0.11
    }
  },
  {
    task_id: 'SIG-095',
    department: 'Signal & Telecom',
    asset_id: 'AXC-C04-KM22',
    asset_type: 'Axle Counter',
    corridor_id: 'C04',
    defect_type: 'Axle counter intermittent reset',
    defect_class: 'B',
    reported_date: '2026-08-24',
    due_date: '2026-08-30',
    days_overdue: 2,
    estimated_duration_min: 30,
    failure_history: 3,
    traffic_density: 'Low',
    department_priority: 'High',
    criticality_score: 72,
    status: 'Unscheduled',
    description: 'Axle counter at KM 22 showing intermittent resets. Causing delays due to manual counting. Repeated failure pattern.',
    scoring_factors: {
      defect_severity: 0.22,
      overdue_impact: 0.10,
      failure_history_impact: 0.20,
      traffic_density_impact: 0.08,
      department_priority_impact: 0.12
    }
  },
  {
    task_id: 'ENG-137',
    department: 'Engineering',
    asset_id: 'TUN-C03-KM30',
    asset_type: 'Tunnel',
    corridor_id: 'C03',
    defect_type: 'Tunnel lining seepage',
    defect_class: 'C',
    reported_date: '2026-08-26',
    due_date: '2026-09-08',
    days_overdue: 0,
    estimated_duration_min: 60,
    failure_history: 0,
    traffic_density: 'Medium',
    department_priority: 'Medium',
    criticality_score: 42,
    status: 'Unscheduled',
    description: 'Water seepage from tunnel crown near KM 30. Requires injection grouting. Scheduled during low traffic.',
    scoring_factors: {
      defect_severity: 0.14,
      overdue_impact: 0.02,
      failure_history_impact: 0.02,
      traffic_density_impact: 0.12,
      department_priority_impact: 0.12
    }
  },
  {
    task_id: 'ENG-140',
    department: 'Engineering',
    asset_id: 'TRK-C04-KM10',
    asset_type: 'Track',
    corridor_id: 'C04',
    defect_type: 'Sleeper replacement — cracked PSC',
    defect_class: 'C',
    reported_date: '2026-08-27',
    due_date: '2026-09-06',
    days_overdue: 0,
    estimated_duration_min: 35,
    failure_history: 0,
    traffic_density: 'Low',
    department_priority: 'Low',
    criticality_score: 35,
    status: 'Unscheduled',
    description: 'Multiple cracked PSC sleepers at KM 10. No immediate safety risk. Batch replacement planned.',
    scoring_factors: {
      defect_severity: 0.10,
      overdue_impact: 0.02,
      failure_history_impact: 0.02,
      traffic_density_impact: 0.08,
      department_priority_impact: 0.13
    }
  },
  {
    task_id: 'TRC-070',
    department: 'Traction Distribution',
    asset_id: 'OHE-C03-SEC3',
    asset_type: 'OHE',
    corridor_id: 'C03',
    defect_type: 'Insulator flashover marks',
    defect_class: 'B',
    reported_date: '2026-08-25',
    due_date: '2026-08-31',
    days_overdue: 1,
    estimated_duration_min: 25,
    failure_history: 2,
    traffic_density: 'Medium',
    department_priority: 'High',
    criticality_score: 74,
    status: 'Unscheduled',
    description: 'Flashover marks observed on section insulator at Section 3. Risk of insulation failure during monsoon.',
    scoring_factors: {
      defect_severity: 0.24,
      overdue_impact: 0.08,
      failure_history_impact: 0.16,
      traffic_density_impact: 0.14,
      department_priority_impact: 0.12
    }
  },
  {
    task_id: 'SIG-100',
    department: 'Signal & Telecom',
    asset_id: 'PTM-C01-STN3',
    asset_type: 'Point Machine',
    corridor_id: 'C01',
    defect_type: 'Point machine sluggish operation',
    defect_class: 'B',
    reported_date: '2026-08-25',
    due_date: '2026-08-31',
    days_overdue: 1,
    estimated_duration_min: 25,
    failure_history: 2,
    traffic_density: 'Very High',
    department_priority: 'High',
    criticality_score: 80,
    status: 'Unscheduled',
    description: 'Point machine at Station 3 showing sluggish operation. Extended throw time. Requires servicing and adjustment.',
    scoring_factors: {
      defect_severity: 0.25,
      overdue_impact: 0.08,
      failure_history_impact: 0.15,
      traffic_density_impact: 0.18,
      department_priority_impact: 0.14
    }
  },
  // Demo scenario 2 tasks (all fit in one block)
  {
    task_id: 'ENG-145',
    department: 'Engineering',
    asset_id: 'TRK-C06-KM5',
    asset_type: 'Track',
    corridor_id: 'C06',
    defect_type: 'Rail joint gap excessive',
    defect_class: 'B',
    reported_date: '2026-08-26',
    due_date: '2026-08-31',
    days_overdue: 1,
    estimated_duration_min: 25,
    failure_history: 1,
    traffic_density: 'Medium',
    department_priority: 'High',
    criticality_score: 73,
    status: 'Unscheduled',
    description: 'Rail joint gap exceeding permissible limit at KM 5. Requires gap adjustment and fishplate tightening.',
    scoring_factors: {
      defect_severity: 0.22,
      overdue_impact: 0.08,
      failure_history_impact: 0.10,
      traffic_density_impact: 0.18,
      department_priority_impact: 0.15
    }
  },
  {
    task_id: 'TRC-075',
    department: 'Traction Distribution',
    asset_id: 'OHE-C06-SEC2',
    asset_type: 'OHE',
    corridor_id: 'C06',
    defect_type: 'Steady arm bracket loose',
    defect_class: 'C',
    reported_date: '2026-08-27',
    due_date: '2026-09-03',
    days_overdue: 0,
    estimated_duration_min: 15,
    failure_history: 0,
    traffic_density: 'Medium',
    department_priority: 'Medium',
    criticality_score: 55,
    status: 'Unscheduled',
    description: 'Steady arm bracket found loose at Section 2. Tightening required. Quick fix during OHE disconnection.',
    scoring_factors: {
      defect_severity: 0.15,
      overdue_impact: 0.03,
      failure_history_impact: 0.03,
      traffic_density_impact: 0.17,
      department_priority_impact: 0.17
    }
  },
  {
    task_id: 'SIG-105',
    department: 'Signal & Telecom',
    asset_id: 'SIG-C06-STN2',
    asset_type: 'Signal',
    corridor_id: 'C06',
    defect_type: 'Signal aspect alignment',
    defect_class: 'C',
    reported_date: '2026-08-27',
    due_date: '2026-09-04',
    days_overdue: 0,
    estimated_duration_min: 15,
    failure_history: 0,
    traffic_density: 'Medium',
    department_priority: 'Medium',
    criticality_score: 50,
    status: 'Unscheduled',
    description: 'Signal aspect alignment adjustment needed at Station 2. Routine maintenance during next available block.',
    scoring_factors: {
      defect_severity: 0.14,
      overdue_impact: 0.02,
      failure_history_impact: 0.02,
      traffic_density_impact: 0.16,
      department_priority_impact: 0.16
    }
  },
  {
    task_id: 'ENG-148',
    department: 'Engineering',
    asset_id: 'TRK-C01-KM22',
    asset_type: 'Track',
    corridor_id: 'C01',
    defect_type: 'Rail surface defect — shelling',
    defect_class: 'B',
    reported_date: '2026-08-26',
    due_date: '2026-09-01',
    days_overdue: 0,
    estimated_duration_min: 30,
    failure_history: 1,
    traffic_density: 'Very High',
    department_priority: 'High',
    criticality_score: 71,
    status: 'Unscheduled',
    description: 'Shelling observed on rail head at KM 22. Progressive defect. Requires rail grinding or replacement.'
  },
  {
    task_id: 'TRC-080',
    department: 'Traction Distribution',
    asset_id: 'SUB-C03-SP1',
    asset_type: 'Substation',
    corridor_id: 'C03',
    defect_type: 'Circuit breaker trip coil weak',
    defect_class: 'B',
    reported_date: '2026-08-25',
    due_date: '2026-08-31',
    days_overdue: 1,
    estimated_duration_min: 35,
    failure_history: 1,
    traffic_density: 'Medium',
    department_priority: 'High',
    criticality_score: 69,
    status: 'Unscheduled',
    description: 'Trip coil of circuit breaker at Sub Power 1 showing degraded performance. Requires replacement during disconnection.'
  },
  {
    task_id: 'SIG-110',
    department: 'Signal & Telecom',
    asset_id: 'IPS-C02-STN5',
    asset_type: 'Interlocking',
    corridor_id: 'C02',
    defect_type: 'Relay room temperature high',
    defect_class: 'C',
    reported_date: '2026-08-27',
    due_date: '2026-09-05',
    days_overdue: 0,
    estimated_duration_min: 20,
    failure_history: 1,
    traffic_density: 'Medium',
    department_priority: 'Medium',
    criticality_score: 44,
    status: 'Unscheduled',
    description: 'Relay room air conditioning failure at Station 5. Temperature rising. AC unit replacement needed.'
  },
  {
    task_id: 'ENG-152',
    department: 'Engineering',
    asset_id: 'TRK-C04-KM35',
    asset_type: 'Track',
    corridor_id: 'C04',
    defect_type: 'Track geometry — alignment defect',
    defect_class: 'C',
    reported_date: '2026-08-27',
    due_date: '2026-09-06',
    days_overdue: 0,
    estimated_duration_min: 40,
    failure_history: 0,
    traffic_density: 'Low',
    department_priority: 'Low',
    criticality_score: 32,
    status: 'Unscheduled',
    description: 'Track alignment defect detected by recording car. Within warning limits. Tamping required.'
  },
  {
    task_id: 'ENG-155',
    department: 'Engineering',
    asset_id: 'TRK-C02-KM12',
    asset_type: 'Track',
    corridor_id: 'C02',
    defect_type: 'Fishplate crack',
    defect_class: 'A',
    reported_date: '2026-08-26',
    due_date: '2026-08-28',
    days_overdue: 4,
    estimated_duration_min: 20,
    failure_history: 2,
    traffic_density: 'Medium',
    department_priority: 'Critical',
    criticality_score: 92,
    status: 'Unscheduled',
    description: 'Cracked fishplate detected at KM 12 rail joint. Emergency replacement needed. Speed restriction imposed.',
    scoring_factors: {
      defect_severity: 0.34,
      overdue_impact: 0.20,
      failure_history_impact: 0.16,
      traffic_density_impact: 0.14,
      department_priority_impact: 0.08
    }
  }
];

export const getCriticalityLevel = (score: number): { label: string; color: string; bg: string } => {
  if (score >= 90) return { label: 'Critical', color: '#dc2626', bg: '#fef2f2' };
  if (score >= 70) return { label: 'High', color: '#ea580c', bg: '#fff7ed' };
  if (score >= 40) return { label: 'Medium', color: '#d97706', bg: '#fffbeb' };
  return { label: 'Low', color: '#16a34a', bg: '#f0fdf4' };
};

export const getDepartmentColor = (dept: Department): string => {
  switch (dept) {
    case 'Engineering': return '#2563eb';
    case 'Traction Distribution': return '#7c3aed';
    case 'Signal & Telecom': return '#0891b2';
  }
};

export const getDepartmentShort = (dept: Department): string => {
  switch (dept) {
    case 'Engineering': return 'ENG';
    case 'Traction Distribution': return 'TRC';
    case 'Signal & Telecom': return 'S&T';
  }
};
