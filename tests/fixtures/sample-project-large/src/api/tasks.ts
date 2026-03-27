import { createTask } from "../domain/tasks/service";

export function createTaskRoute(input) {
  return createTask(input.title, input.assigneeId);
}
