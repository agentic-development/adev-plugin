const tasks = [];

export function saveTask(task) {
  const saved = { id: `task-${tasks.length + 1}`, ...task };
  tasks.push(saved);
  return saved;
}

export function listTasks() {
  return [...tasks];
}
