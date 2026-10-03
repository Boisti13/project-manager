import { restYaml } from './HomeAssistantSettings';

test('the REST sensor YAML points at the summary and keeps the token in secrets.yaml', () => {
  const yaml = restYaml('http://192.168.100.113/api/v1/summary/?workspace=3');
  expect(yaml).toContain('resource: http://192.168.100.113/api/v1/summary/?workspace=3');
  expect(yaml).toContain('Authorization: !secret project_manager_token');
  expect(yaml).toContain('value_template: "{{ value_json.overdue }}"');
  expect(yaml).toContain('json_attributes: [due_today_titles, due_today_tasks]');
  expect(yaml).toContain("value_template: \"{{ value_json.next_task_title or '—' }}\"");
  expect(yaml).not.toMatch(/pm_[A-Za-z0-9]{10}/); // no real token in it
});
