import { publishEvent } from "../shared/events";
import { getUser } from "../users/service";

export function createTask(title, assigneeId) {
  const user = getUser(assigneeId);
  publishEvent("task.created", { title, assigneeId, assigneeName: user?.name ?? "unknown" });
  return { id: "task-1", title, assigneeId };
}
