import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGithubAppInstallations1715143000000 implements MigrationInterface {
  name = 'AddGithubAppInstallations1715143000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`github_app_installations\` (
        \`id\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`installationId\` varchar(32) NOT NULL,
        \`accountLogin\` varchar(255) NOT NULL,
        \`accountType\` varchar(32) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_github_app_installations_installationId\` (\`installationId\`),
        INDEX \`IDX_github_app_installations_userId\` (\`userId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_github_app_installations_userId\`
          FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `github_app_installations`');
  }
}
