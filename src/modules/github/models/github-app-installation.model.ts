import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/models/user.model';

@Entity({ name: 'github_app_installations' })
@Index('IDX_github_app_installations_userId', ['userId'])
export class GithubAppInstallation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  /** Numeric installation id from GitHub (`installation.id`). */
  @Column({ type: 'varchar', length: 32, unique: true })
  installationId: string;

  @Column({ type: 'varchar', length: 255 })
  accountLogin: string;

  /** `User` or `Organization` from GitHub installation payload. */
  @Column({ type: 'varchar', length: 32 })
  accountType: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
