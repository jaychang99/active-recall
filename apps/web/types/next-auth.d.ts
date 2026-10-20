import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    /** identity provider: "google" | "dev" */
    provider: string;
    /** stable id at the provider */
    providerSub: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    provider?: string;
    providerSub?: string;
  }
}
