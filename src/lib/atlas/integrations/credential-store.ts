/**
 * CredentialStore — encapsulates credential storage and retrieval
 * for IntegrationConfig (admin-scoped) and UserConnection (user-scoped).
 *
 * Currently stores credentials in Prisma. Future: encrypt at rest.
 */

import { prisma } from "@/lib/atlas/server/prisma";

export interface StoredCredential {
  apiKey?: string | null;
  oauthToken?: string | null;
  oauthRefresh?: string | null;
  tokenExpiresAt?: Date | null;
}

export const credentialStore = {
  async storeConfigCredential(configId: string, credential: StoredCredential): Promise<void> {
    await prisma.integrationConfig.update({
      where: { id: configId },
      data: {
        apiKey: credential.apiKey ?? null,
        oauthToken: credential.oauthToken ?? null,
        oauthRefresh: credential.oauthRefresh ?? null,
      },
    });
  },

  async storeConnectionCredential(connectionId: string, credential: StoredCredential): Promise<void> {
    await prisma.userConnection.update({
      where: { id: connectionId },
      data: {
        apiKey: credential.apiKey ?? null,
        oauthToken: credential.oauthToken ?? null,
        oauthRefresh: credential.oauthRefresh ?? null,
        tokenExpiresAt: credential.tokenExpiresAt ?? null,
      },
    });
  },

  async rotateConfigCredential(configId: string, newApiKey: string): Promise<void> {
    await prisma.integrationConfig.update({
      where: { id: configId },
      data: { apiKey: newApiKey },
    });
  },

  async rotateConnectionCredential(connectionId: string, credential: StoredCredential): Promise<void> {
    await prisma.userConnection.update({
      where: { id: connectionId },
      data: {
        oauthToken: credential.oauthToken ?? null,
        oauthRefresh: credential.oauthRefresh ?? null,
        tokenExpiresAt: credential.tokenExpiresAt ?? null,
      },
    });
  },

  async revokeConnection(connectionId: string): Promise<void> {
    await prisma.userConnection.update({
      where: { id: connectionId },
      data: {
        status: "revoked",
        oauthToken: null,
        oauthRefresh: null,
        apiKey: null,
        tokenExpiresAt: null,
      },
    });
  },
};
