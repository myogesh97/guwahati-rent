// About page: the live-counts strip (PHASE-2C §2c.1-E). Counted from public_pins at run time;
// the strip stays hidden while there are too few rents, or if the request fails.
import { fetchCountRows } from '../api';
import { liveCounts, renderLiveCounts } from '../live-counts';

fetchCountRows()
  .then((rows) => renderLiveCounts(document.getElementById('about-counts'), liveCounts(rows)))
  .catch(() => {
    /* the page reads fine without it */
  });
