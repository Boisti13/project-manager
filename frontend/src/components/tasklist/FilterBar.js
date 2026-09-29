import React, { useState } from 'react';
import LabelChips from '../LabelChips';
import TrashIcon from '../TrashIcon';
import { t } from '../../i18n';
import { STATUSES, statusName } from '../../names';
import { isListView } from '../../views';

/**
 * Above the task list: "Assigned to me", "Select", the search box, saved
 * filters, and the filter and sort lists (folded away on phones).
 * saved: useSavedFilters(); selection: useSelection().
 */
function FilterBar({
  filters,
  setFilter,
  clearFilters,
  filtering,
  searchRef,
  myOpenCount,
  selection,
  saved,
  projectIndex,
  labelIndex,
  users,
  currentUser,
}) {
  // Phones only: the filter selects are folded away behind a button.
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <>
      <div className="filters">
        <div className="filter-search">
          <button
            className={`mine-toggle ${filters.assignee === 'me' ? 'active' : ''}`}
            onClick={() => setFilter('assignee', filters.assignee === 'me' ? '' : 'me')}
            aria-pressed={filters.assignee === 'me'}
            title={t('Show only tasks assigned to you')}
          >
            {t('Assigned to me')}
            {myOpenCount > 0 && <span className="mine-count">{myOpenCount}</span>}
          </button>
          {isListView(filters.view) && (
            <button
              className={`mine-toggle ${selection.active ? 'active' : ''}`}
              onClick={() => (selection.active ? selection.exit() : selection.start())}
              aria-pressed={selection.active}
              title={t('Pick several tasks and change them together')}
            >
              {t('☑ Select')}
            </button>
          )}
          <input
            ref={searchRef}
            type="search"
            placeholder={t('Search tasks…  ( / )')}
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('q', '');
                e.target.blur();
              }
            }}
            aria-label={t('Search tasks')}
          />
        </div>

        {(saved.savedFilters.length > 0 || (saved.currentQuery && !saved.active)) && (
          <div className="saved-filters" aria-label={t('Saved filters')}>
            {saved.savedFilters.map((f) => {
              const active = f === saved.active;
              return (
                <span key={f.id} className={`saved-filter ${active ? 'active' : ''}`}>
                  <button className="saved-filter-apply" onClick={() => saved.apply(f)} aria-pressed={active}>
                    ★ {f.name}
                  </button>
                  {active && (
                    <button
                      className="saved-filter-delete"
                      onClick={() => saved.remove(f)}
                      title={t('Delete saved filter')}
                      aria-label={t('Delete saved filter')}
                    >
                      <TrashIcon size={13} />
                    </button>
                  )}
                </span>
              );
            })}
            {saved.currentQuery && !saved.active && (
              <button className="saved-filter-save" onClick={saved.save} title={t('Keep these filters, search and sort under a name')}>
                ☆ {t('Save filter')}
              </button>
            )}
          </div>
        )}

        <button
          className="btn btn-secondary btn-small filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          {filtersOpen ? '▲' : '▼'} {t('Filters & sort')}
          {filters.status !== 'all' ||
          filters.project ||
          filters.assignee ||
          filters.due ||
          filters.label ||
          filters.sort !== 'manual'
            ? ' •'
            : ''}
        </button>

        <div className={`filter-row ${filtersOpen ? 'open' : ''}`}>
          <div className="filter-group">
            <label htmlFor="f-status">{t('Status')}</label>
            <select id="f-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="all">{t('All')}</option>
              <option value="open">{t('Not done')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusName(s)}
                </option>
              ))}
              <option value="waiting">{t('⏳ Waiting for other tasks')}</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-project">{t('Project')}</label>
            <select id="f-project" value={filters.project} onChange={(e) => setFilter('project', e.target.value)}>
              <option value="">{t('All')}</option>
              {projectIndex.topLevel.map((p) => [
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>,
                ...projectIndex.categoriesOf(p.id).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {'\u00a0\u00a0\u00a0└ '}
                    {c.name}
                  </option>
                )),
              ])}
              {projectIndex.archived.length > 0 && (
                <optgroup label={t('Archived')}>
                  {projectIndex.archived.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-assignee">{t('Assignee')}</label>
            <select id="f-assignee" value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)}>
              <option value="">{t('Anyone')}</option>
              <option value="me">{t('Me')}</option>
              <option value="none">{t('Unassigned')}</option>
              {users
                .filter((u) => u.id !== currentUser?.id)
                .map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.username}
                  </option>
                ))}
            </select>
          </div>

          {labelIndex.list.length > 0 && (
            <div className="filter-group">
              <label htmlFor="f-label">{t('Label')}</label>
              <select id="f-label" value={filters.label} onChange={(e) => setFilter('label', e.target.value)}>
                <option value="">{t('Any')}</option>
                {labelIndex.list.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group">
            <label htmlFor="f-due">{t('Deadline')}</label>
            <select id="f-due" value={filters.due} onChange={(e) => setFilter('due', e.target.value)}>
              <option value="">{t('Any')}</option>
              <option value="overdue">{t('Overdue')}</option>
              <option value="week">{t('Due in 7 days')}</option>
              <option value="none">{t('No deadline')}</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="f-sort">{t('Sort')}</label>
            <select id="f-sort" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
              <option value="manual">{t('Manual order')}</option>
              <option value="deadline">{t('Deadline')}</option>
              <option value="priority">{t('Priority')}</option>
              <option value="created">{t('Newest first')}</option>
              <option value="title">{t('Title')}</option>
            </select>
          </div>

          {filtering && (
            <button className="btn btn-secondary btn-small filter-clear" onClick={clearFilters}>
              {t('Clear filters')}
            </button>
          )}
        </div>
      </div>

      {filters.label && labelIndex.byId.has(parseInt(filters.label, 10)) && (
        <p className="archive-note label-filter-note">
          {t('Label:')} <LabelChips labels={[labelIndex.byId.get(parseInt(filters.label, 10))]} />{' '}
          <button className="link-btn" onClick={() => setFilter('label', '')}>
            {t('Show all')}
          </button>
        </p>
      )}
    </>
  );
}

export default FilterBar;
