import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectModule } from './modules/project/project.module';
import { AiModule } from './modules/ai/ai.module';
import { RequestHistoryModule } from './modules/request-history/request-history.module';
import { GithubModule } from './modules/github/github.module';

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
        synchronize: true,
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
  ],
})
export class AppModule {}
