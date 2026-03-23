import type { User } from '../types';
import { Database } from '../db';
import { listTasks } from './task-service';

const db = new Database();

export function getUser(id: string): User | undefined {
  const rows = db.query(`SELECT * FROM users WHERE id = '${id}'`);
  return rows[0] as User | undefined;
}

export function getAssigneeName(id: string): string {
  const user = getUser(id);
  return user?.name ?? 'Unknown';
}

export function getUserTasks(userId: string) {
  return listTasks({ status: 0 as any, assigneeId: userId });
}
