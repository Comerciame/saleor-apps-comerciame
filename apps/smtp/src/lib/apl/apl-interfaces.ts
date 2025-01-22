// Domain models and interfaces
export interface AuthData {
  domain?: string;
  token: string;
  saleorApiUrl: string;
  appId: string;
  dashboardUrl: string;
  jwks?: string;
}

export interface APL {
  get(appId: string): Promise<AuthData | undefined>;
  set(authData: AuthData): Promise<void>;
  delete(saleorApiUrl: string): Promise<void>;
  getAll(): Promise<AuthData[]>;
  isReady(): Promise<AplReadyResult>;
  isConfigured(): Promise<AplConfiguredResult>;
}

export type AplReadyResult =
  | {
      ready: true;
    }
  | {
      ready: false;
      error: Error;
    };

export type AplConfiguredResult =
  | {
      configured: true;
    }
  | {
      configured: false;
      error: Error;
    };
