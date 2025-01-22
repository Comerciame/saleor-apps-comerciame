import { ProtectedHandlerError } from "@saleor/app-sdk/handlers/next";
import { REQUIRED_SALEOR_PERMISSIONS } from "@saleor/apps-shared";
import { TRPCError } from "@trpc/server";
import * as jose from "jose";

import { createInstrumentedGraphqlClient } from "../../lib/create-instrumented-graphql-client";
import { createLogger } from "../../logger";
import { saleorApp } from "../../saleor-app";
import { middleware, procedure } from "./trpc-server";

const logger = createLogger("ProtectedClientProcedure");

// Helper to construct the JWKS URL from the Saleor API URL
const getJwksUrlFromSaleorApiUrl = (saleorApiUrl) =>
  `${new URL(saleorApiUrl).origin}/.well-known/jwks.json`;

// Create a custom JWKS fetcher with headers
const createCustomRemoteJWKSet = (url, headers) => {
  // Custom fetch function to add headers
  const fetchWithHeaders = async (
    input,
    init = {
      headers,
    },
  ) => {
    console.log("Fetching JWKS with headers:", init.headers);

    const response = await fetch(input, init);

    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
    }

    return response;
  };

  // Use the custom fetch in `jose.createRemoteJWKSet`
  return jose.createRemoteJWKSet(new URL(url), {
    fetch: fetchWithHeaders,
    headers,
  });
};

// JWT Verification Function
export const verifyJWTWithCustomHeaders = async ({
  saleorApiUrl,
  token,
  appId,
  requiredPermissions = [],
  dashboardUrl,
}) => {
  const ERROR_MESSAGE = "JWT verification failed:";
  const jwksUrl = getJwksUrlFromSaleorApiUrl(saleorApiUrl);

  console.log(`JWKS URL: ${jwksUrl}`);

  // Create JWKS with custom headers
  const JWKS = createCustomRemoteJWKSet(jwksUrl, {
    Origin: "https://" + dashboardUrl,
    Referer: "https://" + dashboardUrl,
  });

  let tokenClaims;

  try {
    // Decode the JWT claims (this doesn't verify the signature)
    tokenClaims = jose.decodeJwt(token);
    console.log("Decoded JWT claims:", tokenClaims);
  } catch (error) {
    throw new Error(`${ERROR_MESSAGE} Could not decode token: ${error.message}`);
  }

  // Verify the JWT signature
  try {
    await jose.jwtVerify(token, JWKS);
    console.log("JWT signature verified successfully.");
  } catch (error) {
    throw new Error(`${ERROR_MESSAGE} Signature verification failed: ${error.message}`);
  }

  // Additional validations (e.g., App ID matching)
  if (tokenClaims.app !== appId) {
    throw new Error(`${ERROR_MESSAGE} Token's app property does not match app ID.`);
  }

  return tokenClaims;
};

const attachAppToken = middleware(async ({ ctx, next }) => {
  logger.debug("attachAppToken middleware", ctx);

  if (!ctx.saleorApiUrl) {
    logger.debug("ctx.saleorApiUrl not found, throwing");

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing saleorApiUrl in request",
    });
  }

  logger.debug("Getting auth data from saleorApp", ctx);

  const authData = await saleorApp.apl.get(ctx.appId || "");

  if (!authData) {
    logger.debug("authData not found, throwing 401");

    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing auth data",
    });
  }

  return next({
    ctx: {
      appToken: authData.token,
      saleorApiUrl: authData.saleorApiUrl,
      appId: authData.appId,
    },
  });
});

const validateClientToken = middleware(async ({ ctx, next, meta }) => {
  logger.debug(
    {
      permissions: meta?.requiredClientPermissions,
    },
    "Calling validateClientToken middleware with permissions required",
  );

  if (!ctx.token) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Missing token in request. This middleware can be used only in frontend",
    });
  }

  if (!ctx.appId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Missing appId in request. This middleware can be used after auth is attached",
    });
  }

  if (!ctx.saleorApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Missing saleorApiUrl in request. This middleware can be used after auth is attached",
    });
  }

  if (!ctx.ssr) {
    try {
      logger.debug("trying to verify JWT token from frontend");
      logger.debug({ token: ctx.token ? `${ctx.token[0]}...` : undefined });

      await verifyJWTWithCustomHeaders({
        appId: ctx.appId,
        token: ctx.token,
        saleorApiUrl: ctx.saleorApiUrl,
        requiredPermissions: [
          ...REQUIRED_SALEOR_PERMISSIONS,
          ...(meta?.requiredClientPermissions || []),
        ],
        dashboardUrl: (await saleorApp.apl.get(ctx.appId || "")).dashboardUrl,
      });
    } catch (e) {
      logger.debug("JWT verification failed, throwing");
      throw new ProtectedHandlerError("JWT verification failed: ", "JWT_VERIFICATION_FAILED");
    }
  }

  return next({
    ctx: {
      ...ctx,
      saleorApiUrl: ctx.saleorApiUrl,
    },
  });
});

/**
 * Construct common graphQL client and attach it to the context
 *
 * Can be used only if called from the frontend (react-query),
 * otherwise jwks validation will fail (if createCaller used)
 *
 * TODO Rethink middleware composition to enable safe server-side router calls
 */
export const protectedClientProcedure = procedure
  .use(attachAppToken)
  .use(validateClientToken)
  .use(async ({ ctx, next }) => {
    const client = createInstrumentedGraphqlClient({
      saleorApiUrl: ctx.saleorApiUrl,
      token: ctx.appToken,
      dashboardUrl: (await saleorApp.apl.get(ctx.appId || "")).dashboardUrl,
    });

    return next({
      ctx: {
        apiClient: client,
        appToken: ctx.appToken,
        saleorApiUrl: ctx.saleorApiUrl,
        appId: ctx.appId,
        dashboardUrl: ctx.dashboardUrl,
      },
    });
  });
