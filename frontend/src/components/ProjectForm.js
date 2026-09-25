import React, { useState } from 'react';
import { PROJECT_COLORS } from '../projects';
import '../styles/TaskForm.css';

// project: the project being edited (null for new)
// defaultParentId: pre-selected parent for a new category
// projectIndex: from buildProjectIndex, for the parent choices
function ProjectForm({ project, defaultParentId = null, projectIndex, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    description: project?.description || '',
    parent_id: project ? project.parent_id ?? null : defaultParentId,
    color: project?.color || '',
  });

  const hasCategories = project ? projectIndex.categoriesOf(project.id).length > 0 : false;
  const parentChoices = projectIndex.topLevel.filter((p) => !project || p.id !== project.id);
  const isCategory = formData.parent_id !== null;

  const set = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      description: formData.description || null,
      parent_id: formData.parent_id,
      // Categories use their parent's color; an empty color on a top-level
      // project lets the server pick the next palette color.
      color: isCategory ? null : formData.color || null,
    });
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => set('name', e.target.value)}
          required
          autoFocus
          placeholder={isCategory ? 'e.g. General, Ordering, Documentation' : 'Enter project name'}
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Optional"
          rows="2"
        />
      </div>

      <div className="form-group">
        <label>Category of</label>
        <select
          value={formData.parent_id ?? ''}
          onChange={(e) => set('parent_id', e.target.value === '' ? null : parseInt(e.target.value, 10))}
          disabled={hasCategories}
          title={hasCategories ? 'This project has categories, so it has to stay a top-level project' : ''}
        >
          <option value="">— none (top-level project) —</option>
          {parentChoices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!isCategory && (
        <div className="form-group">
          <label>Color</label>
          <div className="color-picker">
            {PROJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch ${formData.color.toLowerCase() === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => set('color', c)}
                aria-label={`Color ${c}`}
                title={c}
              />
            ))}
            <label className="color-custom" title="Custom color">
              <input
                type="color"
                value={formData.color || '#9e9e9e'}
                onChange={(e) => set('color', e.target.value)}
              />
              <span>Custom</span>
            </label>
          </div>
          {!formData.color && <small className="color-hint">None picked — one will be assigned automatically.</small>}
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {project ? 'Save' : isCategory ? 'Create Category' : 'Create Project'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default ProjectForm;
