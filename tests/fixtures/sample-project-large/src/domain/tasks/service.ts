import { saveTask } from "../../infra/repository/tasks";
import { enqueueJob } from "../../infra/queue";
import { getUser } from "../users/service";

export function createTask(title, assigneeId) {
  const assignee = getUser(assigneeId);
  const task = saveTask({ title, assigneeId, assigneeName: assignee?.name ?? "unknown" });
  enqueueJob("task-created", task);
  return task;
}
