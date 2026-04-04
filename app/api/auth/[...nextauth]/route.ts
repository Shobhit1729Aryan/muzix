import { prismaClient } from "@/app/lib/db";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn(params: any) {
      if (!params.user?.email) return false;
      try {
        await prismaClient.user.create({
          data: { email: params.user.email, provider: "Google" },
        });
      } catch (e) {
        // user exists
      }
      return true;
    },
  },
};

const handler = NextAuth(authOptions as any);
export { handler as GET, handler as POST };