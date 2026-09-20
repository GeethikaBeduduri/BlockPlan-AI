import { getDepartmentShort } from '../adapters/formatters';
import type { Department as ApiDepartment } from '../api/types';
import type { Department as MockDepartment } from '../data/mockTasks';

interface DepartmentBadgeProps {
  department: ApiDepartment | MockDepartment | string;
}

export default function DepartmentBadge({ department }: DepartmentBadgeProps) {
  let short = department;
  let variant = 'eng';

  if (department === 'Engineering') {
    short = 'ENG';
    variant = 'eng';
  } else if (department === 'Traction' || department === 'Traction Distribution') {
    short = 'TRC';
    variant = 'trc';
  } else if (department === 'S&T' || department === 'Signal & Telecom') {
    short = 'S&T';
    variant = 'snt';
  } else {
    short = getDepartmentShort(department as ApiDepartment);
  }

  return (
    <span className={`badge badge--${variant}`}>
      {short}
    </span>
  );
}
