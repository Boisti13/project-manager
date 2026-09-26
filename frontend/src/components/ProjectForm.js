import React, { useState } from 'react';
import { PROJECT_COLORS } from '../projects';
import '../styles/TaskForm.css';
import { t } from '../i18n';

// project: the project being edited (null for new)
// defaultParentId: pre-selected parent for a new category
// projectIndex: from buildProjectIndex, for the parent choices
// users/currentUser: for the members of a private project
function ProjectForm({ project, defaultParentId = null, projectIndex, users = [], currentUser, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    description: project?.description || '',
    parent_id: project ? project.parent_id ?? null : defaultParentId,
    color: project?.color || '',
    is_private: !!project?.is_private,
    // A new project starts with its creator as the only member.
    member_ids: project ? project.member_ids || [] : currentUser ? [currentUser.id] : [],
  });

  const hasCategories = project ? projectIndex.categoriesOf(project.id).length > 0 : false;
  const parentChoices = projectIndex.topLevel.filter((p) => !project || p.id !== project.id);
  const isCategory = formData.parent_id !== null;

  const set = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));
  // Non-admins stay members of private projects they manage (the server
  // enforces this too), so they can't lock themselves out.
  const lockedIn = (id) => id === currentUser?.id && !currentUser?.is_admin;
  const toggleMember = (id) =>
    set(
      'member_ids',
      formData.member_ids.includes(id) ? formData.member_ids.filter((m) => m !== id) : [...formData.member_ids, id]
    );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      description: formData.description || null,
      parent_id: formData.parent_id,
      // Categories use their parent's color; an empty color on a top-level
      // project lets the server pick the next palette color.
      color: isCategory ? null : formData.color || null,
      // Categories follow their project's visibility.
      ...(isCategory ? {} : { is_private: formData.is_private, member_ids: formData.member_ids }),
    });
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label>{t('Name *')}</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => set('name', e.target.value)}
          required
          autoFocus
          placeholder={isCategory ? t('e.g. General, Ordering, Documentation') : t('Enter project name')}
        />
      </div>

      <div className="form-group">
        <label>{t('Description')}</label>
        <textarea
          value={formData.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={t('Optional')}
          rows="2"
        />
      </div>

      <div className="form-group">
        <label>{t('Category of')}</label>
        <select
          value={formData.parent_id ?? ''}
          onChange={(e) => set('parent_id', e.target.value === '' ? null : parseInt(e.target.value, 10))}
          disabled={hasCategories}
          title={hasCategories ? t('This project has categories, so it has to stay a top-level project') : ''}
        >
          <option value="">{t('— none (top-level project) —')}</option>
          {parentChoices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!isCategory && (
        <div className="form-group">
          <label>{t('Color')}</label>
          <div className="color-picker">
            {PROJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch ${formData.color.toLowerCase() === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => set('color', c)}
                aria-label={t('Color {color}', { color: c })}
                title={c}
              />
            ))}
            <label className="color-custom" title={t('Custom color')}>
              <input
                type="color"
                value={formData.color || '#9e9e9e'}
                onChange={(e) => set('color', e.target.value)}
              />
              <span>{t('Custom')}</span>
            </label>
          </div>
          {!formData.color && (
            <small className="color-hint">{t('None picked — one will be assigned automatically.')}</small>
          )}
        </div>
      )}

      {isCategory ? (
        projectIndex.isPrivate(formData.parent_id) && (
          <p className="color-hint">{t("🔒 Private like its project: only the project's members can see it.")}</p>
        )
      ) : (
        <div className="form-group">
          <label>{t('Visibility')}</label>
          <div className="visibility-options">
            <label>
              <input type="radio" checked={!formData.is_private} onChange={() => set('is_private', false)} />
              {t('Everyone')}
            </label>
            <label>
              <input type="radio" checked={formData.is_private} onChange={() => set('is_private', true)} />
              {t('🔒 Private — only members and admins')}
            </label>
          </div>
          {formData.is_private && (
            <fieldset className="member-picker">
              <legend>{t('Members')}</legend>
              {users
                .filter((u) => u.is_active !== false)
                .map((u) => (
                  <label key={u.id} className={lockedIn(u.id) ? 'locked' : ''}>
                    <input
                      type="checkbox"
                      checked={formData.member_ids.includes(u.id) || lockedIn(u.id)}
                      disabled={lockedIn(u.id)}
                      onChange={() => toggleMember(u.id)}
                    />
                    {u.username}
                    {u.id === currentUser?.id && ` ${t('(you)')}`}
                    {u.is_admin && <span className="member-admin">{t('admin, sees it anyway')}</span>}
                  </label>
                ))}
              <small className="color-hint">
                {t(
                  'The project, its categories, tasks, comments and history are hidden from everyone else. Tasks can only be assigned to members.'
                )}
              </small>
            </fieldset>
          )}
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {project ? t('Save') : isCategory ? t('Create Category') : t('Create Project')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

export default ProjectForm;
