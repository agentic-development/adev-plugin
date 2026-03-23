import type { Task, TaskFilter } from '../types';
import { Database } from '../db';
import { format } from '../utils';
import { getAssigneeName } from './user-service';

const db = new Database();

export function createTask(title: string, assigneeId: string): Task {
  const name = getAssigneeName(assigneeId);
  console.log(format(`Creating task for ${name}`));
  return { id: '1', title, assigneeId, status: 0 as any };
}

export function listTasks(filter?: TaskFilter): Task[] {
  return db.query('SELECT * FROM tasks') as Task[];
}
