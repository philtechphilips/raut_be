import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUuidSchema1715139000000 implements MigrationInterface {
  name = 'InitUuidSchema1715139000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'users')) return;

    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\` char(36) NOT NULL,
        \`email\` varchar(128) NOT NULL,
        \`password\` varchar(128) NOT NULL,
        \`name\` varchar(128) NULL,
        \`emailVerifiedAt\` datetime NULL,
        \`emailVerificationToken\` varchar(64) NULL,
        \`emailVerificationExpiresAt\` datetime NULL,
        \`passwordResetToken\` varchar(64) NULL,
        \`passwordResetExpiresAt\` datetime NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_users_email\` (\`email\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`projects\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`framework\` varchar(255) NOT NULL,
        \`description\` text NULL,
        \`folderOverviews\` json NULL,
        \`sortOrder\` int NOT NULL DEFAULT 0,
        \`folderOrder\` json NULL,
        \`docsPublished\` tinyint NOT NULL DEFAULT 0,
        \`docsBaseUrl\` varchar(512) NULL,
        \`apiRoutePrefix\` varchar(256) NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_projects_userId\` (\`userId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`endpoints\` (
        \`id\` char(36) NOT NULL,
        \`projectId\` varchar(36) NOT NULL,
        \`method\` varchar(10) NOT NULL,
        \`path\` varchar(255) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`category\` varchar(255) NOT NULL,
        \`sortOrder\` int NOT NULL DEFAULT 0,
        \`sourceFile\` varchar(255) NOT NULL,
        \`syncAnchor\` varchar(512) NULL,
        \`handlerFingerprint\` varchar(64) NULL,
        \`description\` text NULL,
        \`body\` text NULL,
        \`scenarios\` json NULL,
        \`params\` json NULL,
        \`query\` json NULL,
        \`headers\` json NULL,
        \`responseSummary\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_endpoints_projectId\` (\`projectId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_github_connections\` (
        \`id\` char(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`githubUserId\` varchar(32) NOT NULL,
        \`githubLogin\` varchar(255) NOT NULL,
        \`accessTokenEnc\` text NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_user_github_connections_userId\` (\`userId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_request_history\` (
        \`id\` varchar(80) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`at\` bigint unsigned NOT NULL,
        \`payload\` json NOT NULL,
        INDEX \`IDX_user_request_history_userId_at\` (\`userId\`, \`at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`projects\`
      ADD CONSTRAINT \`FK_projects_userId_users_id\`
      FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE \`endpoints\`
      ADD CONSTRAINT \`FK_endpoints_projectId_projects_id\`
      FOREIGN KEY (\`projectId\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `endpoints` DROP FOREIGN KEY `FK_endpoints_projectId_projects_id`');
    await queryRunner.query('ALTER TABLE `projects` DROP FOREIGN KEY `FK_projects_userId_users_id`');
    await queryRunner.query('DROP TABLE `user_request_history`');
    await queryRunner.query('DROP TABLE `user_github_connections`');
    await queryRunner.query('DROP TABLE `endpoints`');
    await queryRunner.query('DROP TABLE `projects`');
    await queryRunner.query('DROP TABLE `users`');
  }

  private async tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName],
    )) as Array<{ TABLE_NAME: string }>;
    return rows.length > 0;
  }
}
