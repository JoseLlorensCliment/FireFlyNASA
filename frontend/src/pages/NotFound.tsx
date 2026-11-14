import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-8 text-center">
      <div className="label">404</div>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <Link to="/" className="btn btn-primary mt-6">Back to dashboard</Link>
    </div>
  );
}
