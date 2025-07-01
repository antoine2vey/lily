import { Schema } from 'effect';

export class DatabaseError extends Schema.Class<DatabaseError>('DatabaseError')(
  {}
) {}