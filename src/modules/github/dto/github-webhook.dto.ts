export type GithubPushWebhookPayload = {
  ref?: string;
  /** Present on push events delivered via GitHub App. */
  installation?: { id?: number };
  repository?: {
    name?: string;
    owner?: { login?: string; name?: string };
  };
};
