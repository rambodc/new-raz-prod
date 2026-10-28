import { Link } from "react-router-dom";
import DemoData from "../app/admin/DemoData";
import ArtistImages from "../app/admin/ArtistImages";
import ShowForm from "../app/admin/ShowForm";
import ShowList from "../app/admin/ShowList";
import { useIsAdmin } from "../app/useIsAdmin";
import { listAllShows, listArtists } from "../data/api";
import { useLoad } from "../lib/hooks";

function AdminTools() {
  const shows = useLoad(listAllShows, "shows");
  const artists = useLoad(listArtists, "artists");
  const refresh = () => {
    shows.reload();
    artists.reload();
  };
  return (
    <>
      <section aria-labelledby="demo-title">
        <h2 id="demo-title" className="lb-label">
          Demo data
        </h2>
        <DemoData onChanged={refresh} />
      </section>
      <section aria-labelledby="add-title">
        <h2 id="add-title" className="lb-label">
          Add a show
        </h2>
        <ShowForm onAdded={refresh} />
      </section>
      <section aria-labelledby="shows-title">
        <h2 id="shows-title" className="lb-label">
          Shows
        </h2>
        {shows.data && <ShowList shows={shows.data} onChanged={refresh} />}
        {shows.error && !shows.data && <p className="muted">Couldn't load shows.</p>}
      </section>
      <section aria-labelledby="artists-title">
        <h2 id="artists-title" className="lb-label">
          Artist images
        </h2>
        {artists.data && <ArtistImages artists={artists.data} onChanged={artists.reload} />}
        {artists.error && !artists.data && <p className="muted">Couldn't load artists.</p>}
      </section>
    </>
  );
}

export default function Admin() {
  const { admin, loading } = useIsAdmin();
  return (
    <div className="admin">
      <Link to="/" className="back-link">
        ← Back
      </Link>
      <h1 className="lb-display">Admin</h1>
      {loading && <p className="muted">Loading…</p>}
      {!loading && !admin && <p className="muted">This page is for admins.</p>}
      {admin && <AdminTools />}
    </div>
  );
}
