import { PasskeySignIn } from "@/components/shack/passkey-sign-in";
import { SignOutButton } from "@/components/shack/sign-out-button";
import { shackAlertClass, shackNoticeClass } from "@/components/shack/styles";
import { getSignedInEmail } from "@/lib/auth";
import { SHACK_LOGIN_ERRORS, SHACK_LOGIN_NOTICES } from "@/lib/shack";

export default async function ShackLoginPage(props: PageProps<"/shack/login">) {
  const searchParams = await props.searchParams;
  const errorCode = typeof searchParams.error === "string" ? searchParams.error : null;
  const errorMessage = errorCode === null ? null : (SHACK_LOGIN_ERRORS[errorCode] ?? null);
  const noticeCode = typeof searchParams.notice === "string" ? searchParams.notice : null;
  const noticeMessage = noticeCode === null ? null : (SHACK_LOGIN_NOTICES[noticeCode] ?? null);
  const signedInEmail = await getSignedInEmail();

  return (
    <main className="shack-surface mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold text-ink">BackToSSTV admin</h1>
        <p className="mt-1 text-sm text-ink-faint">Sign in with a passkey.</p>
      </header>

      {errorMessage === null ? null : <p className={shackAlertClass}>{errorMessage}</p>}

      {noticeMessage === null ? null : <p className={shackNoticeClass}>{noticeMessage}</p>}

      {signedInEmail === null ? null : (
        <p className="text-sm text-ink-dim">
          Signed in as <span className="font-mono text-ink">{signedInEmail}</span>.
        </p>
      )}

      <PasskeySignIn />

      {signedInEmail === null ? null : <SignOutButton />}
    </main>
  );
}
