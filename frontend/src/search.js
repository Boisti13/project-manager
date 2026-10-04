// Searching everything for the search window (Ctrl+K, SearchPalette.js):
// tasks by title, description and comments, projects and categories by
// name. Every word has to match; case, accents and ß don't matter. No React.

export const fold = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss');

/** Higher is better; -1: not every word is in `text`. */
function textScore(text, words) {
  const f = fold(text);
  let score = 0;
  for (const w of words) {
    const i = f.indexOf(w);
    if (i < 0) return -1;
    // the start of the text beats the start of a word beats the middle of one
    score += i === 0 ? 30 : /[^a-z0-9]/.test(f[i - 1]) ? 20 : 10;
  }
  if (f === words.join(' ')) score += 50;
  return score;
}

/** The project of a task; subtasks without their own take their parent's. */
export function projectOfTask(task, byId) {
  for (let cur = task; cur; cur = byId.get(cur.parent_task_id)) if (cur.project_id != null) return cur.project_id;
  return null;
}

/**
 * Finds `query` in tasks and projects. commentTaskIds: tasks with a matching
 * comment (from the server). Returns { tasks: [{ task, where, projectId }],
 * projects: [project], more: { tasks, projects } } -- the best `limit` of
 * each and how many more there are. where: "title" | "description" | "comment".
 */
export function searchAll(query, { tasks = [], projectIndex, commentTaskIds = new Set(), limit = 8, projectLimit = 5 } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { tasks: [], projects: [], more: { tasks: 0, projects: 0 } };
  const byId = new Map(tasks.map((x) => [x.id, x]));

  const found = [];
  for (const task of tasks) {
    let score = textScore(task.title, words);
    let where = 'title';
    if (score < 0) {
      if (textScore(`${task.title} ${task.description || ''}`, words) >= 0) {
        score = 5;
        where = 'description';
      } else if (commentTaskIds.has(task.id)) {
        score = 3;
        where = 'comment';
      } else continue;
    }
    const projectId = projectOfTask(task, byId);
    if (task.status !== 'done') score += 15;
    if (projectId != null && projectIndex?.isArchived(projectId)) score -= 10;
    found.push({ task, where, projectId, score });
  }
  const time = (t) => (t.deadline ? new Date(t.deadline).getTime() : Infinity);
  found.sort((a, b) => b.score - a.score || time(a.task) - time(b.task) || a.task.id - b.task.id);

  const projects = [];
  for (const p of projectIndex ? projectIndex.byId.values() : []) {
    let score = Math.max(textScore(p.name, words), textScore(projectIndex.labelOf(p.id), words));
    if (score < 0) continue;
    if (projectIndex.isArchived(p.id)) score -= 10;
    projects.push({ project: p, score });
  }
  projects.sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name));

  return {
    tasks: found.slice(0, limit).map(({ score, ...rest }) => rest),
    projects: projects.slice(0, projectLimit).map((x) => x.project),
    more: { tasks: Math.max(0, found.length - limit), projects: Math.max(0, projects.length - projectLimit) },
  };
}
