import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'user_github_connections' })
export class UserGithubConnection {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, unique: true })
  userId: number;

  @Column({ type: 'varchar', length: 32 })
  githubUserId: string;

  @Column({ type: 'varchar', length: 255 })
  githubLogin: string;

  /** AES-256-GCM ciphertext (base64). */
  @Column({ type: 'text' })
  accessTokenEnc: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
