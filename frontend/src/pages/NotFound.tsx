import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-enter mx-auto mt-20 max-w-md text-center">
      <div className="figure text-[64px] leading-none text-line-strong">404</div>
      <h1 className="display mt-4 text-2xl">This page is not in the archive</h1>
      <p className="mt-2 text-sm text-fg-2">The link may be old, or the investigation id mistyped.</p>
      <Link to="/" className="btn btn-primary mt-7 h-10 px-4"><ArrowLeft className="h-4 w-4" /> Back to dashboard</Link>
    </div>
  );
}
