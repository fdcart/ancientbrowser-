import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="cb-empty" data-testid="not-found">
      <h2>Page not found</h2>
      <p>The route you requested does not exist.</p>
      <button className="cb-btn primary" type="button" onClick={() => navigate("/")} data-testid="notfound-home-btn">
        Back to Home
      </button>
    </div>
  );
}
