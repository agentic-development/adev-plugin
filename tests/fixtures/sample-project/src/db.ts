import { readFileSync } from 'fs';
import { DB_PATH } from './config';

export class Database {
  private path: string;

  constructor() {
    this.path = DB_PATH;
  }

  load(): string {
    return readFileSync(this.path, 'utf-8');
  }

  query(sql: string): unknown[] {
    return [];
  }
}

export default Database;
