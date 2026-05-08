import { MigrationInterface, QueryRunner } from 'typeorm';

type Col = { COLUMN_TYPE: string };
type Fk = { CONSTRAINT_NAME: string; TABLE_NAME: string };
type ColExtra = { COLUMN_TYPE: string; EXTRA: string };

export class IntIdsToUuid1715140000000 implements MigrationInterface {
  name = 'IntIdsToUuid1715140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersIdType = await this.columnType(queryRunner, 'users', 'id');
    if (!usersIdType || usersIdType.includes('char(36)')) {
      return;
    }

    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      await this.dropForeignKeys(queryRunner, [
        'projects',
        'endpoints',
        'user_github_connections',
        'user_request_history',
      ]);

      // Users
      await this.addColumnIfMissing(queryRunner, 'users', 'id_uuid', 'char(36) NULL');
      await queryRunner.query("UPDATE `users` SET `id_uuid` = UUID() WHERE `id_uuid` IS NULL");
      await queryRunner.query("ALTER TABLE `users` MODIFY `id_uuid` char(36) NOT NULL");

      // Projects
      await this.addColumnIfMissing(queryRunner, 'projects', 'id_uuid', 'char(36) NULL');
      await this.addColumnIfMissing(queryRunner, 'projects', 'userId_uuid', 'char(36) NULL');
      await queryRunner.query("UPDATE `projects` SET `id_uuid` = UUID() WHERE `id_uuid` IS NULL");
      await queryRunner.query(
        "UPDATE `projects` p JOIN `users` u ON u.`id` = p.`userId` SET p.`userId_uuid` = u.`id_uuid`",
      );
      await queryRunner.query("ALTER TABLE `projects` MODIFY `id_uuid` char(36) NOT NULL");
      await queryRunner.query("ALTER TABLE `projects` MODIFY `userId_uuid` char(36) NOT NULL");

      // Endpoints
      await this.addColumnIfMissing(queryRunner, 'endpoints', 'id_uuid', 'char(36) NULL');
      await this.addColumnIfMissing(queryRunner, 'endpoints', 'projectId_uuid', 'char(36) NULL');
      await queryRunner.query("UPDATE `endpoints` SET `id_uuid` = UUID() WHERE `id_uuid` IS NULL");
      const projectsHasLegacyId = !!(await this.columnType(queryRunner, 'projects', 'id'));
      const unresolvedEndpointProjectRefs = await this.scalarCount(
        queryRunner,
        'SELECT COUNT(*) AS c FROM `endpoints` WHERE `projectId_uuid` IS NULL',
      );
      if (!projectsHasLegacyId && unresolvedEndpointProjectRefs > 0) {
        throw new Error(
          'Cannot map endpoints.projectId to UUID because projects.id is already missing in this database. Restore from backup or reset the database, then re-run migrations.',
        );
      }
      await queryRunner.query(
        "UPDATE `endpoints` e JOIN `projects` p ON p.`id` = e.`projectId` SET e.`projectId_uuid` = p.`id_uuid`",
      );
      await queryRunner.query("ALTER TABLE `endpoints` MODIFY `id_uuid` char(36) NOT NULL");
      await queryRunner.query("ALTER TABLE `endpoints` MODIFY `projectId_uuid` char(36) NOT NULL");

      // GitHub connections
      await this.addColumnIfMissing(
        queryRunner,
        'user_github_connections',
        'id_uuid',
        'char(36) NULL',
      );
      await this.addColumnIfMissing(
        queryRunner,
        'user_github_connections',
        'userId_uuid',
        'char(36) NULL',
      );
      await queryRunner.query(
        "UPDATE `user_github_connections` SET `id_uuid` = UUID() WHERE `id_uuid` IS NULL",
      );
      await queryRunner.query(
        "UPDATE `user_github_connections` g JOIN `users` u ON u.`id` = g.`userId` SET g.`userId_uuid` = u.`id_uuid`",
      );
      await queryRunner.query(
        "ALTER TABLE `user_github_connections` MODIFY `id_uuid` char(36) NOT NULL",
      );
      await queryRunner.query(
        "ALTER TABLE `user_github_connections` MODIFY `userId_uuid` char(36) NOT NULL",
      );

      // Request history
      await this.addColumnIfMissing(
        queryRunner,
        'user_request_history',
        'userId_uuid',
        'char(36) NULL',
      );
      await queryRunner.query(
        "UPDATE `user_request_history` h JOIN `users` u ON u.`id` = h.`userId` SET h.`userId_uuid` = u.`id_uuid`",
      );
      await queryRunner.query(
        "ALTER TABLE `user_request_history` MODIFY `userId_uuid` char(36) NOT NULL",
      );

      // Replace columns
      await this.dropPrimaryKey(queryRunner, 'endpoints');
      await this.dropPrimaryKey(queryRunner, 'projects');
      await this.dropPrimaryKey(queryRunner, 'users');
      await this.dropPrimaryKey(queryRunner, 'user_github_connections');

      await this.dropColumnIfExists(queryRunner, 'endpoints', 'id');
      await queryRunner.query('ALTER TABLE `endpoints` CHANGE `id_uuid` `id` char(36) NOT NULL');
      await this.dropColumnIfExists(queryRunner, 'endpoints', 'projectId');
      await queryRunner.query(
        'ALTER TABLE `endpoints` CHANGE `projectId_uuid` `projectId` char(36) NOT NULL',
      );

      await this.dropColumnIfExists(queryRunner, 'projects', 'id');
      await queryRunner.query('ALTER TABLE `projects` CHANGE `id_uuid` `id` char(36) NOT NULL');
      await this.dropColumnIfExists(queryRunner, 'projects', 'userId');
      await queryRunner.query(
        'ALTER TABLE `projects` CHANGE `userId_uuid` `userId` char(36) NOT NULL',
      );

      await this.dropColumnIfExists(queryRunner, 'users', 'id');
      await queryRunner.query('ALTER TABLE `users` CHANGE `id_uuid` `id` char(36) NOT NULL');

      await this.dropColumnIfExists(queryRunner, 'user_github_connections', 'id');
      await queryRunner.query(
        'ALTER TABLE `user_github_connections` CHANGE `id_uuid` `id` char(36) NOT NULL',
      );
      await this.dropColumnIfExists(queryRunner, 'user_github_connections', 'userId');
      await queryRunner.query(
        'ALTER TABLE `user_github_connections` CHANGE `userId_uuid` `userId` char(36) NOT NULL',
      );

      await this.dropColumnIfExists(queryRunner, 'user_request_history', 'userId');
      await queryRunner.query(
        'ALTER TABLE `user_request_history` CHANGE `userId_uuid` `userId` char(36) NOT NULL',
      );

      // PKs and constraints
      await this.addPrimaryKeyIfMissing(queryRunner, 'users', 'id');
      await this.addPrimaryKeyIfMissing(queryRunner, 'projects', 'id');
      await this.addPrimaryKeyIfMissing(queryRunner, 'endpoints', 'id');
      await this.addPrimaryKeyIfMissing(queryRunner, 'user_github_connections', 'id');

      await this.addUniqueIndexIfMissing(
        queryRunner,
        'user_github_connections',
        'IDX_user_github_connections_userId',
        ['userId'],
      );

      if (!(await this.foreignKeyExists(queryRunner, 'projects', 'FK_projects_userId_users_id'))) {
        await queryRunner.query(
          'ALTER TABLE `projects` ADD CONSTRAINT `FK_projects_userId_users_id` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE',
        );
      }
      if (!(await this.foreignKeyExists(queryRunner, 'endpoints', 'FK_endpoints_projectId_projects_id'))) {
        await queryRunner.query(
          'ALTER TABLE `endpoints` ADD CONSTRAINT `FK_endpoints_projectId_projects_id` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE',
        );
      }
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally omitted: UUID -> int rollback is destructive and not guaranteed.
  }

  private async columnType(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<string | null> {
    const rows = (await queryRunner.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    )) as Col[];
    return rows[0]?.COLUMN_TYPE ?? null;
  }

  private async dropForeignKeys(queryRunner: QueryRunner, tables: string[]): Promise<void> {
    if (!tables.length) return;
    const placeholders = tables.map(() => '?').join(',');
    const rows = (await queryRunner.query(
      `SELECT TABLE_NAME, CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND REFERENCED_TABLE_NAME IS NOT NULL
         AND TABLE_NAME IN (${placeholders})`,
      tables,
    )) as Fk[];
    for (const fk of rows) {
      await queryRunner.query(
        `ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
      );
    }
  }

  private async dropPrimaryKey(queryRunner: QueryRunner, table: string): Promise<void> {
    await this.stripAutoIncrementIfPresent(queryRunner, table, 'id');
    const rows = (await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND CONSTRAINT_TYPE = 'PRIMARY KEY'`,
      [table],
    )) as Array<{ CONSTRAINT_NAME: string }>;
    if (rows.length) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP PRIMARY KEY`);
    }
  }

  private async stripAutoIncrementIfPresent(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COLUMN_TYPE, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [table, column],
    )) as ColExtra[];
    const info = rows[0];
    if (!info) return;
    if (!info.EXTRA?.toLowerCase().includes('auto_increment')) return;
    await queryRunner.query(
      `ALTER TABLE \`${table}\` MODIFY \`${column}\` ${info.COLUMN_TYPE} NOT NULL`,
    );
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    const col = await this.columnType(queryRunner, table, column);
    if (!col) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
  }

  private async addPrimaryKeyIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND CONSTRAINT_TYPE = 'PRIMARY KEY'`,
      [table],
    )) as Array<{ CONSTRAINT_NAME: string }>;
    if (!rows.length) {
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD PRIMARY KEY (\`${column}\`)`);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    const col = await this.columnType(queryRunner, table, column);
    if (col) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }

  private async foreignKeyExists(
    queryRunner: QueryRunner,
    table: string,
    name: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND CONSTRAINT_NAME = ?
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [table, name],
    )) as Array<{ CONSTRAINT_NAME: string }>;
    return rows.length > 0;
  }

  private async addUniqueIndexIfMissing(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
    columns: string[],
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?`,
      [table, indexName],
    )) as Array<{ INDEX_NAME: string }>;
    if (!rows.length) {
      const cols = columns.map((col) => `\`${col}\``).join(', ');
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (${cols})`,
      );
    }
  }

  private async scalarCount(queryRunner: QueryRunner, sql: string): Promise<number> {
    const rows = (await queryRunner.query(sql)) as Array<{ c: number | string }>;
    return Number(rows[0]?.c ?? 0);
  }
}
