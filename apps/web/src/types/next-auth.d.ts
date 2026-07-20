import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "customer" | "admin";
      ageAttestedAt: Date | null;
    } & DefaultSession["user"];
  }
}
