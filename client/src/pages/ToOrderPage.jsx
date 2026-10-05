import { useSectionFilter } from '../hooks/useSectionFilter.jsx';
import AllSectionsPage from './AllSectionsPage.jsx';
import CountPage from './CountPage.jsx';

/** To Order: with "All Sections" this is the per-section overview; pick a
 *  section (here or in the sidebar dropdown) to open its count screen. */
export default function ToOrderPage() {
  const { filter } = useSectionFilter();

  if (filter === 'all') return <AllSectionsPage />;
  return <CountPage sectionId={Number(filter)} />;
}
