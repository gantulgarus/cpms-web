/**
 * Flat project list across every company.
 *
 * There is no global "all projects" endpoint, so we fan out across companies →
 * projects and flatten the result for the web home page.
 */
import { companies, projects, type Project } from "@/lib/api";

export interface ProjectWithCompany {
  project: Project;
  companyId: string;
  companyName: string;
}

export async function loadAllProjects(): Promise<ProjectWithCompany[]> {
  const companyList = await companies.list({ pageSize: 100 });

  const grouped = await Promise.all(
    companyList.data.map(async (company) => {
      const list = await projects.listForCompany(company.id, { pageSize: 100 });
      return list.data.map<ProjectWithCompany>((project) => ({
        project,
        companyId: company.id,
        companyName: company.name,
      }));
    }),
  );

  return grouped.flat().sort((a, b) => a.project.name.localeCompare(b.project.name));
}
