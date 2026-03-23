export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Task {
  id: string;
  title: string;
  assigneeId: string;
  status: TaskStatus;
}

export type TaskFilter = Pick<Task, 'status' | 'assigneeId'>;

export enum TaskStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Done = 'done',
}
