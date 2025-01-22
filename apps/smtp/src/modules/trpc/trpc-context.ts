import { SALEOR_API_URL_HEADER, SALEOR_AUTHORIZATION_BEARER_HEADER } from "@saleor/app-sdk/const";
import { inferAsyncReturnType } from "@trpc/server";
import * as trpcNext from "@trpc/server/adapters/next";
import * as jose from "jose";

import { getBaseUrl } from "../../lib/get-base-url";

export const createTrpcContext = async ({ res, req }: trpcNext.CreateNextContextOptions) => {
  const baseUrl = getBaseUrl(req.headers);

  const token = req.headers[SALEOR_AUTHORIZATION_BEARER_HEADER];

  if (!token) {
    return {
      token: req.headers[SALEOR_AUTHORIZATION_BEARER_HEADER] as string | undefined,
      saleorApiUrl: req.headers[SALEOR_API_URL_HEADER] as string | undefined,
      appId: undefined as undefined | string,
      ssr: undefined as undefined | boolean,
      baseUrl,
    };
  }

  let appId;

  try {
    // Decode the JWT token to extract the appId
    const tokenClaims = jose.decodeJwt(token as string);

    if (!tokenClaims || !tokenClaims.app) {
      throw new Error("appId not found in token claims.");
    }

    appId = tokenClaims.app; // Assuming `app` is the claim containing appId
    console.log(`Extracted appId: ${appId}`);
  } catch (error) {}

  return {
    token: req.headers[SALEOR_AUTHORIZATION_BEARER_HEADER] as string | undefined,
    saleorApiUrl: req.headers[SALEOR_API_URL_HEADER] as string | undefined,
    appId,
    ssr: undefined as undefined | boolean,
    baseUrl,
  };
};

export type TrpcContext = inferAsyncReturnType<typeof createTrpcContext>;
