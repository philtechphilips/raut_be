import { MigrationInterface, QueryRunner } from "typeorm";

export class GeneratedMigration1778287777711 implements MigrationInterface {
    name = 'GeneratedMigration1778287777711'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`github_app_installations\` DROP FOREIGN KEY \`FK_github_app_installations_userId\``);
        await queryRunner.query(`DROP INDEX \`IDX_github_app_installations_installationId\` ON \`github_app_installations\``);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`role\` varchar(32) NULL DEFAULT 'user'`);
        await queryRunner.query(`ALTER TABLE \`projects\` CHANGE \`description\` \`description\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`projects\` DROP COLUMN \`folderOverviews\``);
        await queryRunner.query(`ALTER TABLE \`projects\` ADD \`folderOverviews\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`projects\` DROP COLUMN \`folderOrder\``);
        await queryRunner.query(`ALTER TABLE \`projects\` ADD \`folderOrder\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`projects\` CHANGE \`docsBaseUrl\` \`docsBaseUrl\` varchar(512) NULL`);
        await queryRunner.query(`ALTER TABLE \`projects\` CHANGE \`apiRoutePrefix\` \`apiRoutePrefix\` varchar(256) NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`syncAnchor\` \`syncAnchor\` varchar(512) NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`handlerFingerprint\` \`handlerFingerprint\` varchar(64) NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`description\` \`description\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`body\` \`body\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`scenarios\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`scenarios\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`params\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`params\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`query\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`query\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`headers\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`headers\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`responseSummary\` \`responseSummary\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`name\` \`name\` varchar(128) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`emailVerifiedAt\` \`emailVerifiedAt\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`emailVerificationToken\` \`emailVerificationToken\` varchar(64) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`emailVerificationExpiresAt\` \`emailVerificationExpiresAt\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`passwordResetToken\` \`passwordResetToken\` varchar(64) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`passwordResetExpiresAt\` \`passwordResetExpiresAt\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`github_repo_subscriptions\` CHANGE \`branch\` \`branch\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`github_repo_subscriptions\` CHANGE \`collectionName\` \`collectionName\` varchar(200) NULL`);
        await queryRunner.query(`ALTER TABLE \`github_app_installations\` ADD UNIQUE INDEX \`IDX_b7d85e6ecba6cfd4cb1b9abed3\` (\`installationId\`)`);
        await queryRunner.query(`ALTER TABLE \`github_app_installations\` ADD CONSTRAINT \`FK_490c838354d2f7c3848ac76bf29\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`github_app_installations\` DROP FOREIGN KEY \`FK_490c838354d2f7c3848ac76bf29\``);
        await queryRunner.query(`ALTER TABLE \`github_app_installations\` DROP INDEX \`IDX_b7d85e6ecba6cfd4cb1b9abed3\``);
        await queryRunner.query(`ALTER TABLE \`github_repo_subscriptions\` CHANGE \`collectionName\` \`collectionName\` varchar(200) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`github_repo_subscriptions\` CHANGE \`branch\` \`branch\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`passwordResetExpiresAt\` \`passwordResetExpiresAt\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`passwordResetToken\` \`passwordResetToken\` varchar(64) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`emailVerificationExpiresAt\` \`emailVerificationExpiresAt\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`emailVerificationToken\` \`emailVerificationToken\` varchar(64) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`emailVerifiedAt\` \`emailVerifiedAt\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`name\` \`name\` varchar(128) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`responseSummary\` \`responseSummary\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`headers\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`headers\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`query\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`query\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`params\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`params\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` DROP COLUMN \`scenarios\``);
        await queryRunner.query(`ALTER TABLE \`endpoints\` ADD \`scenarios\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`body\` \`body\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`description\` \`description\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`handlerFingerprint\` \`handlerFingerprint\` varchar(64) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`endpoints\` CHANGE \`syncAnchor\` \`syncAnchor\` varchar(512) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`projects\` CHANGE \`apiRoutePrefix\` \`apiRoutePrefix\` varchar(256) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`projects\` CHANGE \`docsBaseUrl\` \`docsBaseUrl\` varchar(512) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`projects\` DROP COLUMN \`folderOrder\``);
        await queryRunner.query(`ALTER TABLE \`projects\` ADD \`folderOrder\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`projects\` DROP COLUMN \`folderOverviews\``);
        await queryRunner.query(`ALTER TABLE \`projects\` ADD \`folderOverviews\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`projects\` CHANGE \`description\` \`description\` text NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`role\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_github_app_installations_installationId\` ON \`github_app_installations\` (\`installationId\`)`);
        await queryRunner.query(`ALTER TABLE \`github_app_installations\` ADD CONSTRAINT \`FK_github_app_installations_userId\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
