import type { Mailer } from './auth/mailer.js';
import type { Db } from './db/db.js';

export interface Config {
  /** Where the RangeOps app lives; links in emails and hire links point here. */
  appUrl: string;
}

/** Everything the routes need from outside. Tests swap each one. */
export interface Deps {
  db: Db;
  now: () => Date;
  config: Config;
  mailer: Mailer;
}
