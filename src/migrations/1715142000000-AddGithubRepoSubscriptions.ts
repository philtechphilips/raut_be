import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGithubRepoSubscriptions1715142000000 implements MigrationInterface {
  name = 'AddGithubRepoSubscriptions1715142000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`github_repo_subscriptions\` (
        \`id\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`owner\` varchar(200) NOT NULL,
        \`repo\` varchar(200) NOT NULL,
        \`branch\` varchar(255) NULL,
        \`collectionName\` varchar(200) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_github_repo_subscriptions_owner_repo\` (\`owner\`, \`repo\`),
        INDEX \`IDX_github_repo_subscriptions_userId\` (\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_github_repo_subscriptions_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `github_repo_subscriptions`');
  }
}
