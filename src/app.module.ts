import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectModule } from './modules/project/project.module';
import { AiModule } from './modules/ai/ai.module';
import { RequestHistoryModule } from './modules/request-history/request-history.module';
import { GithubModule } from './modules/github/github.module';
import { AdminModule } from './modules/admin/admin.module';
import { LocalRequestModule } from './modules/local-request/local-request.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        username: process.env.DB_USERNAME || process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'routiq_db',
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsTableName: 'typeorm_migrations',
        logging: false,
        extra: {
          connectionLimit: 5,
        },
      }),
    }),
    AuthModule,
    ProjectModule,
    AiModule,
    RequestHistoryModule,
    GithubModule,
    AdminModule,
    LocalRequestModule,
  ],
})
export class AppModule {}
