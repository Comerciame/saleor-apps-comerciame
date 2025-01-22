import "@saleor/macaw-ui/style";
import "../styles/globals.css";

import { AppBridge, AppBridgeProvider } from "@saleor/app-sdk/app-bridge";
import { RoutePropagator } from "@saleor/app-sdk/app-bridge/next";
import { NoSSRWrapper } from "@saleor/apps-shared";
import { ThemeProvider } from "@saleor/macaw-ui";
import { AppProps } from "next/app";
import React from "react";

import { ThemeSynchronizer } from "../lib/theme-synchronizer";
import { trpcClient } from "../modules/trpc/trpc-client";

/**
 * Ensure instance is a singleton.
 * TODO: This is React 18 issue, consider hiding this workaround inside app-sdk
 */
export const appBridgeInstance =
  typeof window !== "undefined"
    ? new AppBridge({
        // eslint-disable-next-line turbo/no-undeclared-env-vars
        saleorApiUrl: process.env.NEXT_PUBLIC_SALEOR_API_URL,
        autoNotifyReady: true,
        initialLocale: "es",
        initialTheme: "light",
      })
    : undefined;

function NextApp({ Component, pageProps }: AppProps) {
  return (
    <NoSSRWrapper>
      <AppBridgeProvider appBridgeInstance={appBridgeInstance}>
        <ThemeProvider defaultTheme="defaultLight">
          <ThemeSynchronizer />
          <RoutePropagator />
          <Component {...pageProps} />
        </ThemeProvider>
      </AppBridgeProvider>
    </NoSSRWrapper>
  );
}

export default trpcClient.withTRPC(NextApp);
