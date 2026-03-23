import type { User, Task } from '../types';

export const { isArray } = Array;

export const isNonEmpty = (s: string): boolean => s.trim().length > 0;

export function validateUser(user: User): boolean {
  return isNonEmpty(user.id) && isNonEmpty(user.name);
}

export function validateTask(task: Task): boolean {
  return isNonEmpty(task.id) && isNonEmpty(task.title);
}
