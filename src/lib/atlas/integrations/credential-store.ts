/**
 * CredentialStore — encapsulates credential storage and retrieval
 * for IntegrationConfig (admin-scoped) and UserConnection (user-scoped).
 *
 * Currently stores credentials in Prisma. Future: encrypt at rest.
 */

import { prisma } from "@/lib/atlas/server/prisma";
import { encryptSecret, decryptSecret } from "@/lib/security/secrets";

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
        apiKey: credential.apiKey ? encryptSecret(credential.apiKey, "apiKey") : null,
        oauthToken: credential.oauthToken ? encryptSecret(credential.oauthToken, "oauthToken") : null,
        oauthRefresh: credential.oauthRefresh ? encryptSecret(credential.oauthRefresh, "oauthRefresh") : null,
      },
    });
  },

  async storeConnectionCredential(connectionId: string, credential: StoredCredential): Promise<void> {
    await prisma.userConnection.update({
      where: { id: connectionId },
      data: {
        apiKey: credential.apiKey ? encryptSecret(credential.apiKey, "apiKey") : null,
        oauthToken: credential.oauthToken ? encryptSecret(credential.oauthToken, "oauthToken") : null,
        oauthRefresh: credential.oauthRefresh ? encryptSecret(credential.oauthRefresh, "oauthRefresh") : null,
        tokenExpiresAt: credential.tokenExpiresAt ?? null,
      },
    });
  },

  async rotateConfigCredential(configId: string, newApiKey: string): Promise<void> {
    await prisma.integrationConfig.update({
      where: { id: configId },
      data: { apiKey: encryptSecret(newApiKey, "apiKey") },
    });
  },

  async rotateConnectionCredential(connectionId: string, credential: StoredCredential): Promise<void> {
    await prisma.userConnection.update({
      where: { id: connectionId },
      data: {
        oauthToken: credential.oauthToken ? encryptSecret(credential.oauthToken, "oauthToken") : null,
        oauthRefresh: credential.oauthRefresh ? encryptSecret(credential.oauthRefresh, "oauthRefresh") : null,
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
