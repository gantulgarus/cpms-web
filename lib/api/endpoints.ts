/**
 * Typed CPMS API surface.
 *
 * One function per endpoint, grouped by resource. List helpers return the full
 * `{ data, meta }` envelope; item helpers unwrap to the resource. Mirrors the
 * routes documented at `/api-docs`.
 */
import { DEFAULT_PAGE_SIZE } from '@/lib/config';
import { request } from './client';
import type {
  Activity,
  ActivityContractor,
  Company,
  Contractor,
  CreateActivityRequest,
  CreateCompanyRequest,
  CreateContractorRequest,
  CreateDependencyRequest,
  CreateProgressUpdateRequest,
  CreateProjectRequest,
  CreateTaskRequest,
  CreateWorkPackageRequest,
  Dependency,
  ListEnvelope,
  ProgressUpdate,
  Project,
  Schedule,
  Task,
  TaskDependencies,
  UpdateActivityRequest,
  UpdateCompanyRequest,
  UpdateContractorRequest,
  UpdateProjectRequest,
  UpdateTaskRequest,
  UpdateWorkPackageRequest,
  Uuid,
  WorkPackage,
} from './types';

export * from './types';
export { ApiError } from './client';

interface Item<T> {
  data: T;
}

export interface PageParams {
  page?: number;
  pageSize?: number;
}

function pageQuery({ page, pageSize = DEFAULT_PAGE_SIZE }: PageParams = {}) {
  return { page, pageSize };
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
export const companies = {
  list: (params?: PageParams) =>
    request<ListEnvelope<Company>>('GET', '/companies', { query: pageQuery(params) }),
  get: (id: Uuid) => request<Item<Company>>('GET', `/companies/${id}`).then((r) => r.data),
  create: (body: CreateCompanyRequest) =>
    request<Item<Company>>('POST', '/companies', { body }).then((r) => r.data),
  update: (id: Uuid, body: UpdateCompanyRequest) =>
    request<Item<Company>>('PATCH', `/companies/${id}`, { body }).then((r) => r.data),
  remove: (id: Uuid) => request<void>('DELETE', `/companies/${id}`),
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = {
  listForCompany: (companyId: Uuid, params?: PageParams) =>
    request<ListEnvelope<Project>>('GET', `/companies/${companyId}/projects`, {
      query: pageQuery(params),
    }),
  create: (companyId: Uuid, body: CreateProjectRequest) =>
    request<Item<Project>>('POST', `/companies/${companyId}/projects`, { body }).then((r) => r.data),
  get: (id: Uuid) => request<Item<Project>>('GET', `/projects/${id}`).then((r) => r.data),
  update: (id: Uuid, body: UpdateProjectRequest) =>
    request<Item<Project>>('PATCH', `/projects/${id}`, { body }).then((r) => r.data),
  remove: (id: Uuid) => request<void>('DELETE', `/projects/${id}`),

  schedule: (id: Uuid) =>
    request<Item<Schedule>>('GET', `/projects/${id}/schedule`).then((r) => r.data),
  recalculateSchedule: (id: Uuid) =>
    request<Item<Schedule>>('POST', `/projects/${id}/schedule/calculate`).then((r) => r.data),
  criticalPath: (id: Uuid) =>
    request<Item<{ criticalPath: Uuid[] }>>('GET', `/projects/${id}/critical-path`).then(
      (r) => r.data.criticalPath,
    ),
};

// ---------------------------------------------------------------------------
// Work packages
// ---------------------------------------------------------------------------
export const workPackages = {
  listForProject: (projectId: Uuid, params?: PageParams) =>
    request<ListEnvelope<WorkPackage>>('GET', `/projects/${projectId}/work-packages`, {
      query: pageQuery(params),
    }),
  create: (projectId: Uuid, body: CreateWorkPackageRequest) =>
    request<Item<WorkPackage>>('POST', `/projects/${projectId}/work-packages`, { body }).then(
      (r) => r.data,
    ),
  get: (id: Uuid) => request<Item<WorkPackage>>('GET', `/work-packages/${id}`).then((r) => r.data),
  update: (id: Uuid, body: UpdateWorkPackageRequest) =>
    request<Item<WorkPackage>>('PATCH', `/work-packages/${id}`, { body }).then((r) => r.data),
  remove: (id: Uuid) => request<void>('DELETE', `/work-packages/${id}`),
};

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------
export const activities = {
  listForWorkPackage: (workPackageId: Uuid, params?: PageParams) =>
    request<ListEnvelope<Activity>>('GET', `/work-packages/${workPackageId}/activities`, {
      query: pageQuery(params),
    }),
  create: (workPackageId: Uuid, body: CreateActivityRequest) =>
    request<Item<Activity>>('POST', `/work-packages/${workPackageId}/activities`, { body }).then(
      (r) => r.data,
    ),
  get: (id: Uuid) => request<Item<Activity>>('GET', `/activities/${id}`).then((r) => r.data),
  update: (id: Uuid, body: UpdateActivityRequest) =>
    request<Item<Activity>>('PATCH', `/activities/${id}`, { body }).then((r) => r.data),
  remove: (id: Uuid) => request<void>('DELETE', `/activities/${id}`),
  move: (id: Uuid, workPackageId: Uuid) =>
    request<Item<Activity>>('PATCH', `/activities/${id}/move`, { body: { workPackageId } }).then(
      (r) => r.data,
    ),

  listContractors: (activityId: Uuid) =>
    request<{ data: ActivityContractor[] }>('GET', `/activities/${activityId}/contractors`).then(
      (r) => r.data,
    ),
  assignContractor: (activityId: Uuid, contractorId: Uuid) =>
    request<Item<ActivityContractor>>('POST', `/activities/${activityId}/contractors`, {
      body: { contractorId },
    }).then((r) => r.data),
  unassignContractor: (activityId: Uuid, contractorId: Uuid) =>
    request<void>('DELETE', `/activities/${activityId}/contractors/${contractorId}`),
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export const tasks = {
  listForActivity: (activityId: Uuid, params?: PageParams) =>
    request<ListEnvelope<Task>>('GET', `/activities/${activityId}/tasks`, {
      query: pageQuery(params),
    }),
  create: (activityId: Uuid, body: CreateTaskRequest) =>
    request<Item<Task>>('POST', `/activities/${activityId}/tasks`, { body }).then((r) => r.data),
  reorder: (activityId: Uuid, taskIds: Uuid[]) =>
    request<void>('PATCH', `/activities/${activityId}/tasks/reorder`, { body: { taskIds } }),
  get: (id: Uuid) => request<Item<Task>>('GET', `/tasks/${id}`).then((r) => r.data),
  update: (id: Uuid, body: UpdateTaskRequest) =>
    request<Item<Task>>('PATCH', `/tasks/${id}`, { body }).then((r) => r.data),
  remove: (id: Uuid) => request<void>('DELETE', `/tasks/${id}`),

  dependencies: (id: Uuid) =>
    request<Item<TaskDependencies>>('GET', `/tasks/${id}/dependencies`).then((r) => r.data),
  addDependency: (id: Uuid, body: CreateDependencyRequest) =>
    request<Item<Dependency>>('POST', `/tasks/${id}/dependencies`, { body }).then((r) => r.data),

  progress: (id: Uuid) =>
    request<{ data: ProgressUpdate[] }>('GET', `/tasks/${id}/progress`).then((r) => r.data),
  addProgress: (id: Uuid, body: CreateProgressUpdateRequest) =>
    request<Item<ProgressUpdate>>('POST', `/tasks/${id}/progress`, { body }).then((r) => r.data),
};

export const dependencies = {
  remove: (id: Uuid) => request<void>('DELETE', `/dependencies/${id}`),
};

export const progress = {
  remove: (id: Uuid) => request<void>('DELETE', `/progress/${id}`),
};

// ---------------------------------------------------------------------------
// Contractors
// ---------------------------------------------------------------------------
export const contractors = {
  list: (params?: PageParams) =>
    request<ListEnvelope<Contractor>>('GET', '/contractors', { query: pageQuery(params) }),
  get: (id: Uuid) => request<Item<Contractor>>('GET', `/contractors/${id}`).then((r) => r.data),
  create: (body: CreateContractorRequest) =>
    request<Item<Contractor>>('POST', '/contractors', { body }).then((r) => r.data),
  update: (id: Uuid, body: UpdateContractorRequest) =>
    request<Item<Contractor>>('PATCH', `/contractors/${id}`, { body }).then((r) => r.data),
  remove: (id: Uuid) => request<void>('DELETE', `/contractors/${id}`),
  projects: (id: Uuid) =>
    request<{ data: Project[] }>('GET', `/contractors/${id}/projects`).then((r) => r.data),
};

export const api = {
  companies,
  projects,
  workPackages,
  activities,
  tasks,
  dependencies,
  progress,
  contractors,
};
