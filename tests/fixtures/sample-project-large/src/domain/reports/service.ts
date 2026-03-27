import { listTasks } from "../../infra/repository/tasks";
import { summarizeTasks } from "../../shared/metrics";

export function buildReport() {
  return summarizeTasks(listTasks());
}
