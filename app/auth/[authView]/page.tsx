import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import Image from "next/image";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((authView) => ({ authView }));
}

export default async function AuthPage({ params }: { params: Promise<{ authView: string }> }) {
  const { authView } = await params; // (Note: in Next.js, `params` is usually sync; if yours is async that's fine.)
  const showGoogle = authView === "sign-in" || authView === "sign-up";

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center">
      <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <Image
          src={String(process.env.LOGO_URI)}
          alt="One League"
          fill
          className="object-contain p-1"
          priority
        />
      </div>
      <div className="mb-2 py-3 text-sm font-semibold text-gray-900">
        Trade the market. Compete on OneLeague.
      </div>

      <AuthView socialLayout="horizontal" pathname={authView} redirectTo="/dashboard" />
      {showGoogle && <GoogleSignInButton callbackURL="/dashboard" />}

    </div>
  );
}