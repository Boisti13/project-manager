import React from 'react';
import { t } from '../../i18n';
import { groupTaskCount } from '../../projects';
import { totalRemaining, formatEstimate } from '../../estimate';

/**
 * The list view's sections: a block per project, its categories, and the
 * collapsed "✓ Completed (n)" rows, each task drawn by renderTask.
 */
function TaskGroups({
  groups,
  filtering,
  noResults,
  clearFilters,
  collapsedGroups,
  toggleGroup,
  openCompleted,
  toggleCompleted,
  completedAutoOpen,
  allChildrenOf,
  openNewTask,
  renderTask,
}) {
  // Open work estimated in a section (tasks shown there, with their subtasks).
  const estimateBadge = (roots) => {
    const minutes = totalRemaining(roots, allChildrenOf);
    return minutes > 0 ? (
      <span className="estimate-total" title={t('Open work, estimated')}>
        ⏱ {formatEstimate(minutes)}
      </span>
    ) : null;
  };

  const renderCompleted = (key, list) => {
    if (list.length === 0) return null;
    const open = completedAutoOpen || openCompleted.has(key);
    return (
      <div className="completed-group">
        <button
          className="completed-toggle"
          onClick={() => toggleCompleted(key)}
          aria-expanded={open}
          disabled={completedAutoOpen}
        >
          <span className="project-group-caret">{open ? '▼' : '▶'}</span>
          {t('✓ Completed ({n})', { n: list.length })}
        </button>
        {open && <div className="completed-list">{list.map(renderTask)}</div>}
      </div>
    );
  };

  return (
    <>
      {noResults ? (
        <p className="no-tasks">
          {t('No tasks match these filters.')}{' '}
          <button className="link-btn" onClick={clearFilters}>
            {t('Clear filters')}
          </button>
        </p>
      ) : groups.length === 0 ? (
        <p className="no-tasks">{t('No tasks or projects yet.')}</p>
      ) : (
        groups.map((group) => {
          // Filters auto-open sections so results are never hidden.
          const collapsed = !filtering && collapsedGroups.has(group.key);
          return (
            <section
              key={group.key}
              className={`project-group ${collapsed ? 'collapsed' : ''}`}
              style={{ '--project-color': group.color }}
            >
              <header className="project-group-header">
                <button
                  className="project-group-toggle"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!collapsed}
                  disabled={filtering}
                >
                  <span className="project-group-caret">{collapsed ? '▶' : '▼'}</span>
                  <span className="project-swatch" />
                  <span className="project-group-name">{group.project ? group.project.name : t('No project')}</span>
                  {group.project?.is_private && (
                    <span className="private-lock" title={t('Private project: only members and admins see it')}>
                      🔒
                    </span>
                  )}
                  <span className="project-group-count">{groupTaskCount(group)}</span>
                  {estimateBadge([...group.tasks, ...group.categories.flatMap((c) => c.tasks)])}
                </button>
                <button
                  className="task-action-btn"
                  title={group.project ? t('New task in {name}', { name: group.project.name }) : t('New task without project')}
                  onClick={() => openNewTask(group.project ? group.project.id : null)}
                >
                  +
                </button>
              </header>

              {!collapsed && (
                <div className="project-group-body">
                  {group.tasks.map(renderTask)}
                  {renderCompleted(`${group.key}-done`, group.completed)}
                  {group.categories.map((cat) => {
                    const catCollapsed = !filtering && collapsedGroups.has(cat.key);
                    return (
                    <div className={`category-group ${catCollapsed ? 'collapsed' : ''}`} key={cat.key}>
                      <div className="category-header">
                        <button
                          className="category-toggle"
                          onClick={() => toggleGroup(cat.key)}
                          aria-expanded={!catCollapsed}
                          disabled={filtering}
                        >
                          <span className="project-group-caret">{catCollapsed ? '▶' : '▼'}</span>
                          <span className="category-name">{cat.project.name}</span>
                          <span className="project-group-count">{cat.tasks.length}</span>
                          {estimateBadge(cat.tasks)}
                        </button>
                        <button
                          className="task-action-btn"
                          title={t('New task in {name}', { name: `${group.project.name} / ${cat.project.name}` })}
                          onClick={() => openNewTask(cat.project.id)}
                        >
                          +
                        </button>
                      </div>
                      {!catCollapsed && (
                        <>
                          {cat.tasks.length === 0 ? (
                            <p className="category-empty">{cat.completed.length ? t('All done ✓') : t('No tasks')}</p>
                          ) : (
                            cat.tasks.map(renderTask)
                          )}
                          {renderCompleted(`${cat.key}-done`, cat.completed)}
                        </>
                      )}
                    </div>
                    );
                  })}
                  {group.tasks.length === 0 && group.categories.length === 0 && group.completed.length === 0 && (
                    <p className="category-empty">{t('No tasks')}</p>
                  )}
                </div>
              )}
            </section>
          );
        })
      )}
    </>
  );
}

export default TaskGroups;
