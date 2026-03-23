import { createTask, listTasks, getUser } from './services';
import { APP_NAME, DEFAULT_PAGE_SIZE } from './config';

export function main(): void {
  console.log(`Starting ${APP_NAME}`);
  const tasks = listTasks();
  console.log(`Loaded ${tasks.length} tasks (page size: ${DEFAULT_PAGE_SIZE})`);
}

export { createTask, getUser };
