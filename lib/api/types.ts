/**
 * TypeScript mirrors of the CPMS API schemas.
 *
 * These follow the OpenAPI document served at `/api-docs` (title:
 * "Construction Project Management System API"). Keep them in sync with the
 * spec — every list endpoint returns a `{ data, meta }` envelope and every
 * error returns an `{ error }` envelope (see ApiErrorBody).
 */

export type Uuid = string;
/** ISO date (`YYYY-MM-DD`) or date-time string, depending on the field. */
export type IsoDate = string;

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type WorkStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF';

export interface Pagination {
  total: number;
  page: number;
  pageSize: number;
}

export interface ListEnvelope<T> {
  data: T[];
  meta: Pagination;
}

export interface ApiErrorBody {
  error: {
    name: string;
    message: string;
    details?: { [key: string]: unknown }[] | null;
  };
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------
export interface Company {
  id: Uuid;
  name: string;
  registrationNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateCompanyRequest {
  name: string;
  registrationNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
}
export type UpdateCompanyRequest = Partial<CreateCompanyRequest>;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export interface Project {
  id: Uuid;
  companyId: Uuid;
  name: string;
  code?: string;
  description?: string;
  location?: string;
  startDate?: IsoDate;
  endDate?: IsoDate;
  status: ProjectStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateProjectRequest {
  name: string;
  code?: string;
  description?: string;
  location?: string;
  startDate?: IsoDate;
  endDate?: IsoDate;
  status?: ProjectStatus;
  /** Optionally seed default work packages atomically with the project. */
  workPackages?: CreateWorkPackageRequest[];
}
export type UpdateProjectRequest = Partial<Omit<CreateProjectRequest, 'workPackages'>>;

// ---------------------------------------------------------------------------
// Work package
// ---------------------------------------------------------------------------
export interface WorkPackage {
  id: Uuid;
  projectId: Uuid;
  name: string;
  code?: string;
  description?: string;
  sequenceNumber?: number;
  status: WorkStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateWorkPackageRequest {
  name: string;
  code?: string;
  description?: string;
  sequenceNumber?: number;
  status?: WorkStatus;
}
export type UpdateWorkPackageRequest = Partial<CreateWorkPackageRequest>;

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
export interface Activity {
  id: Uuid;
  workPackageId: Uuid;
  name: string;
  code?: string;
  description?: string;
  sequenceNumber?: number;
  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  status: WorkStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateActivityRequest {
  name: string;
  code?: string;
  description?: string;
  sequenceNumber?: number;
  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  status?: WorkStatus;
}
export type UpdateActivityRequest = Partial<CreateActivityRequest>;

export interface ActivityContractor {
  id: Uuid;
  activityId: Uuid;
  /** Optional free-text role of the contractor on this activity. */
  role?: string | null;
  assignedAt: IsoDate;
  /** The contractor is embedded in the assignment response. */
  contractor: Contractor;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------
export interface Task {
  id: Uuid;
  activityId: Uuid;
  name: string;
  description?: string;
  sequenceNumber?: number;
  durationDays?: number;
  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  status: WorkStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  sequenceNumber?: number;
  durationDays?: number;
  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  status?: WorkStatus;
}
export type UpdateTaskRequest = Partial<CreateTaskRequest>;

// ---------------------------------------------------------------------------
// Dependency
// ---------------------------------------------------------------------------
export interface Dependency {
  id: Uuid;
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: DependencyType;
  lagDays: number;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateDependencyRequest {
  /** The predecessor task; the task in the URL becomes the successor. */
  predecessorTaskId: Uuid;
  dependencyType?: DependencyType;
  lagDays?: number;
}

/** GET /tasks/:id/dependencies — predecessors and successors of a task. */
export interface TaskDependencies {
  predecessors: Dependency[];
  successors: Dependency[];
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
export interface ProgressUpdate {
  id: Uuid;
  taskId: Uuid;
  progressPercentage: number;
  remarks?: string;
  recordedAt: IsoDate;
  createdAt: IsoDate;
}

export interface CreateProgressUpdateRequest {
  progressPercentage: number;
  remarks?: string;
  recordedAt?: IsoDate;
}

// ---------------------------------------------------------------------------
// Contractor
// ---------------------------------------------------------------------------
export interface Contractor {
  id: Uuid;
  name: string;
  companyName?: string;
  tradeSpecialty?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface CreateContractorRequest {
  name: string;
  companyName?: string;
  tradeSpecialty?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
}
export type UpdateContractorRequest = Partial<CreateContractorRequest>;

// ---------------------------------------------------------------------------
// Schedule (CPM)
// ---------------------------------------------------------------------------
export interface ScheduleTaskEntry {
  taskId: Uuid;
  taskName: string;
  activityId: Uuid;
  durationDays: number;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  isCritical: boolean;
}

export interface Schedule {
  projectDurationDays: number;
  tasks: ScheduleTaskEntry[];
  criticalPath: Uuid[];
}
