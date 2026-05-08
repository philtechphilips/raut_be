import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../modules/auth/models/user.model';
import { Project, Endpoint } from '../modules/project/models/project.model';
import { UserRequestHistory } from '../modules/request-history/models/request-history.model';
import { UserGithubConnection } from '../modules/github/models/user-github-connection.model';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const isTsRuntime = __filename.endsWith('.ts');

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USERNAME || process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'routiq_db',
  entities: [User, Project, Endpoint, UserRequestHistory, UserGithubConnection],
  migrations: [isTsRuntime ? 'src/migrations/*.ts' : 'dist/migrations/*.js'],
  migrationsTableName: 'typeorm_migrations',
});
