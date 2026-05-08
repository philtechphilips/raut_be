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

@Entity({ name: 'github_repo_subscriptions' })
@Index('IDX_github_repo_subscriptions_owner_repo', ['owner', 'repo'])
export class GithubRepoSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  owner: string;

  @Column({ type: 'varchar', length: 200 })
  repo: string;

  /** If null, all branches trigger sync. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  branch: string | null;

  /** Optional project name override in dashboard sync flow. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  collectionName: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
