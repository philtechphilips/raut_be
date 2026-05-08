import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/models/user.model';

@Entity({ name: 'projects' })
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  framework: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Per-folder AI blurbs from analyze-project sync: [{ name, description }] */
  @Column({ type: 'json', nullable: true })
  folderOverviews: { name: string; description: string }[] | null;

  /** Sidebar order among the user’s collections (lower first). */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Ordered folder (category) names for this project; merged on sync. */
  @Column({ type: 'json', nullable: true })
  folderOrder: string[] | null;

  /** When true, `GET /api/public/docs/:id` serves this project’s published documentation. */
  @Column({ type: 'boolean', default: false })
  docsPublished: boolean;

  /** Shown as “Base URL” on published docs (e.g. https://api.myproduct.com). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  docsBaseUrl: string | null;

  /** Global path prefix applied to synced routes (e.g. `/api`, `/api/v1`). */
  @Column({ type: 'varchar', length: 256, nullable: true })
  apiRoutePrefix: string | null;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, (user) => user.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @OneToMany(() => Endpoint, (endpoint) => endpoint.project, {
    cascade: true,
  })
  endpoints?: Endpoint[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity({ name: 'endpoints' })
export class Endpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar' })
  path: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  category: string;

  /** Order within the project folder (category); lower first. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar' })
  sourceFile: string;

  /** Stable identity from scanner: e.g. `src/app/foo.controller.ts#FooController.getUser` — survives route path/category changes. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  syncAnchor: string | null;

  /** SHA-256 hex of normalized handler source — survives moving routes when body unchanged. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  handlerFingerprint: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'json', nullable: true })
  scenarios: unknown;

  @Column({ type: 'json', nullable: true })
  params: unknown;

  @Column({ type: 'json', nullable: true })
  query: unknown;

  @Column({ type: 'json', nullable: true })
  headers: unknown;

  @Column({ type: 'text', nullable: true })
  responseSummary: string | null;

  @ManyToOne(() => Project, (project) => project.endpoints, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project?: Project;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
