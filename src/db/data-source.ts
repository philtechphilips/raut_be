import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { User } from '../modules/auth/models/user.model';
import { Project, Endpoint } from '../modules/project/models/project.model';
import { UserRequestHistory } from '../modules/request-history/models/request-history.model';
import { UserGithubConnection } from '../modules/github/models/user-github-connection.model';
import { GithubRepoSubscription } from '../modules/github/models/github-repo-subscription.model';
import { GithubAppInstallation } from '../modules/github/models/github-app-installation.model';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

/** Resolved from this file so `migration:*` works regardless of process cwd. */
const migrationsGlob = join(
  __dirname,
  '..',
  'migrations',
  __filename.endsWith('.ts') ? '*.ts' : '*.js',
);

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USERNAME || process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'routiq_db',
  entities: [
    User,
    Project,
    Endpoint,
    UserRequestHistory,
    UserGithubConnection,
    GithubRepoSubscription,
    GithubAppInstallation,
  ],
  migrations: [migrationsGlob],
  migrationsTableName: 'typeorm_migrations',
});
