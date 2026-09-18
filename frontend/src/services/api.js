import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tasks
export const taskApi = {
  list: (projectId = null, parentId = null) => {
    let url = '/tasks/';
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    if (parentId) params.append('parent_id', parentId);
    if (params.toString()) url += '?' + params.toString();
    return api.get(url);
  },
  get: (taskId) => api.get(`/tasks/${taskId}`),
  create: (data) => api.post('/tasks/', data),
  update: (taskId, data) => api.put(`/tasks/${taskId}`, data),
  delete: (taskId) => api.delete(`/tasks/${taskId}`),
};

// Projects
export const projectApi = {
  list: () => api.get('/projects/'),
  get: (projectId) => api.get(`/projects/${projectId}`),
  create: (data) => api.post('/projects/', data),
  update: (projectId, data) => api.put(`/projects/${projectId}`, data),
  delete: (projectId) => api.delete(`/projects/${projectId}`),
};

// Users
export const userApi = {
  list: () => api.get('/users/'),
  get: (userId) => api.get(`/users/${userId}`),
};

export default api;
