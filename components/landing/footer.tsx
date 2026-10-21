import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-[14px] text-muted sm:px-6">
        <p className="mr-auto">© Sentate</p>
        <Link href="/login" className="hover:text-foreground">
          Ingresar
        </Link>
        <Link href="/el-bodegon" className="hover:text-foreground">
          Demo
        </Link>
      </div>
    </footer>
  );
}
