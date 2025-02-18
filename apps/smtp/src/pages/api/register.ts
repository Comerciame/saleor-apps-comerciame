import { createAppRegisterHandler } from "@saleor/app-sdk/handlers/next";
import { wrapWithLoggerContext } from "@saleor/apps-logger/node";
import { withOtel } from "@saleor/apps-otel";
import { SaleorVersionCompatibilityValidator } from "@saleor/apps-shared";

import { createInstrumentedGraphqlClient } from "../../lib/create-instrumented-graphql-client";
import { createLogger } from "../../logger";
import { loggerContext } from "../../logger-context";
import { fetchSaleorVersion } from "../../modules/feature-flag-service/fetch-saleor-version";
import { REQUIRED_SALEOR_VERSION, saleorApp } from "../../saleor-app";

const allowedUrlsPattern = process.env.ALLOWED_DOMAIN_PATTERN;

/**
 * Required endpoint, called by Saleor to install app.
 * It will exchange tokens with app, so saleorApp.apl will contain token
 */
export default wrapWithLoggerContext(
  withOtel(
    createAppRegisterHandler({
      apl: saleorApp.apl,
      allowedSaleorUrls: [
        (url) => {
          if (allowedUrlsPattern) {
            const regex = new RegExp(allowedUrlsPattern);

            return regex.test(url);
          }

          return true;
        },
      ],
      async onRequestStart(request): Promise<void> {
        const originalFetch = global.fetch;

        global.fetch = async (url, options = {}) => {
          // Ensure the headers object exists
          options.headers = options.headers || {};

          const dashboardUrl = request.params.dashboardUrl;

          // Add or override specific headers for the targeted URL
          if (url.includes("api-commerce.comercia.me") && dashboardUrl) {
            options.headers = {
              ...options.headers, // Preserve existing headers
              Origin: `https://${dashboardUrl}`,
              Referer: `https://${dashboardUrl}`,
            };
          }

          // Call the original fetch with updated options
          return originalFetch(url, options);
        };
      },
      async onRequestVerified(req, { authData: { token, saleorApiUrl }, respondWithError }) {
        const logger = createLogger("onRequestVerified");

        let saleorVersion: string;

        try {
          const client = createInstrumentedGraphqlClient({
            saleorApiUrl: saleorApiUrl,
            token: token,
            dashboardUrl: req.params.dashboardUrl,
          });

          saleorVersion = await fetchSaleorVersion(client);
        } catch (e: unknown) {
          const message = (e as Error)?.message ?? "Unknown error";

          logger.debug(
            { message, saleorApiUrl },
            "Error during fetching saleor version in onRequestVerified handler",
          );

          throw respondWithError({
            message: "Couldn't communicate with Saleor API",
            status: 400,
          });
        }

        if (!saleorVersion) {
          logger.warn({ saleorApiUrl }, "No version returned from Saleor API");
          throw respondWithError({
            message: "Saleor version couldn't be fetched from the API",
            status: 400,
          });
        }

        const isVersionValid = new SaleorVersionCompatibilityValidator(
          REQUIRED_SALEOR_VERSION,
        ).isValid(saleorVersion);

        if (!isVersionValid) {
          logger.info(
            { saleorApiUrl },
            "Rejecting installation due to incompatible Saleor version",
          );
          throw respondWithError({
            message: `Saleor version (${saleorVersion}) is not compatible with this app version (${REQUIRED_SALEOR_VERSION})`,
            status: 400,
          });
        }

        logger.info("Saleor version validated successfully");
      },
    }),
    "api/register",
  ),
  loggerContext,
);
