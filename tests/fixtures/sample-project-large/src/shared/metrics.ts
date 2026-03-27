export function summarizeTasks(tasks) {
  return {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => task.status === "done").length,
  };
}
