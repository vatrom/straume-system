function norm(value: string): string {
  return value
    .toLocaleLowerCase("nb")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function bestEmployeeMatch(
  resourceName: string,
  employees: { id: number; firstName: string; lastName: string }[],
): number | null {
  const wanted = norm(resourceName);
  if (!wanted) return null;
  let best: { id: number; score: number } | null = null;
  for (const employee of employees) {
    const name = norm(`${employee.firstName} ${employee.lastName}`);
    if (!name) continue;
    const score = name === wanted ? 2 : name.includes(wanted) || wanted.includes(name) ? 1 : 0;
    if (score > 0 && (!best || score > best.score)) best = { id: employee.id, score };
  }
  return best?.id ?? null;
}

export function bestProjectMatch(
  projectName: string,
  projects: { id: number; number: string; name: string }[],
): number | null {
  const wanted = norm(projectName);
  if (!wanted) return null;
  let best: { id: number; score: number } | null = null;
  for (const project of projects) {
    const name = norm(project.name);
    const number = norm(project.number);
    let score = 0;
    if (number && wanted.includes(number)) score = 3;
    else if (name && name === wanted) score = 2;
    else if (name && (name.includes(wanted) || wanted.includes(name))) score = 1;
    if (score > 0 && (!best || score > best.score)) best = { id: project.id, score };
  }
  return best?.id ?? null;
}
