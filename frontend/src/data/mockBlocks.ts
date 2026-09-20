export interface Block {
  block_id: string;
  corridor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  availability_status: 'Available' | 'Occupied' | 'Maintenance' | 'Restricted';
  train_conflict: boolean;
  allowed_departments: string[];
  assigned_tasks?: string[];
}

export interface Corridor {
  corridor_id: string;
  name: string;
  section: string;
  length_km: number;
  traffic_density: 'Low' | 'Medium' | 'High' | 'Very High';
  status: 'Available' | 'Maintenance' | 'Restricted' | 'Critical';
}

export interface Train {
  train_id: string;
  train_number: string;
  corridor_id: string;
  train_type: 'Rajdhani' | 'Shatabdi' | 'Mail/Express' | 'Passenger' | 'Freight';
  arrival_time: string;
  departure_time: string;
}

export const mockCorridors: Corridor[] = [
  { corridor_id: 'C01', name: 'Delhi — Agra', section: 'NR Main Line', length_km: 195, traffic_density: 'Very High', status: 'Available' },
  { corridor_id: 'C02', name: 'Delhi — Jaipur', section: 'NWR Main Line', length_km: 310, traffic_density: 'Medium', status: 'Available' },
  { corridor_id: 'C03', name: 'Delhi — Ambala', section: 'NR Up Line', length_km: 200, traffic_density: 'Medium', status: 'Restricted' },
  { corridor_id: 'C04', name: 'Agra — Gwalior', section: 'NCR Section', length_km: 118, traffic_density: 'Low', status: 'Available' },
  { corridor_id: 'C05', name: 'Delhi — Kanpur', section: 'NCR Main Line', length_km: 440, traffic_density: 'High', status: 'Available' },
  { corridor_id: 'C06', name: 'Jaipur — Ajmer', section: 'NWR Branch', length_km: 135, traffic_density: 'Medium', status: 'Available' },
];

export const mockBlocks: Block[] = [
  // C01 blocks
  { block_id: 'BLK-C01-001', corridor_id: 'C01', date: '2026-08-28', start_time: '10:00', end_time: '11:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C01-002', corridor_id: 'C01', date: '2026-08-28', start_time: '14:00', end_time: '14:30', duration_min: 30, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Signal & Telecom'] },
  { block_id: 'BLK-C01-003', corridor_id: 'C01', date: '2026-08-29', start_time: '10:00', end_time: '11:30', duration_min: 90, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C01-004', corridor_id: 'C01', date: '2026-08-29', start_time: '14:00', end_time: '15:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution'] },

  // C02 blocks
  { block_id: 'BLK-C02-001', corridor_id: 'C02', date: '2026-08-28', start_time: '09:30', end_time: '10:00', duration_min: 30, availability_status: 'Available', train_conflict: false, allowed_departments: ['Signal & Telecom'] },
  { block_id: 'BLK-C02-002', corridor_id: 'C02', date: '2026-08-28', start_time: '12:00', end_time: '13:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C02-003', corridor_id: 'C02', date: '2026-08-29', start_time: '09:00', end_time: '10:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C02-004', corridor_id: 'C02', date: '2026-08-29', start_time: '13:30', end_time: '14:30', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },

  // C03 blocks
  { block_id: 'BLK-C03-001', corridor_id: 'C03', date: '2026-08-28', start_time: '11:00', end_time: '12:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C03-002', corridor_id: 'C03', date: '2026-08-29', start_time: '10:00', end_time: '11:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution'] },

  // C04 blocks
  { block_id: 'BLK-C04-001', corridor_id: 'C04', date: '2026-08-28', start_time: '09:00', end_time: '10:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C04-002', corridor_id: 'C04', date: '2026-08-28', start_time: '14:00', end_time: '15:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C04-003', corridor_id: 'C04', date: '2026-08-29', start_time: '09:00', end_time: '10:30', duration_min: 90, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },

  // C05 blocks (main demo corridor)
  { block_id: 'BLK-C05-001', corridor_id: 'C05', date: '2026-08-28', start_time: '10:00', end_time: '11:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C05-002', corridor_id: 'C05', date: '2026-08-28', start_time: '14:00', end_time: '15:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C05-003', corridor_id: 'C05', date: '2026-08-29', start_time: '10:00', end_time: '11:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution'] },

  // C06 blocks (demo scenario 2)
  { block_id: 'BLK-C06-001', corridor_id: 'C06', date: '2026-08-28', start_time: '10:00', end_time: '11:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C06-002', corridor_id: 'C06', date: '2026-08-28', start_time: '14:00', end_time: '15:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
  { block_id: 'BLK-C06-003', corridor_id: 'C06', date: '2026-08-29', start_time: '10:00', end_time: '11:00', duration_min: 60, availability_status: 'Available', train_conflict: false, allowed_departments: ['Engineering', 'Traction Distribution', 'Signal & Telecom'] },
];

export const mockTrains: Train[] = [
  { train_id: 'TRN-001', train_number: '12002', corridor_id: 'C01', train_type: 'Shatabdi', arrival_time: '09:00', departure_time: '09:15' },
  { train_id: 'TRN-002', train_number: '12952', corridor_id: 'C01', train_type: 'Rajdhani', arrival_time: '11:15', departure_time: '11:30' },
  { train_id: 'TRN-003', train_number: '12188', corridor_id: 'C01', train_type: 'Mail/Express', arrival_time: '13:00', departure_time: '13:20' },
  { train_id: 'TRN-004', train_number: '12016', corridor_id: 'C02', train_type: 'Shatabdi', arrival_time: '10:15', departure_time: '10:30' },
  { train_id: 'TRN-005', train_number: '12414', corridor_id: 'C02', train_type: 'Rajdhani', arrival_time: '11:00', departure_time: '11:15' },
  { train_id: 'TRN-006', train_number: '14036', corridor_id: 'C03', train_type: 'Mail/Express', arrival_time: '09:00', departure_time: '09:20' },
  { train_id: 'TRN-007', train_number: '12006', corridor_id: 'C03', train_type: 'Shatabdi', arrival_time: '10:15', departure_time: '10:30' },
  { train_id: 'TRN-008', train_number: '12628', corridor_id: 'C04', train_type: 'Mail/Express', arrival_time: '10:30', departure_time: '10:45' },
  { train_id: 'TRN-009', train_number: '12004', corridor_id: 'C05', train_type: 'Shatabdi', arrival_time: '08:00', departure_time: '08:15' },
  { train_id: 'TRN-010', train_number: '12302', corridor_id: 'C05', train_type: 'Rajdhani', arrival_time: '09:15', departure_time: '09:30' },
  { train_id: 'TRN-011', train_number: '12312', corridor_id: 'C05', train_type: 'Rajdhani', arrival_time: '11:30', departure_time: '11:45' },
  { train_id: 'TRN-012', train_number: '12560', corridor_id: 'C05', train_type: 'Mail/Express', arrival_time: '13:00', departure_time: '13:20' },
  { train_id: 'TRN-013', train_number: '12992', corridor_id: 'C06', train_type: 'Mail/Express', arrival_time: '09:00', departure_time: '09:15' },
  { train_id: 'TRN-014', train_number: '19708', corridor_id: 'C06', train_type: 'Passenger', arrival_time: '11:30', departure_time: '11:50' },
];

export const getStatusColor = (status: Block['availability_status']): string => {
  switch (status) {
    case 'Available': return '#16a34a';
    case 'Occupied': return '#6b7280';
    case 'Maintenance': return '#2563eb';
    case 'Restricted': return '#dc2626';
  }
};
