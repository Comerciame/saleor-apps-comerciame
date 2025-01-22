import { APL, AplConfiguredResult,AplReadyResult, AuthData } from "./apl-interfaces";
import { UpstashAplMisconfiguredError, UpstashAplNotConfiguredError } from "./upstash-errors";

export const UpstashAPLVariables = {
  UPSTASH_TOKEN: "UPSTASH_TOKEN",
  UPSTASH_URL: "UPSTASH_URL",
};

export class UpstashAPL implements APL {
  private restURL?: string;
  private restToken?: string;

  constructor(config?: { restURL: string; restToken: string }) {
    const restURL =
      (config == null ? void 0 : config.restURL) || process.env[UpstashAPLVariables.UPSTASH_URL];
    const restToken =
      (config == null ? void 0 : config.restToken) ||
      process.env[UpstashAPLVariables.UPSTASH_TOKEN];

    this.restURL = restURL;
    this.restToken = restToken;
  }

  async get(appId: string): Promise<AuthData | undefined> {
    console.log("get() called with: %j", appId);
    return this.fetchDataFromUpstash(appId);
  }

  async set(authData: AuthData) {
    await this.saveDataToUpstash(authData);
  }

  async delete(saleorApiUrl: string) {
    await this.deleteDataFromUpstash(saleorApiUrl);
  }

  async getAll(): Promise<AuthData[]> {
    throw new Error("UpstashAPL does not support getAll method");
  }

  async isReady(): Promise<AplReadyResult> {
    console.log("isReady() called");
    const missingConf = [];

    if (!this.restToken) {
      missingConf.push("restToken");
    }
    if (!this.restURL) {
      missingConf.push("restURL");
    }
    if (missingConf.length > 0) {
      return {
        ready: false,
        error: new UpstashAplMisconfiguredError(missingConf),
      };
    }
    return {
      ready: true,
    };
  }

  async isConfigured(): Promise<AplConfiguredResult> {
    return this.restToken && this.restURL
      ? {
          configured: true,
        }
      : {
          configured: false,
          error: new UpstashAplNotConfiguredError(),
        };
  }

  private async upstashRequest(request: any): Promise<any> {
    if (!this.restURL || !this.restToken) {
      throw new Error(
        "UpstashAPL is not configured. See https://github.com/saleor/saleor-app-sdk/blob/main/docs/apl.md",
      );
    }

    let response;

    try {
      response = await fetch(this.restURL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.restToken}` },
        body: JSON.stringify(request),
      });
    } catch (error) {
      throw new Error(`UpstashAPL was unable to perform a request ${error}`);
    }

    const parsedResponse = await response.json();

    if (!response.ok || "error" in parsedResponse) {
      if ("error" in parsedResponse) {
        throw new Error(
          `Upstash APL was not able to perform operation. Status code: ${response.status}. Error: ${parsedResponse.error}`,
        );
      }
      throw new Error(
        `Upstash APL was not able to perform operation. Status code: ${response.status}`,
      );
    }
    return parsedResponse.result;
  }

  private async saveDataToUpstash(authData: AuthData) {
    console.log("saveDataToUpstash() called with: %j", authData);
    const url = `${this.restURL}/set/${encodeURIComponent(
      authData.saleorApiUrl,
    )}@smtp/${encodeURIComponent(JSON.stringify(authData))}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to save data to Upstash: ${response.statusText}`);
    }

    console.log("Data saved to Upstash successfully");
  }

  private async deleteDataFromUpstash(saleorApiUrl: string) {
    await this.upstashRequest(["DEL", saleorApiUrl]);
  }

  private async fetchDataFromUpstash(appId: string) {
    const url = `${this.restURL}/get/${appId}@smtp`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data from Upstash: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.result) {
      return JSON.parse(result.result);
    }

    return undefined;
  }
}
